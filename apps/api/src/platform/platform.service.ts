import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import {
  ApprovalService,
  type AutopilotChange,
  AutopilotNotAllowedError,
  AutopilotService,
  CompanyBrain,
  NotFoundError,
  type ProfileChanges,
  WorkItemNotPendingError,
} from '@ai-staff/core';
import {
  ActivityEvent,
  AuditEntry,
  CompanyProfile,
  DataSource,
  type EntityManager,
  type FactKind,
  PromotionOffer,
  SpendCap,
  StaffMember,
  StaffTaskSetting,
  WorkItem,
  withTenant,
} from '@ai-staff/db';
import type { Queue } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

/** Must match the worker's queue name and job shape (apps/worker/src/queues.ts). */
export const PLATFORM_QUEUE = 'platform';
type PlatformJob = { kind: 'prefill'; workspaceId: string };

/** Turns core's domain errors into the API's problem responses. */
async function translate<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof WorkItemNotPendingError) throw AppError.conflict(error.message);
    if (error instanceof NotFoundError) throw AppError.notFound(error.message);
    if (error instanceof AutopilotNotAllowedError) throw AppError.conflict(error.message);
    throw error;
  }
}

/** The platform core over HTTP: the approval inbox, the company brain, staff state, promotions and the spend cap. */
@Injectable()
export class PlatformService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ApprovalService) private readonly approvals: ApprovalService,
    @Inject(AutopilotService) private readonly autopilot: AutopilotService,
    @Inject(CompanyBrain) private readonly brain: CompanyBrain,
    @InjectQueue(PLATFORM_QUEUE) private readonly platformQueue: Queue<PlatformJob>,
  ) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  // ---- Inbox -------------------------------------------------------------------------------------------------

  inbox(ctx: WorkspaceContext, view: 'pending' | 'decided') {
    return this.tx(ctx, async (m) => {
      const items = await m
        .getRepository(WorkItem)
        .createQueryBuilder('item')
        .where('item.workspaceId = :workspaceId', { workspaceId: ctx.workspaceId })
        .andWhere(view === 'pending' ? "item.state = 'pending'" : "item.state <> 'pending'")
        .orderBy(view === 'pending' ? 'item.createdAt' : 'item.decidedAt', 'DESC')
        .limit(100)
        .getMany();
      const staff = await m.find(StaffMember, { where: { workspaceId: ctx.workspaceId } });
      const names = new Map(staff.map((member) => [member.id, member.displayName]));
      return items.map((item) => ({
        id: item.id,
        staffId: item.staffId,
        staffName: names.get(item.staffId) ?? 'Former staff member',
        taskType: item.taskType,
        kind: item.kind,
        title: item.title,
        payload: item.payload,
        flaggedReason: item.flaggedReason,
        state: item.state,
        editRatio: item.editRatio,
        rejectReason: item.rejectReason,
        createdAt: item.createdAt,
        decidedAt: item.decidedAt,
      }));
    });
  }

  approve(ctx: WorkspaceContext, id: string, payload?: Record<string, unknown>) {
    return translate(() => this.approvals.approve(ctx, id, payload));
  }

  reject(ctx: WorkspaceContext, id: string, reason: string) {
    return translate(() => this.approvals.reject(ctx, id, reason));
  }

  // ---- Company brain -----------------------------------------------------------------------------------------

  company(ctx: WorkspaceContext) {
    return this.brain.profile(ctx.workspaceId, ctx.userId);
  }

  updateCompany(ctx: WorkspaceContext, changes: ProfileChanges) {
    return this.brain.updateProfile(ctx, changes);
  }

  addFact(ctx: WorkspaceContext, kind: FactKind, text: string) {
    return this.brain.addFact(ctx, kind, text).then((result) => result.fact);
  }

  updateFact(ctx: WorkspaceContext, id: string, text: string) {
    return translate(() => this.brain.updateFact(ctx, id, text).then((result) => result.fact));
  }

  confirmFact(ctx: WorkspaceContext, id: string) {
    return translate(() => this.brain.confirmFact(ctx, id).then((result) => result.fact));
  }

  async removeFact(ctx: WorkspaceContext, id: string) {
    await translate(() => this.brain.removeFact(ctx, id));
  }

  /** Queues a read of the company website; the worker saves what it finds as suggestions to confirm. */
  async startPrefill(ctx: WorkspaceContext) {
    const profile = await this.tx(ctx, (m) => m.findOneBy(CompanyProfile, { workspaceId: ctx.workspaceId }));
    if (!profile?.website) throw AppError.conflict('Add your website first.');
    if (profile.prefillState === 'queued' || profile.prefillState === 'running') {
      return { prefillState: profile.prefillState };
    }
    await this.tx(ctx, (m) =>
      m.update(
        CompanyProfile,
        { id: profile.id, workspaceId: ctx.workspaceId },
        { prefillState: 'queued', prefillError: null },
      ),
    );
    await this.platformQueue.add(
      'prefill',
      { kind: 'prefill', workspaceId: ctx.workspaceId },
      {
        jobId: `prefill:${ctx.workspaceId}:${Date.now()}`,
      },
    );
    return { prefillState: 'queued' as const };
  }

  // ---- Staff and autonomy ------------------------------------------------------------------------------------

  staff(ctx: WorkspaceContext) {
    return this.tx(ctx, async (m) => {
      const members = await m.find(StaffMember, {
        where: { workspaceId: ctx.workspaceId },
        order: { createdAt: 'ASC' },
      });
      const settings = await m.find(StaffTaskSetting, { where: { workspaceId: ctx.workspaceId } });
      return members.map((member) => ({
        ...member,
        tasks: settings
          .filter((setting) => setting.staffId === member.id)
          .map(({ taskType, autonomy, schedule, demotedAt, demotedReason }) => ({
            taskType,
            autonomy,
            schedule,
            demotedAt,
            demotedReason,
          })),
      }));
    });
  }

  updateStaff(ctx: WorkspaceContext, id: string, state: 'active' | 'paused', pausedReason?: string) {
    return this.tx(ctx, async (m) => {
      const member = await m.findOneBy(StaffMember, { id, workspaceId: ctx.workspaceId });
      if (!member || member.state === 'archived') throw AppError.notFound('Staff member not found.');
      await m.update(
        StaffMember,
        { id, workspaceId: ctx.workspaceId },
        { state, pausedReason: state === 'paused' ? (pausedReason ?? 'Paused by you.') : null },
      );
      await this.audit(m, ctx, state === 'paused' ? 'staff.paused' : 'staff.resumed', id, {});
      return m.findOneByOrFail(StaffMember, { id });
    });
  }

  promotions(ctx: WorkspaceContext) {
    return this.tx(ctx, (m) =>
      m.find(PromotionOffer, {
        where: { workspaceId: ctx.workspaceId, state: 'offered' },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  decidePromotion(ctx: WorkspaceContext, id: string, accept: boolean) {
    return translate(() => this.approvals.decidePromotion(ctx, id, accept));
  }

  // ---- Autopilot ---------------------------------------------------------------------------------------------

  autopilotOverview(ctx: WorkspaceContext) {
    return this.autopilot.overview(ctx.workspaceId, ctx.userId);
  }

  configureAutopilot(ctx: WorkspaceContext, staffId: string, taskType: string, change: AutopilotChange) {
    return translate(() => this.autopilot.configure(ctx, staffId, taskType, change));
  }

  enableAutopilot(ctx: WorkspaceContext, staffId: string, taskType: string) {
    return translate(() => this.autopilot.enableNow(ctx, staffId, taskType));
  }

  stopAutopilot(ctx: WorkspaceContext, staffId: string, taskType: string) {
    return translate(() => this.autopilot.stop(ctx, staffId, taskType));
  }

  // ---- Activity and spending ---------------------------------------------------------------------------------

  activity(ctx: WorkspaceContext) {
    return this.tx(ctx, (m) =>
      m.find(ActivityEvent, { where: { workspaceId: ctx.workspaceId }, order: { createdAt: 'DESC' }, take: 100 }),
    );
  }

  spendCap(ctx: WorkspaceContext) {
    return this.tx(ctx, (m) => m.findOneBy(SpendCap, { workspaceId: ctx.workspaceId }));
  }

  setSpendCap(ctx: WorkspaceContext, monthlyCapUsd: number, alertAtPct: number) {
    return this.tx(ctx, async (m) => {
      await m.query(
        `INSERT INTO spend_caps (id, workspace_id, monthly_cap_usd, alert_at_pct)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id) DO UPDATE SET monthly_cap_usd = $3, alert_at_pct = $4, updated_at = now()`,
        [uuidv7(), ctx.workspaceId, monthlyCapUsd, alertAtPct],
      );
      await this.audit(m, ctx, 'billing.spend_cap_set', ctx.workspaceId, { monthlyCapUsd, alertAtPct });
      return m.findOneByOrFail(SpendCap, { workspaceId: ctx.workspaceId });
    });
  }

  private async audit(
    m: EntityManager,
    ctx: WorkspaceContext,
    action: string,
    target: string,
    detail: Record<string, unknown>,
  ) {
    await m.save(
      m.create(AuditEntry, { workspaceId: ctx.workspaceId, userId: ctx.userId, action, target, detail, ip: null }),
    );
  }
}
