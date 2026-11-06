import {
  allowedLinks,
  APPROVED_PAYLOAD,
  bannedTerms,
  type Effect,
  factsOnly,
  type Guardrail,
  NETWORK_MAX_CHARACTERS,
  type Network,
  type TaskContext,
} from '@ai-staff/core';
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

export const NETWORKS = ['facebook', 'instagram', 'threads', 'tiktok', 'linkedin', 'x', 'telegram', 'discord'] as const;

/** A tight limit is told to the model up front, with room to spare, so the draft is not rejected for being long. */
export function lengthHint(network: Network): string {
  const limit = NETWORK_MAX_CHARACTERS[network];
  return limit <= 1_000 ? `Keep it under ${Math.floor(limit * 0.85)} characters.` : 'Keep it short and easy to read.';
}

export const postOutputSchema = z.object({
  body: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(10).default([]),
  firstComment: z.string().max(1000).nullish(),
});

/** The checks every drafted post passes, whatever started it. */
export const postGuardrails: Guardrail<PostOutput>[] = [
  hashtagPolicy(),
  composeHashtags(),
  emojiPolicy(),
  fitsNetwork(),
  requiresMedia(),
  noUnknownMentions(),
  factsOnly<PostOutput>('body', 'firstComment'),
  allowedLinks<PostOutput>('body', 'firstComment'),
  bannedTerms<PostOutput>('body', 'firstComment'),
];

export interface PostTarget {
  accountId: string;
  accountName: string;
  mediaUrls: string[];
  scheduledFor: string;
  idempotencyKey: string;
  /** Attached by the platform when it publishes; the model is told never to write links itself. */
  linkUrl?: string | null;
  title: string;
}

/**
 * At `act` the post is queued to publish at its time. Otherwise it waits in the inbox and is queued only when a person
 * approves it, with their edits to the text, comment, pictures and time.
 */
export function postEffects(
  ctx: Pick<TaskContext, 'autonomy'>,
  post: PostOutput,
  network: Network,
  target: PostTarget,
): Effect[] {
  if (ctx.autonomy === 'act') {
    return [
      {
        type: 'createPublishIntent',
        accountId: target.accountId,
        body: post.body,
        linkUrl: target.linkUrl ?? null,
        firstComment: post.firstComment ?? null,
        media: target.mediaUrls,
        scheduledFor: target.scheduledFor,
        idempotencyKey: target.idempotencyKey,
      },
    ];
  }
  return [
    {
      type: 'createWorkItem',
      kind: 'post_draft',
      title: target.title,
      payload: {
        body: post.body,
        firstComment: post.firstComment ?? '',
        mediaUrls: target.mediaUrls.join('\n'),
        scheduledFor: target.scheduledFor,
        network,
        accountName: target.accountName,
        ...(target.linkUrl ? { link: target.linkUrl } : {}),
      },
      onApprove: [
        {
          type: 'createPublishIntent',
          accountId: target.accountId,
          body: APPROVED_PAYLOAD,
          linkUrl: target.linkUrl ?? null,
          firstComment: APPROVED_PAYLOAD,
          media: APPROVED_PAYLOAD,
          scheduledFor: APPROVED_PAYLOAD,
          idempotencyKey: target.idempotencyKey,
        },
      ],
      expiresInHours: 24 * 7,
    },
  ];
}
