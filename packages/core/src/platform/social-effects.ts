import {
  ConnectedAccount,
  DomainEvent,
  type EntityManager,
  Lead,
  PublishIntent,
  SocialEngagement,
  SocialPost,
  StaffMember,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
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
  effect: PublishIntentEffect & { media: string[] },
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

/** The Sales Manager who works social leads: the longest-serving active one in the workspace. */
export async function createLead(
  m: EntityManager,
  workspaceId: string,
  effect: Extract<Effect, { type: 'createLead' }>,
): Promise<{ created: true; leadId: string } | { created: false; reason: string }> {
  const sales = await m.findOne(StaffMember, {
    where: { workspaceId, roleKey: 'sales_manager', state: 'active' },
    order: { createdAt: 'ASC' },
  });
  if (!sales) return { created: false, reason: 'There is no Sales Manager to hand this lead to.' };
  // One lead per person per source reference, so a person who comments twice is one lead.
  const existing = await m.findOneBy(Lead, { workspaceId, source: 'social', sourceRef: effect.sourceRef });
  if (existing) return { created: false, reason: 'Already a lead.' };
  const lead = await m.save(
    m.create(Lead, {
      workspaceId,
      name: effect.name,
      company: null,
      email: null,
      website: null,
      timezone: null,
      source: 'social',
      sourceRef: effect.sourceRef.slice(0, 200),
      ownerUserId: null,
      assignedStaffId: sales.id,
      state: 'new',
      notes: effect.notes,
    }),
  );
  await m.save(
    m.create(DomainEvent, {
      workspaceId,
      type: 'lead.created',
      payload: { staffId: sales.id, leadId: lead.id, source: 'social' },
      sourceRunId: null,
      dispatchedAt: null,
    }),
  );
  return { created: true, leadId: lead.id };
}

export async function updateEngagement(
  m: EntityManager,
  workspaceId: string,
  effect: Extract<Effect, { type: 'updateEngagement' }>,
): Promise<void> {
  await m.update(
    SocialEngagement,
    { workspaceId, id: effect.engagementId },
    { classification: effect.classification, state: effect.state },
  );
}

export async function recordMetrics(
  m: EntityManager,
  workspaceId: string,
  effect: Extract<Effect, { type: 'recordMetrics' }>,
  now: Date,
): Promise<void> {
  // One row per post and capture point; a retried run overwrites rather than duplicates.
  await m.query(
    `INSERT INTO social_metrics (id, workspace_id, post_id, capture, captured_at, metrics)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, post_id, capture) DO UPDATE SET captured_at = $5, metrics = $6, updated_at = now()`,
    [uuidv7(), workspaceId, effect.postId, effect.capture, now, JSON.stringify(effect.metrics)],
  );
}
