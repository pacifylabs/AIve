import { Inject, Injectable } from '@nestjs/common';
import { engagementOf, reachOf, requestRepurpose } from '@ai-staff/core';
import { DataSource, SocialPost, StaffMember, withTenant } from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

const DAY_MS = 86_400_000;
const SCANNED = 500;

interface Row {
  id: string;
  account_id: string;
  body: string;
  published_at: Date;
  permalink: string | null;
  name: string;
  network: string;
  capture: string;
  metrics: Record<string, number>;
}

/** How posts did, and asking the staff member to build on the ones that did well. */
@Injectable()
export class PostResultsService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private tx<T>(ctx: WorkspaceContext, work: Parameters<typeof withTenant<T>>[2]) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  /** The best posts of the last `days` days by likes, comments and shares, each on its fullest reading. */
  top(ctx: WorkspaceContext, input: { days: number; limit: number }) {
    return this.tx(ctx, async (m) => {
      const since = new Date(Date.now() - input.days * DAY_MS);
      const rows = (await m.query(
        `SELECT p.id, p.account_id, p.body, p.published_at, p.permalink, a.name, a.network, x.capture, x.metrics
           FROM social_posts p
           JOIN connected_accounts a ON a.id = p.account_id
           JOIN LATERAL (SELECT capture, metrics FROM social_metrics
                          WHERE post_id = p.id ORDER BY capture DESC LIMIT 1) x ON true
          WHERE p.workspace_id = $1 AND p.state = 'published' AND p.published_at >= $2
          ORDER BY p.published_at DESC LIMIT $3`,
        [ctx.workspaceId, since, SCANNED],
      )) as Row[];
      return rows
        .map((row) => ({
          postId: row.id,
          accountId: row.account_id,
          accountName: row.name,
          network: row.network,
          body: row.body,
          publishedAt: row.published_at,
          permalink: row.permalink,
          capture: row.capture,
          metrics: row.metrics,
          engagement: engagementOf(row.metrics),
          reach: reachOf(row.metrics),
        }))
        .sort((a, b) => b.engagement - a.engagement || b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, input.limit);
    });
  }

  /** Each account asked for gets a draft in the inbox; one that cannot be asked for is named with the reason. */
  repurpose(ctx: WorkspaceContext, postId: string, input: { requestId: string; accountIds?: string[] | undefined }) {
    return this.tx(ctx, async (m) => {
      const post = await m.findOneBy(SocialPost, { workspaceId: ctx.workspaceId, id: postId });
      if (!post) throw AppError.notFound('That post does not exist.');
      const staff = await m.findOne(StaffMember, {
        where: { workspaceId: ctx.workspaceId, roleKey: 'social_media', state: 'active' },
        order: { createdAt: 'ASC' },
      });
      if (!staff) throw AppError.conflict('Hire a Social Media Staff member first.');
      let requested = 0;
      const skipped: { accountId: string; reason: string }[] = [];
      for (const accountId of input.accountIds ?? [post.accountId]) {
        const result = await requestRepurpose(m, {
          workspaceId: ctx.workspaceId,
          staffId: staff.id,
          postId,
          accountId,
          requestId: input.requestId,
        });
        if (result.requested) requested += 1;
        else skipped.push({ accountId, reason: result.reason });
      }
      if (!requested) throw AppError.conflict(skipped[0]?.reason ?? 'Nothing to write.');
      return { requested, skipped };
    });
  }
}
