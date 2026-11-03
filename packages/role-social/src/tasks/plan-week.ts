import { APPROVED_PAYLOAD, Cancel, type TaskDefinition } from '@ai-staff/core';
import { ConnectedAccount, In, Workspace } from '@ai-staff/db';
import { z } from 'zod';
import { companyBlock, RULES, SMALL_MODEL, styleBlock } from '../prompts.js';
import { settingsOf } from '../settings.js';
import { nextWeekStart, weekDates, zonedTimeToUtc } from '../time.js';

const input = z
  .object({
    weekStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .passthrough();
type Input = z.infer<typeof input>;

const planSchema = z.object({
  items: z
    .array(
      z.object({
        accountId: z.string(),
        date: z.string().describe('The day to post, YYYY-MM-DD, inside the week.'),
        pillar: z.string().max(120),
        angle: z.string().max(300).describe('What this post is about, in one sentence, using only the company facts.'),
      }),
    )
    .min(1)
    .max(15),
});
type Plan = z.infer<typeof planSchema>;

export interface PlanItem {
  id: string;
  accountId: string;
  network: string;
  handle: string | null;
  accountName: string;
  /** ISO time the post is scheduled for, in UTC. */
  scheduledFor: string;
  pillar: string;
  angle: string;
}

/**
 * The week ahead as a list of post ideas, one per slot, for a person to approve as a whole. Approving it starts one
 * drafting run per idea. Ported in spirit from the KudiBooks composer; the platform decides dates and times, the model
 * only chooses what each post is about.
 */
export const planWeek: TaskDefinition<Input, Plan> = {
  type: 'social_media.plan_week',
  name: 'Plan the week',
  risk: 'drafts',
  defaultAutonomy: 'draft',
  triggers: [{ schedule: '0 10 * * 5' }, { person: true }],
  inputSchema: input,
  maxAttempts: 3,
  model: SMALL_MODEL,
  outputSchema: planSchema,
  async buildPrompt(ctx, { weekStart }) {
    const settings = settingsOf(ctx.staff);
    const { accounts, timezone } = await ctx.read(async (m) => ({
      accounts: settings.accountIds.length
        ? await m.find(ConnectedAccount, {
            where: { workspaceId: ctx.workspaceId, id: In(settings.accountIds), health: 'ok' },
          })
        : [],
      timezone: (await m.findOneByOrFail(Workspace, { id: ctx.workspaceId })).timezone,
    }));
    if (!accounts.length) throw new Cancel('No connected account is ready to post to.');
    const week = weekStart ?? nextWeekStart(ctx.now, timezone);
    const company = companyBlock(ctx, settings);
    return {
      system: [RULES, `You are ${ctx.staff.displayName}.`, `Company facts:\n${company.text}`].join('\n\n'),
      user: [
        `Plan the posts for the week starting ${week} (a Monday). Choose ${settings.cadence} posts for each account, spread across different days, each about one of the company's topics and each grounded in a fact above. Vary the angle.`,
        `Accounts (use these ids exactly):\n${accounts.map((a) => `- ${a.id}: ${a.name} on ${a.network}`).join('\n')}`,
        `Valid dates: ${weekDates(week).join(', ')}`,
        styleBlock(settings),
      ]
        .filter(Boolean)
        .join('\n\n'),
      factIds: company.factIds,
    };
  },
  async toEffects(ctx, plan, { weekStart }) {
    const settings = settingsOf(ctx.staff);
    const { accounts, timezone } = await ctx.read(async (m) => ({
      accounts: await m.find(ConnectedAccount, {
        where: { workspaceId: ctx.workspaceId, id: In(settings.accountIds) },
      }),
      timezone: (await m.findOneByOrFail(Workspace, { id: ctx.workspaceId })).timezone,
    }));
    const week = weekStart ?? nextWeekStart(ctx.now, timezone);
    const valid = new Set(weekDates(week));
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const used = new Map<string, number>();
    const items: PlanItem[] = [];
    for (const idea of plan.items) {
      const account = byId.get(idea.accountId);
      // The model proposes; anything for an account we do not post to, or a day outside the week, is dropped.
      if (!account || !valid.has(idea.date)) continue;
      const key = `${account.id}:${idea.date}`;
      const slot = used.get(key) ?? 0;
      used.set(key, slot + 1);
      const time = settings.postingTimes[slot % settings.postingTimes.length]!;
      items.push({
        id: `${items.length + 1}`,
        accountId: account.id,
        network: account.network,
        handle: account.username,
        accountName: account.name,
        scheduledFor: zonedTimeToUtc(idea.date, time, timezone).toISOString(),
        pillar: idea.pillar,
        angle: idea.angle,
      });
    }
    if (!items.length) {
      return [
        {
          type: 'escalate',
          title: 'The weekly plan needs you',
          reason: 'No usable post ideas came back.',
          payload: { weekStart: week },
        },
      ];
    }
    items.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    const overview = items
      .map(
        (item) =>
          `${item.scheduledFor.slice(0, 10)} · ${item.accountName} (${item.network}) · ${item.pillar}: ${item.angle}`,
      )
      .join('\n');
    return [
      {
        type: 'createWorkItem',
        kind: 'plan',
        title: `Plan for the week of ${week} (${items.length} posts)`,
        // `staffId` routes the approval event back to this staff member only.
        payload: {
          staffId: ctx.staff.id,
          weekStart: week,
          overview,
          items: items as unknown as Record<string, unknown>[],
        },
        onApprove: [{ type: 'emitEvent', event: 'social.plan_approved', payload: APPROVED_PAYLOAD }],
        expiresInHours: 24 * 6,
      },
    ];
  },
};
