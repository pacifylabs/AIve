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
  composeSignature,
  emojiPolicy,
  fitsNetwork,
  hashtagPolicy,
  noUnknownMentions,
  type PostOutput,
  requiresMedia,
} from '../guardrails.js';
import { type SocialSettings, signatureFor } from '../settings.js';

export const NETWORKS = ['facebook', 'instagram', 'threads', 'tiktok', 'linkedin', 'x', 'telegram', 'discord'] as const;

/**
 * A tight limit is told to the model up front, with room to spare, so the draft is not rejected for being long. Room
 * already taken by a sign-off is taken off first.
 */
export function lengthHint(network: Network, reserved = 0): string {
  const limit = NETWORK_MAX_CHARACTERS[network] - reserved;
  return limit <= 1_000 ? `Keep it under ${Math.floor(limit * 0.85)} characters.` : 'Keep it short and easy to read.';
}

/** The link is put on its own line after the words on these networks, so it takes room the model must leave. */
export const linkSpace = (network: Network): number => (['x', 'telegram', 'discord'].includes(network) ? 24 : 0);

/** Characters a sign-off takes, with the blank line before it. */
export const signatureSpace = (settings: SocialSettings, accountId: string): number => {
  const signature = signatureFor(settings, accountId);
  return signature ? signature.length + 2 : 0;
};

export const postOutputSchema = z.object({
  body: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(10).default([]),
  firstComment: z.string().max(1000).nullish(),
});

/** The checks every drafted post passes, whatever started it. */
export const postGuardrails: Guardrail<PostOutput>[] = [
  hashtagPolicy(),
  composeHashtags(),
  composeSignature(),
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
