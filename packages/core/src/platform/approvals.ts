import {
  ActivityEvent,
  asSystem,
  AuditEntry,
  type DataSource,
  type EntityManager,
  PromotionOffer,
  StaffMember,
  StaffTaskSetting,
  WorkItem,
  withTenant,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import type { RoleRegistry } from '../roles/registry.js';
import type { Effect } from '../roles/types.js';
import { EffectExecutor, withApprovedPayload } from './effects.js';

export class WorkItemNotPendingError extends Error {}

/** Rejections in a row, of actions a staff member took on its own, that send the task back to drafts. */
export const DEMOTE_AFTER_REJECTIONS = 3;

/**
 * Share of the text a person changed, from 0 (approved as written) to 1 (rewritten). Word-level edit distance over the
 * payload's text, which is what promotion scoring compares against the role's threshold.
 */
export function editRatio(before: Record<string, unknown>, after: Record<string, unknown>): number {
  const words = (value: Record<string, unknown>) =>
    Object.values(value)
      .filter((field): field is string => typeof field === 'string')
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
  const a = words(before);
  const b = words(after);
  if (!a.length && !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return Math.min(1, previous[b.length]! / Math.max(a.length, b.length));
}

interface Decider {
  workspaceId: string;
  userId: string;
  ip?: string | null;
}

/**
 * The approval inbox and autonomy. Approve runs the item's follow-up effects with what the person approved; reject
 * records why; three rejections in a row of a task acting on its own demote it to drafts. Promotion is evaluated
 * nightly and only ever offered; a person accepts it.
 */
export class ApprovalService {
  private readonly effects = new EffectExecutor();

  constructor(
    private readonly db: DataSource,
    private readonly registry: RoleRegistry,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async approve(by: Decider, workItemId: string, editedPayload?: Record<string, unknown>) {
    return withTenant(this.db, { workspaceId: by.workspaceId, userId: by.userId }, async (m) => {
      const item = await this.lockPending(m, by.workspaceId, workItemId);
      const payload = editedPayload ?? item.payload;
      const ratio = editedPayload ? editRatio(item.original, editedPayload) : 0;
      const edited = ratio > 0;

      // save rather than update: TypeORM's update typing cannot take a free-form JSON object for a jsonb column.
      await m.save(
        Object.assign(item, {
          state: edited ? 'edited' : 'approved',
          payload,
          editRatio: ratio,
          decidedBy: by.userId,
          decidedAt: this.now(),
        }),
      );
      await this.effects.execute(
        m,
        {
          workspaceId: by.workspaceId,
          staffId: item.staffId,
          taskType: item.taskType,
          taskRunId: item.taskRunId,
          profileVersion: item.profileVersion,
          factIds: item.factIds,
          actor: `user:${by.userId}`,
        },
        withApprovedPayload(item.onApprove as Effect[], payload),
      );
      await m.update(
        StaffTaskSetting,
        { workspaceId: by.workspaceId, staffId: item.staffId, taskType: item.taskType },
        { consecutiveRejections: 0 },
      );
      await this.audit(m, by, edited ? 'work_item.edited_and_approved' : 'work_item.approved', item.id, {
        editRatio: ratio,
      });
      return { id: item.id, state: edited ? ('edited' as const) : ('approved' as const), editRatio: ratio };
    });
  }

  async reject(by: Decider, workItemId: string, reason: string) {
    return withTenant(this.db, { workspaceId: by.workspaceId, userId: by.userId }, async (m) => {
      const item = await this.lockPending(m, by.workspaceId, workItemId);
      await m.update(
        WorkItem,
        { id: item.id, workspaceId: by.workspaceId },
        { state: 'rejected', rejectReason: reason.slice(0, 500), decidedBy: by.userId, decidedAt: this.now() },
      );
      await this.audit(m, by, 'work_item.rejected', item.id, { reason });
      await this.recordRejection(m, by.workspaceId, item.staffId, item.taskType);
      return { id: item.id, state: 'rejected' as const };
    });
  }

  /**
   * Counts a rejection against the task, and demotes it to drafts after three in a row while it acts on its own.
   * Also the hook for the other demotion triggers (complaints, bounces, a reconnected account) in later milestones.
   */
  async recordRejection(m: EntityManager, workspaceId: string, staffId: string, taskType: string): Promise<void> {
    const setting = await m.findOneBy(StaffTaskSetting, { workspaceId, staffId, taskType });
    if (!setting) return;
    const count = setting.consecutiveRejections + 1;
    await m.update(StaffTaskSetting, { id: setting.id, workspaceId }, { consecutiveRejections: count });
    if (setting.autonomy === 'act' && count >= DEMOTE_AFTER_REJECTIONS) {
      await this.demote(m, workspaceId, staffId, taskType, `${count} of its actions in a row were rejected.`);
    }
  }

  async demote(m: EntityManager, workspaceId: string, staffId: string, taskType: string, reason: string) {
    await m.update(
      StaffTaskSetting,
      { workspaceId, staffId, taskType },
      { autonomy: 'draft', demotedAt: this.now(), demotedReason: reason.slice(0, 300), consecutiveRejections: 0 },
    );
    const { task } = this.registry.task(taskType);
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId,
        actor: 'system',
        type: 'autonomy.demoted',
        summary: `${task.name} is back to drafts for your approval: ${reason}`.slice(0, 300),
        detail: { taskType },
        costUsd: null,
      }),
    );
  }

  /**
   * Nightly: offers promotion for tasks with a clean record. Offered, never applied: only a person accepts. A task
   * demoted inside the window is not offered again until its record is clean after the demotion.
   */
  async evaluatePromotions(): Promise<number> {
    const now = this.now();
    return asSystem(this.db, 'promotion evaluator: offer promotions for tasks with a clean record', async (m) => {
      const candidates = await m.find(StaffTaskSetting, { where: { autonomy: 'draft' } });
      let offered = 0;
      for (const setting of candidates) {
        if (!this.registry.hasTask(setting.taskType)) continue;
        const { task } = this.registry.task(setting.taskType);
        const rule = task.promotion;
        if (!rule || task.risk !== 'acts_external') continue;

        const since = new Date(now.getTime() - rule.windowDays * 86_400_000);
        const from = setting.demotedAt && setting.demotedAt > since ? setting.demotedAt : since;
        const rows = (await m.query(
          `SELECT state, edit_ratio::float AS ratio FROM work_items
            WHERE workspace_id = $1 AND staff_id = $2 AND task_type = $3 AND decided_at >= $4
              AND state IN ('approved', 'edited', 'rejected')`,
          [setting.workspaceId, setting.staffId, setting.taskType, from],
        )) as { state: string; ratio: number | null }[];
        const approvals = rows.filter((row) => row.state !== 'rejected');
        if (approvals.length < rule.approvals || rows.some((row) => row.state === 'rejected')) continue;

        const ratios = approvals.map((row) => row.ratio ?? 0).sort((a, b) => a - b);
        const median = ratios[Math.floor(ratios.length / 2)] ?? 0;
        if (median > rule.maxMedianEditRatio) continue;

        const inserted = (await m.query(
          `INSERT INTO promotion_offers (id, workspace_id, staff_id, task_type, evidence)
           VALUES ($5, $1, $2, $3, $4)
           ON CONFLICT (staff_id, task_type) WHERE state = 'offered' DO NOTHING RETURNING id`,
          [
            setting.workspaceId,
            setting.staffId,
            setting.taskType,
            JSON.stringify({ approvals: approvals.length, medianEditRatio: median, windowDays: rule.windowDays }),
            uuidv7(),
          ],
        )) as { id: string }[];
        if (!inserted.length) continue;
        offered += 1;
        await m.save(
          m.create(ActivityEvent, {
            workspaceId: setting.workspaceId,
            staffId: setting.staffId,
            actor: 'system',
            type: 'autonomy.promotion_offered',
            summary: `${task.name} has a clean record: ${approvals.length} approvals. You can let it act on its own.`,
            detail: { taskType: setting.taskType },
            costUsd: null,
          }),
        );
      }
      return offered;
    });
  }

  async decidePromotion(by: Decider, offerId: string, accept: boolean) {
    return withTenant(this.db, { workspaceId: by.workspaceId, userId: by.userId }, async (m) => {
      const offer = await m.findOneBy(PromotionOffer, { id: offerId, workspaceId: by.workspaceId, state: 'offered' });
      if (!offer) throw new WorkItemNotPendingError('That promotion is no longer on offer.');
      await m.update(
        PromotionOffer,
        { id: offer.id, workspaceId: by.workspaceId },
        { state: accept ? 'accepted' : 'declined', decidedBy: by.userId, decidedAt: this.now() },
      );
      if (accept) {
        await m.update(
          StaffTaskSetting,
          { workspaceId: by.workspaceId, staffId: offer.staffId, taskType: offer.taskType },
          { autonomy: 'act', consecutiveRejections: 0 },
        );
      }
      await this.audit(m, by, accept ? 'autonomy.promoted' : 'autonomy.promotion_declined', offer.id, {
        staffId: offer.staffId,
        taskType: offer.taskType,
      });
      return { id: offer.id, state: accept ? ('accepted' as const) : ('declined' as const) };
    });
  }

  private async lockPending(m: EntityManager, workspaceId: string, id: string): Promise<WorkItem> {
    const item = await m
      .getRepository(WorkItem)
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.id = :id AND item.workspaceId = :workspaceId', { id, workspaceId })
      .getOne();
    if (!item || item.state !== 'pending') throw new WorkItemNotPendingError('That item has already been decided.');
    const staff = await m.findOneBy(StaffMember, { id: item.staffId, workspaceId });
    if (!staff) throw new WorkItemNotPendingError('The staff member for that item no longer exists.');
    return item;
  }

  private async audit(m: EntityManager, by: Decider, action: string, target: string, detail: Record<string, unknown>) {
    await m.save(
      m.create(AuditEntry, {
        workspaceId: by.workspaceId,
        userId: by.userId,
        action,
        target,
        detail,
        ip: by.ip ?? null,
      }),
    );
  }
}
