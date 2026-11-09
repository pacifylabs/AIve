import { Inject, Injectable } from '@nestjs/common';
import { localDate, occurrences, type Recurrence } from '@ai-staff/core';
import { AuditEntry, DataSource, type EntityManager, PostSchedule, Workspace, withTenant } from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

/** The rules behind recurring posts: listed with their next dates, paused, resumed and removed. */
@Injectable()
export class SchedulesService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  list(ctx: WorkspaceContext) {
    return this.tx(ctx, async (m) => {
      const [rules, workspace] = await Promise.all([
        m.find(PostSchedule, { where: { workspaceId: ctx.workspaceId }, order: { createdAt: 'ASC' } }),
        m.findOneByOrFail(Workspace, { id: ctx.workspaceId }),
      ]);
      const today = localDate(new Date(), workspace.timezone);
      const horizon = localDate(new Date(Date.now() + 120 * 86_400_000), workspace.timezone);
      return rules.map((rule) => ({
        ...rule,
        // The next three dates the rule falls on, in the workspace's own calendar.
        next: occurrences(rule.rule as unknown as Recurrence, rule.startsOn, rule.endsOn, today, horizon).slice(0, 3),
      }));
    });
  }

  setPaused(ctx: WorkspaceContext, id: string, paused: boolean) {
    return this.tx(ctx, async (m) => {
      const rule = await m.findOneBy(PostSchedule, { workspaceId: ctx.workspaceId, id });
      if (!rule) throw AppError.notFound('Recurring post not found.');
      await m.update(PostSchedule, { id }, { state: paused ? 'paused' : 'active' });
      await this.audit(m, ctx, paused ? 'social.schedule_paused' : 'social.schedule_resumed', id);
      return { id, state: paused ? 'paused' : 'active' };
    });
  }

  /** Posts already made from the rule stay on the calendar, to be cancelled one by one if wanted. */
  remove(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const result = await m.delete(PostSchedule, { workspaceId: ctx.workspaceId, id });
      if (!result.affected) throw AppError.notFound('Recurring post not found.');
      await this.audit(m, ctx, 'social.schedule_deleted', id);
    });
  }

  private audit(m: EntityManager, ctx: WorkspaceContext, action: string, target: string) {
    return m.save(
      m.create(AuditEntry, { workspaceId: ctx.workspaceId, userId: ctx.userId, action, target, detail: {} }),
    );
  }
}
