import { ConnectedAccount, type EntityManager, PublishIntent, SocialPost } from '@ai-staff/db';
import type { Effect } from '../roles/types.js';

type PublishIntentEffect = Extract<Effect, { type: 'createPublishIntent' }>;

export type PublishIntentResult =
  { created: true; intentId: string; postId: string } | { created: false; reason: string };

/**
 * Writes the post and the promise to publish it, together. The same idempotency key returns the same intent, so a
 * retried run or a double approval cannot queue a second post.
 */
export async function createPublishIntent(
  m: EntityManager,
  workspaceId: string,
  staffId: string,
  effect: PublishIntentEffect,
): Promise<PublishIntentResult> {
  if (await m.existsBy(PublishIntent, { workspaceId, idempotencyKey: effect.idempotencyKey })) {
    return { created: false, reason: 'Already queued.' };
  }
  const account = await m.findOneBy(ConnectedAccount, { workspaceId, id: effect.accountId });
  if (!account) return { created: false, reason: 'That account is no longer connected.' };
  const when = new Date(effect.scheduledFor);
  if (Number.isNaN(when.getTime())) return { created: false, reason: 'The posting time is not a valid date.' };
  const body = effect.body.trim();
  if (!body) return { created: false, reason: 'The post is empty.' };

  const post = await m.save(
    m.create(SocialPost, {
      workspaceId,
      staffId,
      accountId: account.id,
      body,
      linkUrl: effect.linkUrl ?? null,
      firstComment: effect.firstComment?.trim() || null,
      media: effect.media,
      state: 'scheduled',
      scheduledFor: when,
      publishedAt: null,
      externalPostId: null,
      permalink: null,
    }),
  );
  const intent = await m.save(
    m.create(PublishIntent, {
      workspaceId,
      staffId,
      accountId: account.id,
      postId: post.id,
      idempotencyKey: effect.idempotencyKey,
      state: 'pending',
      notBefore: when,
      claimedAt: null,
      attempts: 0,
      error: null,
      externalPostId: null,
    }),
  );
  return { created: true, intentId: intent.id, postId: post.id };
}
