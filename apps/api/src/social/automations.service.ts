import { Inject, Injectable } from '@nestjs/common';
import { ConnectedAccount, DataSource, type EntityManager, In, PostAutomation, withTenant } from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

const DAY_MS = 86_400_000;

interface Fields {
  threshold: number;
  accountIds: string[];
  dailyCap: number;
  totalCap: number;
}

/** Rules that ask the staff member for an inbox draft when a post does well. They only ever draft, never post. */
@Injectable()
export class AutomationsService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  list(ctx: WorkspaceContext) {
    return this.tx(ctx, async (m) => {
      const rules = await m.find(PostAutomation, {
        where: { workspaceId: ctx.workspaceId },
        order: { createdAt: 'ASC' },
      });
      const used = (await m.query(
        `SELECT automation_id, count(*)::int AS total, count(*) FILTER (WHERE created_at > $2)::int AS today
           FROM automation_runs WHERE workspace_id = $1 GROUP BY automation_id`,
        [ctx.workspaceId, new Date(Date.now() - DAY_MS)],
      )) as { automation_id: string; total: number; today: number }[];
      return rules.map((rule) => {
        const counts = used.find((row) => row.automation_id === rule.id);
        return {
          id: rule.id,
          threshold: rule.threshold,
          accountIds: rule.accountIds,
          dailyCap: rule.dailyCap,
          totalCap: rule.totalCap,
          enabled: rule.enabled,
          drafted: counts?.total ?? 0,
          draftedToday: counts?.today ?? 0,
        };
      });
    });
  }

  create(ctx: WorkspaceContext, body: Fields) {
    return this.tx(ctx, async (m) => {
      await this.assertAccounts(m, ctx, body.accountIds);
      const rule = await m.save(
        m.create(PostAutomation, { workspaceId: ctx.workspaceId, createdBy: ctx.userId, enabled: false, ...body }),
      );
      return { id: rule.id, enabled: rule.enabled };
    });
  }

  update(ctx: WorkspaceContext, id: string, body: Partial<Fields> & { enabled?: boolean }) {
    return this.tx(ctx, async (m) => {
      const rule = await m.findOneBy(PostAutomation, { workspaceId: ctx.workspaceId, id });
      if (!rule) throw AppError.notFound('Rule not found.');
      if (body.accountIds) await this.assertAccounts(m, ctx, body.accountIds);
      await m.save(Object.assign(rule, body));
      return { id: rule.id, enabled: rule.enabled };
    });
  }

  remove(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const rule = await m.findOneBy(PostAutomation, { workspaceId: ctx.workspaceId, id });
      if (!rule) throw AppError.notFound('Rule not found.');
      await m.delete(PostAutomation, { workspaceId: ctx.workspaceId, id });
    });
  }

  private async assertAccounts(m: EntityManager, ctx: WorkspaceContext, ids: string[]) {
    if (!ids.length) return;
    const found = await m.find(ConnectedAccount, { where: { workspaceId: ctx.workspaceId, id: In(ids) } });
    if (found.length !== new Set(ids).size) {
      throw new AppError(400, 'validation_failed', 'One of those accounts is not connected.', {
        errors: [{ path: 'accountIds', message: 'One of those accounts is not connected.' }],
      });
    }
  }
}
