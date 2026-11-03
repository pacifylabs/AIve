import { createHash, timingSafeEqual } from 'node:crypto';
import {
  ActivityEvent,
  asSystem,
  Conversation,
  type DataSource,
  DomainEvent,
  type EntityManager,
  In,
  Lead,
  Mailbox,
  Message,
  SendIntent,
  withTenant,
} from '@ai-staff/db';
import { type InboundMail, isOptOut, normaliseEmail, splitQuoted } from '@ai-staff/mail';
import { v7 as uuidv7 } from 'uuid';
import type { Keyring } from '../crypto/keyring.js';
import { UNSUBSCRIBE_PURPOSE } from './dispatcher.js';
import { cancelPendingSends, suppress } from './mail-effects.js';

export type InboundOutcome =
  'duplicate' | 'suppressed' | 'copy' | 'verified' | 'unmatched' | 'opted_out' | 'for_human' | 'queued';

/** Raised for a wrong mailbox id and a wrong secret alike, so the webhook cannot be used to find mailboxes. */
export class InboundNotFoundError extends Error {}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function inboundSecretHash(secret: string): string {
  return sha256(secret);
}

function secretMatches(mailbox: Mailbox, secret: string): boolean {
  const given = Buffer.from(sha256(secret), 'hex');
  const stored = Buffer.from(mailbox.inboundSecretHash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** Words in a subject that mean "unsubscribe", as sent by a List-Unsubscribe mailto. */
const UNSUBSCRIBE_SUBJECT = /^\s*unsubscribe\b/i;

/**
 * Takes inbound mail from either path (IMAP polling or the forwarding webhook) into the pipeline. Idempotent: the
 * same message twice changes nothing the second time. Everything that must never depend on a model (bounces,
 * complaints, opt-outs) is decided here, before any task sees the reply.
 */
export class MailInbox {
  constructor(
    private readonly db: DataSource,
    private readonly keyring: Keyring,
  ) {}

  /** The forwarding webhook: the mailbox id and its secret both come from the URL. */
  async receiveForwarded(mailboxId: string, secret: string, mail: InboundMail): Promise<InboundOutcome> {
    const mailbox = await asSystem(this.db, 'inbound webhook: find the mailbox a forwarding URL names', (m) =>
      m.findOneBy(Mailbox, { id: mailboxId }),
    );
    if (!mailbox || !secretMatches(mailbox, secret)) throw new InboundNotFoundError('Not found.');
    return this.receive(mailbox, mail);
  }

  async receive(mailbox: Mailbox, mail: InboundMail): Promise<InboundOutcome> {
    const workspaceId = mailbox.workspaceId;
    const outcome = await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const fresh = (await m.query(
        `INSERT INTO inbound_events (id, workspace_id, source, external_id, received_at)
         VALUES ($1, $2, 'email', $3, $4) ON CONFLICT (workspace_id, source, external_id) DO NOTHING RETURNING id`,
        [uuidv7(), workspaceId, mail.messageId.slice(0, 300), mail.receivedAt ? new Date(mail.receivedAt) : new Date()],
      )) as { id: string }[];
      if (!fresh.length) return 'duplicate' as const;
      // The caller's copy may be stale (a poll that started before a test send); decide on the current row.
      const current = await m.findOneByOrFail(Mailbox, { workspaceId, id: mailbox.id });
      const result = await this.handle(m, current, mail);
      await m.query(
        `UPDATE inbound_events SET processed_at = now(), outcome = $3, updated_at = now()
          WHERE workspace_id = $1 AND source = 'email' AND external_id = $2`,
        [workspaceId, mail.messageId.slice(0, 300), result],
      );
      return result;
    });
    // Hard bounces and complaints protect every workspace, so they also go on the platform list.
    if (outcome === 'suppressed' && mail.event !== 'message') {
      const failed = normaliseEmail(mail.recipient ?? mail.from.email);
      await asSystem(this.db, 'inbound: add a hard bounce or complaint to the global suppression list', (m) =>
        m.query(
          `INSERT INTO global_suppressions (id, value, reason) VALUES ($1, $2, $3) ON CONFLICT (value) DO NOTHING`,
          [uuidv7(), failed, mail.event === 'complaint' ? 'complaint' : 'bounce'],
        ),
      );
    }
    return outcome;
  }

  /** One-click unsubscribe (RFC 8058). Returns false for a token that does not verify. */
  async unsubscribe(token: string): Promise<boolean> {
    const data = this.keyring.verify(UNSUBSCRIBE_PURPOSE, token);
    const separator = data?.indexOf(':') ?? -1;
    if (!data || separator < 1) return false;
    const workspaceId = data.slice(0, separator);
    const email = data.slice(separator + 1);
    await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      await suppress(m, workspaceId, email, 'opt_out', 'Unsubscribe link');
      await this.activity(
        m,
        workspaceId,
        null,
        'opted_out',
        `${email} unsubscribed. They will not be contacted again.`,
      );
    });
    return true;
  }

  private async handle(m: EntityManager, mailbox: Mailbox, mail: InboundMail): Promise<InboundOutcome> {
    const workspaceId = mailbox.workspaceId;

    if (mail.event === 'bounce' || mail.event === 'complaint') {
      const failed = normaliseEmail(mail.recipient ?? mail.from.email);
      if (!failed) return 'unmatched';
      const conversations = await m.findBy(Conversation, { workspaceId, recipientEmail: failed });
      if (mail.event === 'bounce' && conversations.length) {
        await m.query(
          `UPDATE messages SET delivery = 'bounced', updated_at = now()
            WHERE id IN (SELECT DISTINCT ON (conversation_id) id FROM messages
                          WHERE workspace_id = $1 AND conversation_id = ANY($2) AND direction = 'out' AND delivery = 'accepted'
                          ORDER BY conversation_id, occurred_at DESC)`,
          [workspaceId, conversations.map((conversation) => conversation.id)],
        );
      }
      await suppress(m, workspaceId, failed, mail.event, 'Reported by the mail server');
      for (const staffId of new Set(conversations.map((conversation) => conversation.staffId))) {
        // Roles count these toward demotion and health; see the sales role's subscriptions.
        await m.save(
          m.create(DomainEvent, {
            workspaceId,
            type: mail.event === 'bounce' ? 'mail.bounced' : 'mail.complained',
            payload: { staffId, address: failed },
            sourceRunId: null,
            dispatchedAt: null,
          }),
        );
      }
      await this.activity(
        m,
        workspaceId,
        conversations[0]?.staffId ?? null,
        mail.event === 'bounce' ? 'email.bounced' : 'email.complaint',
        mail.event === 'bounce'
          ? `${failed} bounced. It will not be contacted again.`
          : `${failed} marked an email as spam. It will not be contacted again.`,
      );
      return 'suppressed';
    }

    // A copy of what we sent turning up settles an email whose outcome we did not know.
    const ours = await m.findOneBy(Message, { workspaceId, messageIdHeader: mail.messageId, direction: 'out' });
    if (ours) {
      const intent = await m.findOneBy(SendIntent, { workspaceId, messageId: ours.id });
      if (intent?.state === 'uncertain') {
        await m.update(SendIntent, { id: intent.id }, { state: 'sent', error: null });
        await m.update(Message, { id: ours.id }, { delivery: 'accepted' });
      }
      return 'copy';
    }

    const from = normaliseEmail(mail.from.email);
    if (!from) return 'unmatched';
    const refs = [mail.inReplyTo, ...(mail.references ?? [])].filter((value): value is string => Boolean(value));
    await m.update(Mailbox, { id: mailbox.id }, { lastInboundAt: new Date() });

    // The reply to the test message is what verifies a mailbox: it proves replies reach us.
    if (mailbox.testMessageId && refs.includes(mailbox.testMessageId)) {
      await m.update(
        Mailbox,
        { id: mailbox.id },
        { status: 'verified', verifiedAt: new Date(), failures: 0, lastError: null },
      );
      await this.activity(
        m,
        workspaceId,
        null,
        'mailbox.verified',
        `${mailbox.address} is verified: a reply reached us.`,
      );
      return 'verified';
    }

    const parent = refs.length
      ? await m.findOne(Message, { where: { workspaceId, direction: 'out', messageIdHeader: In(refs) } })
      : null;
    const conversation = parent
      ? await m.findOne(Conversation, {
          where: { workspaceId, id: parent.conversationId },
          lock: { mode: 'pessimistic_write' },
        })
      : await m.findOne(Conversation, {
          where: { workspaceId, mailboxId: mailbox.id, recipientEmail: from },
          order: { createdAt: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
    // Only the person we wrote to can continue the thread; anyone else quoting our message id starts nothing.
    if (
      !conversation ||
      conversation.mailboxId !== mailbox.id ||
      normaliseEmail(conversation.recipientEmail) !== from
    ) {
      await this.activity(
        m,
        workspaceId,
        null,
        'email.unmatched',
        `A message from ${from} did not match a conversation.`,
      );
      return 'unmatched';
    }

    const when = mail.receivedAt ? new Date(mail.receivedAt) : new Date();
    const version = conversation.stateVersion + 1;
    const text = (mail.text ?? '').slice(0, 20_000);
    const message = await m.save(
      m.create(Message, {
        workspaceId,
        conversationId: conversation.id,
        direction: 'in',
        kind: 'reply',
        author: 'lead',
        authorUserId: null,
        subject: (mail.subject ?? conversation.subject).slice(0, 300),
        body: text,
        messageIdHeader: mail.messageId.slice(0, 300),
        inReplyTo: mail.inReplyTo?.slice(0, 300) ?? null,
        occurredAt: when,
        delivery: 'received',
      }),
    );
    const reopened = conversation.state === 'closed' ? 'closed' : 'active';
    await m.update(
      Conversation,
      { id: conversation.id },
      { stateVersion: version, lastMessageAt: when, state: reopened },
    );
    // Anything the staff member queued was written before they answered: it is dropped, whatever comes next.
    await cancelPendingSends(m, conversation, 'They replied.', false);

    if (isOptOut(text) || UNSUBSCRIBE_SUBJECT.test(mail.subject ?? '')) {
      await suppress(m, workspaceId, from, 'opt_out', 'Asked to stop in a reply');
      await this.activity(
        m,
        workspaceId,
        conversation.staffId,
        'opted_out',
        `${from} asked to stop. They will not be contacted again.`,
      );
      return 'opted_out';
    }

    await m.update(
      Lead,
      { workspaceId, id: conversation.leadId },
      { state: conversation.handledBy === 'human' ? 'needs_human' : 'replied' },
    );
    if (conversation.handledBy === 'human' || conversation.state === 'closed') {
      const why = conversation.handledBy === 'human' ? 'a person is handling' : 'that had ended';
      await this.activity(
        m,
        workspaceId,
        conversation.staffId,
        'email.reply_for_human',
        `${from} replied in a conversation ${why}.`,
      );
      return 'for_human';
    }

    await this.activity(
      m,
      workspaceId,
      conversation.staffId,
      'email.replied',
      `${from} replied: "${splitQuoted(text).text.slice(0, 120)}"`,
    );
    await m.save(
      m.create(DomainEvent, {
        workspaceId,
        type: 'lead.replied',
        payload: {
          staffId: conversation.staffId,
          leadId: conversation.leadId,
          conversationId: conversation.id,
          messageId: message.id,
          conversationVersion: version,
        },
        sourceRunId: null,
        dispatchedAt: null,
      }),
    );
    return 'queued';
  }

  private async activity(m: EntityManager, workspaceId: string, staffId: string | null, type: string, summary: string) {
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId,
        actor: 'system',
        type,
        summary: summary.slice(0, 300),
        detail: {},
        costUsd: null,
      }),
    );
  }
}
