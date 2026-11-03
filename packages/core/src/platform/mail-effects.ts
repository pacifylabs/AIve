import {
  Conversation,
  type EntityManager,
  In,
  Lead,
  LeadResearch,
  Mailbox,
  Message,
  Not,
  SendIntent,
  StaffMember,
  type SuppressionReason,
} from '@ai-staff/db';
import { domainOf, normaliseEmail } from '@ai-staff/mail';
import { v7 as uuidv7 } from 'uuid';
import type { Effect } from '../roles/types.js';

type SendIntentEffect = Extract<Effect, { type: 'createSendIntent' }>;

/** What a send-intent effect did, for the activity log. */
export type SendIntentResult =
  { created: true; intentId: string; conversationId: string } | { created: false; reason: string };

/** The mailbox a staff member sends from lives in its role settings. */
export function mailboxIdOf(staff: StaffMember): string | null {
  const value = staff.settings.mailboxId;
  return typeof value === 'string' && value ? value : null;
}

/**
 * Writes the outgoing message and the promise to send it, together. The same idempotency key returns the same intent,
 * so a retried run or a double approval cannot queue a second email.
 */
export async function createSendIntent(
  m: EntityManager,
  workspaceId: string,
  staffId: string,
  effect: SendIntentEffect,
): Promise<SendIntentResult> {
  const existing = await m.findOneBy(SendIntent, { workspaceId, idempotencyKey: effect.idempotencyKey });
  if (existing) return { created: false, reason: 'Already queued.' };

  const staff = await m.findOneByOrFail(StaffMember, { workspaceId, id: staffId });
  const mailboxId = mailboxIdOf(staff);
  const mailbox = mailboxId ? await m.findOneBy(Mailbox, { workspaceId, id: mailboxId }) : null;
  if (!mailbox) return { created: false, reason: `${staff.displayName} has no mailbox.` };
  const lead = await m.findOneBy(Lead, { workspaceId, id: effect.leadId });
  if (!lead?.email) return { created: false, reason: 'The lead has no email address.' };

  let conversation = await m.findOne(Conversation, {
    where: { workspaceId, leadId: lead.id, state: Not('closed') },
    lock: { mode: 'pessimistic_write' },
  });
  if (!conversation) {
    if (effect.kind !== 'first') return { created: false, reason: 'The conversation has ended.' };
    conversation = await m.save(
      m.create(Conversation, {
        workspaceId,
        leadId: lead.id,
        staffId,
        mailboxId: mailbox.id,
        recipientEmail: normaliseEmail(lead.email),
        subject: effect.subject.slice(0, 300),
        state: 'active',
        handledBy: 'staff',
        stateVersion: 1,
        lastClassification: null,
        needsHumanReason: null,
        lastMessageAt: null,
      }),
    );
  } else if (effect.conversationVersion !== null && effect.conversationVersion !== conversation.stateVersion) {
    return { created: false, reason: 'The conversation moved on since this was written.' };
  } else if (conversation.handledBy === 'human') {
    return { created: false, reason: 'A person is handling this conversation.' };
  }

  // A reply threads under their latest message; anything else under the latest message either way. Ordered by when
  // we stored it: an inbound message's own date comes from the sender's clock.
  const last = await m.findOne(Message, {
    where: {
      workspaceId,
      conversationId: conversation.id,
      ...(effect.kind === 'reply' ? { direction: 'in' as const } : {}),
    },
    order: { createdAt: 'DESC' },
  });
  const signature = staff.signature?.trim();
  const message = await m.save(
    m.create(Message, {
      workspaceId,
      conversationId: conversation.id,
      direction: 'out',
      kind: effect.kind,
      author: 'staff',
      authorUserId: null,
      subject: effect.subject.slice(0, 300),
      body: signature ? `${effect.body.trim()}\n\n${signature}` : effect.body.trim(),
      messageIdHeader: `<${uuidv7()}@${domainOf(mailbox.address) || 'localhost'}>`,
      inReplyTo: last?.messageIdHeader ?? null,
      occurredAt: new Date(),
      delivery: 'queued',
    }),
  );
  const intent = await m.save(
    m.create(SendIntent, {
      workspaceId,
      staffId,
      mailboxId: mailbox.id,
      conversationId: conversation.id,
      messageId: message.id,
      idempotencyKey: effect.idempotencyKey,
      conversationVersion: conversation.stateVersion,
      byHuman: false,
      state: 'pending',
      notBefore: new Date(),
      claimedAt: null,
      attempts: 0,
      error: null,
      providerMessageId: null,
    }),
  );
  if (lead.state === 'new' || lead.state === 'researching' || lead.state === 'queued') {
    await m.update(Lead, { workspaceId, id: lead.id }, { state: 'contacting' });
  }
  return { created: true, intentId: intent.id, conversationId: conversation.id };
}

/** Closes a conversation and drops everything still waiting to go out in it. */
export async function closeConversation(m: EntityManager, conversation: Conversation, reason: string): Promise<void> {
  await m.update(
    Conversation,
    { workspaceId: conversation.workspaceId, id: conversation.id },
    { state: 'closed', needsHumanReason: reason.slice(0, 300), stateVersion: conversation.stateVersion + 1 },
  );
  await cancelPendingSends(m, conversation, reason, true);
}

/** Cancels queued sends in a conversation. A person's own replies survive unless `includeHuman`. */
export async function cancelPendingSends(
  m: EntityManager,
  conversation: Pick<Conversation, 'workspaceId' | 'id'>,
  reason: string,
  includeHuman: boolean,
): Promise<void> {
  const pending = await m.findBy(SendIntent, {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    state: 'pending',
    ...(includeHuman ? {} : { byHuman: false }),
  });
  if (!pending.length) return;
  await m.update(
    SendIntent,
    { id: In(pending.map((intent) => intent.id)) },
    { state: 'cancelled', error: reason.slice(0, 400) },
  );
  await m.update(Message, { id: In(pending.map((intent) => intent.messageId)) }, { delivery: 'cancelled' });
}

/** Adds a suppression and closes every open conversation it covers. Idempotent. */
export async function suppress(
  m: EntityManager,
  workspaceId: string,
  value: string,
  reason: SuppressionReason,
  note?: string,
): Promise<void> {
  const normalised = normaliseEmail(value);
  await m.query(
    `INSERT INTO suppressions (id, workspace_id, value, reason, note) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, value) DO NOTHING`,
    [uuidv7(), workspaceId, normalised, reason, note?.slice(0, 300) ?? null],
  );
  const open = await m.find(Conversation, {
    where: normalised.startsWith('@')
      ? { workspaceId, state: Not('closed') }
      : { workspaceId, recipientEmail: normalised, state: Not('closed') },
  });
  for (const conversation of open) {
    if (normalised.startsWith('@') && `@${domainOf(conversation.recipientEmail)}` !== normalised) continue;
    await closeConversation(m, conversation, reason === 'opt_out' ? 'They asked us to stop.' : `Suppressed: ${reason}`);
    await m.update(Lead, { workspaceId, id: conversation.leadId }, { state: 'stopped' });
  }
}

/** Whether an address may not be contacted: workspace list (address or domain), or the platform-wide list. */
export async function isSuppressed(m: EntityManager, workspaceId: string, email: string): Promise<boolean> {
  const address = normaliseEmail(email);
  const rows = (await m.query(
    `SELECT 1 FROM suppressions WHERE workspace_id = $1 AND value IN ($2, $3)
     UNION ALL SELECT 1 FROM global_suppressions WHERE value = $2 LIMIT 1`,
    [workspaceId, address, `@${domainOf(address)}`],
  )) as unknown[];
  return rows.length > 0;
}

export async function recordResearch(
  m: EntityManager,
  workspaceId: string,
  effect: Extract<Effect, { type: 'recordResearch' }>,
): Promise<void> {
  for (const item of effect.items) {
    await m.save(
      m.create(LeadResearch, {
        workspaceId,
        leadId: effect.leadId,
        url: item.url.slice(0, 500),
        title: item.title?.slice(0, 300) ?? null,
        excerpt: item.excerpt.slice(0, 2000),
        kind: item.kind,
        retrievedAt: new Date(),
      }),
    );
  }
}

export async function updateConversation(
  m: EntityManager,
  workspaceId: string,
  effect: Extract<Effect, { type: 'updateConversation' }>,
): Promise<boolean> {
  const conversation = await m.findOneBy(Conversation, { workspaceId, id: effect.conversationId });
  if (!conversation || conversation.stateVersion !== effect.expectedVersion) return false;
  if (effect.state === 'closed') {
    await m.update(Conversation, { id: conversation.id }, { lastClassification: effect.classification ?? null });
    await closeConversation(m, conversation, effect.reason ?? 'Closed.');
    return true;
  }
  await m.update(
    Conversation,
    { id: conversation.id },
    {
      ...(effect.state ? { state: effect.state } : {}),
      ...(effect.classification ? { lastClassification: effect.classification } : {}),
      ...(effect.reason ? { needsHumanReason: effect.reason.slice(0, 300) } : {}),
    },
  );
  return true;
}
