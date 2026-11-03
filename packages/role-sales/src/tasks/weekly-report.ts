import type { TaskDefinition } from '@ai-staff/core';
import { z } from 'zod';

const input = z.object({ slot: z.string().optional() }).passthrough();

export interface WeeklyReport {
  from: string;
  to: string;
  contacted: number;
  followUps: number;
  replies: number;
  interested: number;
  escalations: number;
  optOuts: number;
  bounces: number;
  spendUsd: number;
}

const DAY = 86_400_000;

/** Monday's numbers for the last seven days. No model: every figure is counted, so none can be invented. */
export const weeklyReport: TaskDefinition<z.infer<typeof input>, WeeklyReport> = {
  type: 'sales_manager.weekly_report',
  name: 'Send the weekly report',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [{ schedule: '0 8 * * 1' }, { person: true }],
  inputSchema: input,
  async execute(ctx) {
    const to = ctx.now;
    const from = new Date(to.getTime() - 7 * DAY);
    const row = await ctx.read(async (m) => {
      const rows = (await m.query(
        `SELECT
           (SELECT count(*) FROM messages msg JOIN conversations c ON c.id = msg.conversation_id
             WHERE c.workspace_id = $1 AND c.staff_id = $2 AND msg.direction = 'out' AND msg.kind = 'first'
               AND msg.delivery IN ('accepted', 'bounced') AND msg.occurred_at >= $3)::int AS contacted,
           (SELECT count(*) FROM messages msg JOIN conversations c ON c.id = msg.conversation_id
             WHERE c.workspace_id = $1 AND c.staff_id = $2 AND msg.direction = 'out' AND msg.kind = 'follow_up'
               AND msg.delivery IN ('accepted', 'bounced') AND msg.occurred_at >= $3)::int AS follow_ups,
           (SELECT count(*) FROM messages msg JOIN conversations c ON c.id = msg.conversation_id
             WHERE c.workspace_id = $1 AND c.staff_id = $2 AND msg.direction = 'in' AND msg.occurred_at >= $3)::int AS replies,
           (SELECT count(*) FROM conversations
             WHERE workspace_id = $1 AND staff_id = $2 AND last_classification = 'interested' AND updated_at >= $3)::int AS interested,
           (SELECT count(*) FROM work_items
             WHERE workspace_id = $1 AND staff_id = $2 AND kind = 'escalation' AND created_at >= $3)::int AS escalations,
           (SELECT count(*) FROM suppressions WHERE workspace_id = $1 AND reason = 'opt_out' AND created_at >= $3)::int AS opt_outs,
           (SELECT count(*) FROM messages msg JOIN conversations c ON c.id = msg.conversation_id
             WHERE c.workspace_id = $1 AND c.staff_id = $2 AND msg.delivery = 'bounced' AND msg.updated_at >= $3)::int AS bounces,
           (SELECT coalesce(sum(actual_usd), 0) FROM usage_reservations
             WHERE workspace_id = $1 AND staff_id = $2 AND state = 'settled' AND created_at >= $3)::float AS spend`,
        [ctx.workspaceId, ctx.staff.id, from],
      )) as Record<string, number>[];
      return rows[0] ?? {};
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      contacted: row.contacted ?? 0,
      followUps: row.follow_ups ?? 0,
      replies: row.replies ?? 0,
      interested: row.interested ?? 0,
      escalations: row.escalations ?? 0,
      optOuts: row.opt_outs ?? 0,
      bounces: row.bounces ?? 0,
      spendUsd: Math.round((row.spend ?? 0) * 100) / 100,
    };
  },
  toEffects(ctx, report) {
    return [
      {
        type: 'createWorkItem',
        kind: 'report',
        title: `${ctx.staff.displayName}'s week: ${report.contacted} contacted, ${report.replies} replies`,
        payload: { ...report },
        onApprove: [],
      },
    ];
  },
};
