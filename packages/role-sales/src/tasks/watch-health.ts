import type { Effect, TaskDefinition } from '@ai-staff/core';
import { z } from 'zod';

const input = z.object({ kind: z.enum(['bounce', 'complaint']), address: z.string() });
type Input = z.infer<typeof input>;

interface Health {
  kind: Input['kind'];
  bouncesInLast100: number;
  sendsCounted: number;
  complaints30Days: number;
}

/** Tasks that send email on their own once promoted, and go back to drafts when sending health drops. */
const SENDING_TASKS = ['sales_manager.first_touch', 'sales_manager.follow_up', 'sales_manager.triage_reply'];

/**
 * Auto-demotion and pauses from the role spec, on every bounce and complaint: a complaint, or a bounce rate of 5% or
 * more over the last 100 sends, takes sending back to drafts; three complaints in 30 days pause the staff member.
 */
export const watchHealth: TaskDefinition<Input, Health> = {
  type: 'sales_manager.watch_health',
  name: 'Watch sending health',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [{ event: 'mail.bounced' }, { event: 'mail.complained' }],
  inputSchema: input,
  async execute(ctx, { kind }) {
    const counts = await ctx.read(async (m) => {
      const rows = (await m.query(
        `WITH recent AS (
           SELECT msg.delivery FROM messages msg JOIN conversations c ON c.id = msg.conversation_id
            WHERE c.workspace_id = $1 AND c.staff_id = $2 AND msg.direction = 'out'
              AND msg.delivery IN ('accepted', 'bounced')
            ORDER BY msg.occurred_at DESC LIMIT 100)
         SELECT (SELECT count(*) FROM recent)::int AS sends,
                (SELECT count(*) FROM recent WHERE delivery = 'bounced')::int AS bounces,
                (SELECT count(*) FROM activity_events
                  WHERE workspace_id = $1 AND type = 'email.complaint' AND created_at >= $3)::int AS complaints`,
        [ctx.workspaceId, ctx.staff.id, new Date(ctx.now.getTime() - 30 * 86_400_000)],
      )) as { sends: number; bounces: number; complaints: number }[];
      return rows[0] ?? { sends: 0, bounces: 0, complaints: 0 };
    });
    return { kind, bouncesInLast100: counts.bounces, sendsCounted: counts.sends, complaints30Days: counts.complaints };
  },
  toEffects(_ctx, health) {
    const effects: Effect[] = [];
    // Twenty sends is the least that makes a rate meaningful; below that one bounce would be "5%".
    const bounceRate = health.sendsCounted >= 20 ? health.bouncesInLast100 / health.sendsCounted : 0;
    if (health.kind === 'complaint' || bounceRate >= 0.05) {
      const why =
        health.kind === 'complaint'
          ? 'someone marked an email as spam.'
          : `${Math.round(bounceRate * 100)}% of the last ${health.sendsCounted} emails bounced.`;
      effects.push({ type: 'demote', taskTypes: SENDING_TASKS, reason: why });
    }
    if (health.complaints30Days >= 3) {
      effects.push({
        type: 'pauseStaff',
        reason: 'Three spam complaints in 30 days. Sending is stopped until the platform team reviews it.',
      });
    }
    return effects;
  },
};
