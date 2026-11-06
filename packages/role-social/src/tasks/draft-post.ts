import { Cancel, type TaskDefinition } from '@ai-staff/core';
import { ConnectedAccount } from '@ai-staff/db';
import { z } from 'zod';
import type { PostOutput } from '../guardrails.js';
import { companyBlock, EMOJI_RULE, RULES, SMALL_MODEL, styleBlock } from '../prompts.js';
import { settingsOf } from '../settings.js';
import { lengthHint, NETWORKS, postEffects, postGuardrails, postOutputSchema, signatureSpace } from './post-shared.js';

const input = z.object({
  planItemId: z.string().optional(),
  accountId: z.uuid(),
  network: z.enum(NETWORKS),
  handle: z.string().nullish(),
  accountName: z.string().optional(),
  scheduledFor: z.string(),
  pillar: z.string(),
  angle: z.string(),
  mediaUrls: z
    .array(z.url({ protocol: /^https$/ }))
    .max(10)
    .default([]),
});
type Input = z.infer<typeof input>;

/**
 * One post for one account, from one plan idea. At `act` it is queued to publish at its time; otherwise it waits in
 * the inbox and is queued only when a person approves it, with their edits to the text, comment, pictures and time.
 */
export const draftPost: TaskDefinition<Input, PostOutput> = {
  type: 'social_media.draft_post',
  name: 'Write a post',
  risk: 'acts_external',
  defaultAutonomy: 'draft',
  triggers: [{ person: true }],
  inputSchema: input,
  maxAttempts: 3,
  model: SMALL_MODEL,
  outputSchema: postOutputSchema,
  async buildPrompt(ctx, task) {
    const settings = settingsOf(ctx.staff);
    const account = await ctx.read((m) =>
      m.findOneBy(ConnectedAccount, { workspaceId: ctx.workspaceId, id: task.accountId }),
    );
    if (!account) throw new Cancel('That account is no longer connected.');
    if (account.health === 'broken') throw new Cancel('That account needs to be reconnected first.');
    const company = companyBlock(ctx, settings);
    return {
      system: [
        RULES,
        `You are ${ctx.staff.displayName}.`,
        EMOJI_RULE[settings.emoji],
        `Company facts:\n${company.text}`,
      ].join('\n\n'),
      user: [
        `Write one post for ${account.name} on ${task.network}. Topic: ${task.pillar}. Angle: ${task.angle}.`,
        lengthHint(task.network, signatureSpace(settings, task.accountId)),
        settings.hashtags.max
          ? `Suggest at most ${settings.hashtags.max} hashtags, without the # sign.`
          : 'Do not use hashtags.',
        'You may add a first comment (for example, where to find more), or leave it empty.',
        styleBlock(settings),
      ]
        .filter(Boolean)
        .join('\n\n'),
      factIds: company.factIds,
    };
  },
  guardrails: postGuardrails,
  async toEffects(ctx, post, task) {
    const account = await ctx.read((m) =>
      m.findOneByOrFail(ConnectedAccount, { workspaceId: ctx.workspaceId, id: task.accountId }),
    );
    return postEffects(ctx, post, task.network, {
      accountId: task.accountId,
      accountName: account.name,
      mediaUrls: task.mediaUrls,
      scheduledFor: task.scheduledFor,
      idempotencyKey: `post:${task.accountId}:${task.scheduledFor}`,
      title: `Post to ${account.name} on ${task.scheduledFor.slice(0, 10)}`,
    });
  },
  promotion: { approvals: 20, maxMedianEditRatio: 0.15, windowDays: 30 },
};
