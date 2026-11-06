import {
  ActivityEvent,
  type AutopilotMode,
  AuditEntry,
  type DataSource,
  type EntityManager,
  PromotionOffer,
  StaffMember,
  StaffTaskSetting,
  withTenant,
} from '@ai-staff/db';
import type { RoleRegistry } from '../roles/registry.js';
import type { TaskDefinition } from '../roles/types.js';
import { type ApprovalService, type Decider } from './approvals.js';
import {
  type AutopilotProgress,
  autoActionsInLastDay,
  autopilotProgress,
  type AutopilotRules,
  recentDecisions,
  resolveAutopilotRules,
} from './autopilot.js';
import { NotFoundError } from './brain.js';

/** The task cannot run on autopilot (it does not act outside the platform), or is not in a state that allows the change. */
export class AutopilotNotAllowedError extends Error {}

export interface AutopilotTaskView {
  staffId: string;
  staffName: string;
  taskType: string;
  taskName: string;
  autonomy: 'off' | 'draft' | 'act';
  mode: AutopilotMode;
  /** The rules in force: the owner's, with the role's where the owner set none. */
  rules: AutopilotRules;
  /** The role's own rules, so the screen can offer "reset to default". */
  defaults: AutopilotRules;
  progress: AutopilotProgress;
  /** Actions taken without approval in the last 24 hours, against `rules.maxPerDay`. */
  autoActionsToday: number;
  demotedAt: Date | null;
  demotedReason: string | null;
  /** An offer waiting for a person, for tasks in "ask" mode. */
  offerId: string | null;
}

export interface AutopilotChange {
  mode: AutopilotMode;
  /** Overrides to the role's rules. An empty object goes back to the role's own. */
  rules: Partial<AutopilotRules>;
}

const RULE_KEYS = ['approvals', 'maxMedianEditRatio', 'windowDays', 'maxPerDay'] as const;

/** Tasks that publish or send. Only these have a promotion rule, so only these can run on autopilot. */
function eligible(task: TaskDefinition<unknown, unknown>): boolean {
  return task.risk === 'acts_external' && task.promotion !== undefined;
}

/**
 * What the owner decides about unattended work: which tasks may stop waiting for approval, after what record, and how
 * much per day. The rules only ever add conditions on top of the guardrails, which keep running: a draft that fails
 * one goes to the inbox however the task is set.
 */
export class AutopilotService {
  constructor(
    private readonly db: DataSource,
    private readonly registry: RoleRegistry,
    private readonly approvals: ApprovalService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async overview(workspaceId: string, userId: string | null): Promise<AutopilotTaskView[]> {
    return withTenant(this.db, { workspaceId, userId }, async (m) => {
      const staff = await m.find(StaffMember, { where: { workspaceId }, order: { createdAt: 'ASC' } });
      const settings = await m.find(StaffTaskSetting, { where: { workspaceId } });
      const offers = await m.find(PromotionOffer, { where: { workspaceId, state: 'offered' } });
      const views: AutopilotTaskView[] = [];
      for (const member of staff) {
        if (member.state === 'archived') continue;
        for (const setting of settings.filter((row) => row.staffId === member.id)) {
          if (!this.registry.hasTask(setting.taskType)) continue;
          const { task } = this.registry.task(setting.taskType);
          if (!eligible(task)) continue;
          const offer = offers.find((row) => row.staffId === member.id && row.taskType === setting.taskType);
          views.push(await this.view(m, member, setting, task, offer?.id ?? null));
        }
      }
      return views;
    });
  }

  /** Saves the owner's mode and rules, then checks them at once, so a record that already qualifies acts today. */
  async configure(by: Decider, staffId: string, taskType: string, change: AutopilotChange) {
    const { task } = this.eligibleTask(taskType);
    await withTenant(this.db, { workspaceId: by.workspaceId, userId: by.userId }, async (m) => {
      const setting = await this.setting(m, by.workspaceId, staffId, taskType);
      const rules = this.cleanRules(task, change.rules);
      await m.save(
        Object.assign(setting, {
          autopilotMode: change.mode,
          autopilotRules: rules,
          autopilotChangedBy: by.userId,
          autopilotChangedAt: this.now(),
        }),
      );
      await this.audit(m, by, 'autopilot.configured', setting.id, { staffId, taskType, mode: change.mode, rules });
    });
    if (change.mode !== 'off') await this.approvals.evaluateOne(by.workspaceId, staffId, taskType);
    return this.one(by, staffId, taskType);
  }

  /**
   * The owner trusts the task now, without waiting for the record. Still bound by the daily limit and the guardrails,
   * and a demotion (three rejections in a row, a complaint, a reconnected account) still brings approval back.
   */
  async enableNow(by: Decider, staffId: string, taskType: string) {
    this.eligibleTask(taskType);
    await withTenant(this.db, { workspaceId: by.workspaceId, userId: by.userId }, async (m) => {
      const setting = await this.setting(m, by.workspaceId, staffId, taskType);
      if (setting.autonomy === 'off') {
        throw new AutopilotNotAllowedError('This task is turned off. Turn it on before putting it on autopilot.');
      }
      if (setting.autonomy === 'act') return;
      await m.update(
        StaffTaskSetting,
        { id: setting.id, workspaceId: by.workspaceId },
        { autonomy: 'act', consecutiveRejections: 0 },
      );
      await m.update(
        PromotionOffer,
        { workspaceId: by.workspaceId, staffId, taskType, state: 'offered' },
        { state: 'accepted', decidedBy: by.userId, decidedAt: this.now() },
      );
      await this.audit(m, by, 'autonomy.enabled_now', setting.id, { staffId, taskType });
      await this.activity(
        m,
        by.workspaceId,
        staffId,
        'autonomy.enabled_now',
        taskType,
        'is on autopilot because you chose it.',
      );
    });
    return this.one(by, staffId, taskType);
  }

  /** Back to approval, and back to "ask" so it is never switched on again without a person choosing to. */
  async stop(by: Decider, staffId: string, taskType: string) {
    this.eligibleTask(taskType);
    await withTenant(this.db, { workspaceId: by.workspaceId, userId: by.userId }, async (m) => {
      const setting = await this.setting(m, by.workspaceId, staffId, taskType);
      if (setting.autonomy === 'act') {
        await m.update(
          StaffTaskSetting,
          { id: setting.id, workspaceId: by.workspaceId },
          { autonomy: 'draft', autopilotMode: 'ask', consecutiveRejections: 0 },
        );
        await this.audit(m, by, 'autonomy.stopped', setting.id, { staffId, taskType });
        await this.activity(
          m,
          by.workspaceId,
          staffId,
          'autonomy.stopped',
          taskType,
          'is back to drafts for your approval, as you asked.',
        );
      }
    });
    return this.one(by, staffId, taskType);
  }

  private async one(by: Decider, staffId: string, taskType: string): Promise<AutopilotTaskView> {
    const views = await this.overview(by.workspaceId, by.userId);
    const found = views.find((view) => view.staffId === staffId && view.taskType === taskType);
    if (!found) throw new NotFoundError('That staff member has no such task.');
    return found;
  }

  private eligibleTask(taskType: string) {
    if (!this.registry.hasTask(taskType)) throw new NotFoundError('That task does not exist.');
    const entry = this.registry.task(taskType);
    if (!eligible(entry.task)) {
      throw new AutopilotNotAllowedError(
        `${entry.task.name} does not publish or send anything, so autopilot does not apply.`,
      );
    }
    return entry;
  }

  private async setting(m: EntityManager, workspaceId: string, staffId: string, taskType: string) {
    const staff = await m.findOneBy(StaffMember, { id: staffId, workspaceId });
    const setting = staff ? await m.findOneBy(StaffTaskSetting, { workspaceId, staffId, taskType }) : null;
    if (!staff || !setting || staff.state === 'archived')
      throw new NotFoundError('That staff member has no such task.');
    return setting;
  }

  /** Keeps only what the owner set, each number inside the platform limits. Missing keys stay the role's. */
  private cleanRules(task: TaskDefinition<unknown, unknown>, given: Partial<AutopilotRules>) {
    const resolved = resolveAutopilotRules(task.promotion!, given);
    const kept: Record<string, number> = {};
    for (const key of RULE_KEYS) if (given[key] !== undefined) kept[key] = resolved[key];
    return kept;
  }

  private async view(
    m: EntityManager,
    member: StaffMember,
    setting: StaffTaskSetting,
    task: TaskDefinition<unknown, unknown>,
    offerId: string | null,
  ): Promise<AutopilotTaskView> {
    const promotion = task.promotion!;
    const now = this.now();
    const rules = resolveAutopilotRules(promotion, setting.autopilotRules);
    const progress = autopilotProgress(await recentDecisions(m, setting, rules, now), rules);
    return {
      staffId: member.id,
      staffName: member.displayName,
      taskType: setting.taskType,
      taskName: task.name,
      autonomy: setting.autonomy,
      mode: setting.autopilotMode,
      rules,
      defaults: resolveAutopilotRules(promotion, {}),
      progress,
      autoActionsToday: await autoActionsInLastDay(m, setting, now),
      demotedAt: setting.demotedAt,
      demotedReason: setting.demotedReason,
      offerId,
    };
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

  private async activity(
    m: EntityManager,
    workspaceId: string,
    staffId: string,
    type: string,
    taskType: string,
    text: string,
  ) {
    const { task } = this.registry.task(taskType);
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId,
        actor: 'system',
        type,
        summary: `${task.name} ${text}`.slice(0, 300),
        detail: { taskType },
        costUsd: null,
      }),
    );
  }
}
