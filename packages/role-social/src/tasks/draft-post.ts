import {
  allowedLinks,
  APPROVED_PAYLOAD,
  bannedTerms,
  Cancel,
  type Effect,
  factsOnly,
  NETWORK_MAX_CHARACTERS,
  type Network,
  type TaskDefinition,
} from '@ai-staff/core';
import { ConnectedAccount } from '@ai-staff/db';
import { z } from 'zod';
import {
  composeHashtags,
  emojiPolicy,
  fitsNetwork,
  hashtagPolicy,
  noUnknownMentions,
  type PostOutput,
  requiresMedia,
} from '../guardrails.js';
import { companyBlock, EMOJI_RULE, RULES, SMALL_MODEL, styleBlock } from '../prompts.js';
import { settingsOf } from '../settings.js';

const input = z.object({
  planItemId: z.string().optional(),
  accountId: z.uuid(),
  network: z.enum(['facebook', 'instagram', 'linkedin', 'x', 'bluesky', 'mastodon', 'telegram', 'discord']),
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

/** A tight limit is told to the model up front, with room to spare, so the draft is not rejected for being long. */
function lengthHint(network: Network): string {
  const limit = NETWORK_MAX_CHARACTERS[network];
  return limit <= 1_000 ? `Keep it under ${Math.floor(limit * 0.85)} characters.` : 'Keep it short and easy to read.';
}

const outputSchema = z.object({
  body: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(10).default([]),
  firstComment: z.string().max(1000).nullish(),
});

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
  outputSchema,
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
        lengthHint(task.network),
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
  guardrails: [
    hashtagPolicy(),
    composeHashtags(),
    emojiPolicy(),
    fitsNetwork(),
    requiresMedia(),
    noUnknownMentions(),
    factsOnly<PostOutput>('body', 'firstComment'),
    allowedLinks<PostOutput>('body', 'firstComment'),
    bannedTerms<PostOutput>('body', 'firstComment'),
  ],
  async toEffects(ctx, post, task) {
    const account = await ctx.read((m) =>
      m.findOneByOrFail(ConnectedAccount, { workspaceId: ctx.workspaceId, id: task.accountId }),
    );
    const idempotencyKey = `post:${task.accountId}:${task.scheduledFor}`;
    if (ctx.autonomy === 'act') {
      return [
        {
          type: 'createPublishIntent',
          accountId: task.accountId,
          body: post.body,
          firstComment: post.firstComment ?? null,
          media: task.mediaUrls,
          scheduledFor: task.scheduledFor,
          idempotencyKey,
        },
      ] satisfies Effect[];
    }
    return [
      {
        type: 'createWorkItem',
        kind: 'post_draft',
        title: `Post to ${account.name} on ${task.scheduledFor.slice(0, 10)}`,
        payload: {
          body: post.body,
          firstComment: post.firstComment ?? '',
          mediaUrls: task.mediaUrls.join('\n'),
          scheduledFor: task.scheduledFor,
          network: task.network,
          accountName: account.name,
        },
        onApprove: [
          {
            type: 'createPublishIntent',
            accountId: task.accountId,
            body: APPROVED_PAYLOAD,
            firstComment: APPROVED_PAYLOAD,
            media: APPROVED_PAYLOAD,
            scheduledFor: APPROVED_PAYLOAD,
            idempotencyKey,
          },
        ],
        expiresInHours: 24 * 7,
      },
    ];
  },
  promotion: { approvals: 20, maxMedianEditRatio: 0.15, windowDays: 30 },
};
