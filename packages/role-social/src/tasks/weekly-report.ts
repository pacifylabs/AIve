import type { TaskDefinition } from '@ai-staff/core';
import { z } from 'zod';

const input = z.object({ slot: z.string().optional() }).passthrough();

export interface SocialReport {
  from: string;
  to: string;
  published: number;
  failed: number;
  comments: number;
  messages: number;
  buyingIntent: number;
  leadsPassedOn: number;
  repliesDrafted: number;
  spendUsd: number;
  best: { permalink: string | null; account: string; score: number } | null;
}

const DAY = 86_400_000;

/** Monday's numbers for the last seven days. No model: every figure is counted, so none can be invented. */
export const weeklyReport: TaskDefinition<z.infer<typeof input>, SocialReport> = {
  type: 'social_media.weekly_report',
  name: 'Send the weekly report',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [{ schedule: '0 8 * * 1' }, { person: true }],
  inputSchema: input,
  async execute(ctx) {
    const to = ctx.now;
    const from = new Date(to.getTime() - 7 * DAY);
    const { counts, best } = await ctx.read(async (m) => {
      const counts =
        (
          (await m.query(
            `SELECT
           (SELECT count(*) FROM social_posts WHERE workspace_id = $1 AND staff_id = $2 AND state = 'published' AND published_at >= $3)::int AS published,
           (SELECT count(*) FROM social_posts WHERE workspace_id = $1 AND staff_id = $2 AND state = 'failed' AND updated_at >= $3)::int AS failed,
           (SELECT count(*) FROM social_engagements WHERE workspace_id = $1 AND kind = 'comment' AND received_at >= $3)::int AS comments,
           (SELECT count(*) FROM social_engagements WHERE workspace_id = $1 AND kind = 'dm' AND received_at >= $3)::int AS messages,
           (SELECT count(*) FROM social_engagements WHERE workspace_id = $1 AND classification = 'buying_intent' AND received_at >= $3)::int AS buying,
           (SELECT count(*) FROM leads WHERE workspace_id = $1 AND source = 'social' AND created_at >= $3)::int AS leads,
           (SELECT count(*) FROM work_items WHERE workspace_id = $1 AND staff_id = $2 AND kind = 'reply_draft' AND created_at >= $3)::int AS replies,
           (SELECT coalesce(sum(actual_usd), 0) FROM usage_reservations WHERE workspace_id = $1 AND staff_id = $2 AND state = 'settled' AND created_at >= $3)::float AS spend`,
            [ctx.workspaceId, ctx.staff.id, from],
          )) as Record<string, number>[]
        )[0] ?? {};
      const top = (
        (await m.query(
          `SELECT p.permalink, a.name AS account,
                coalesce((x.metrics->>'reactions')::int, (x.metrics->>'likes')::int, (x.metrics->>'like_count')::int, 0)
                  + coalesce((x.metrics->>'comments')::int, (x.metrics->>'reply_count')::int, 0)
                  + coalesce((x.metrics->>'shares')::int, (x.metrics->>'retweet_count')::int, 0) AS score
           FROM social_metrics x JOIN social_posts p ON p.id = x.post_id JOIN connected_accounts a ON a.id = p.account_id
          WHERE x.workspace_id = $1 AND p.staff_id = $2 AND p.published_at >= $3
          ORDER BY score DESC LIMIT 1`,
          [ctx.workspaceId, ctx.staff.id, from],
        )) as { permalink: string | null; account: string; score: number }[]
      )[0];
      return { counts, best: top && top.score > 0 ? top : null };
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      published: counts.published ?? 0,
      failed: counts.failed ?? 0,
      comments: counts.comments ?? 0,
      messages: counts.messages ?? 0,
      buyingIntent: counts.buying ?? 0,
      leadsPassedOn: counts.leads ?? 0,
      repliesDrafted: counts.replies ?? 0,
      spendUsd: Math.round((counts.spend ?? 0) * 100) / 100,
      best,
    };
  },
  toEffects(ctx, report) {
    return [
      {
        type: 'createWorkItem',
        kind: 'report',
        title: `${ctx.staff.displayName}'s week: ${report.published} posts, ${report.comments + report.messages} conversations`,
        payload: { ...report },
        onApprove: [],
      },
    ];
  },
};
