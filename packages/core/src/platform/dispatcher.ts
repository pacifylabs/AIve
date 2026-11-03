import {
  ActivityEvent,
  asSystem,
  Conversation,
  type DataSource,
  type EntityManager,
  Lead,
  Mailbox,
  Message,
  SendIntent,
  StaffMember,
  withTenant,
} from '@ai-staff/db';
import { type MailboxLogin, type MailTransport, normaliseEmail, renderEmailHtml, SendError } from '@ai-staff/mail';
import type { Keyring } from '../crypto/keyring.js';
import { isSuppressed } from './mail-effects.js';

export type SendVerdict = { ok: true } | { defer: Date; reason: string } | { block: string };

/** Everything known about one send at the moment it is about to happen. */
export interface SendContext {
  intent: SendIntent;
  message: Message;
  conversation: Conversation;
  staff: StaffMember;
  mailbox: Mailbox;
  lead: Lead | null;
  now: Date;
}

/** The role's own sending rules, checked again at the moment of sending, and what it does after a send. */
export interface SendHooks {
  check(m: EntityManager, ctx: SendContext): Promise<SendVerdict>;
  afterSent(m: EntityManager, ctx: SendContext): Promise<void>;
}

export type DispatchOutcome = 'sent' | 'failed' | 'uncertain' | 'held' | 'blocked' | 'skipped';

export interface DispatcherOptions {
  keyring: Keyring;
  /** Builds the transport for a mailbox; tests and local development return a fixture. */
  transportFor(mailbox: Mailbox, login: MailboxLogin | null): MailTransport;
  /** Hooks by role key; a role without hooks only gets the platform checks. */
  hooksFor(roleKey: string): SendHooks | null;
  /** Base URL of the web app, for the one-click unsubscribe link. */
  appUrl: string;
  now?: () => Date;
}

/** The purpose the unsubscribe token is signed for; the API verifies with the same one. */
export const UNSUBSCRIBE_PURPOSE = 'unsubscribe';

/** Binding for a mailbox's encrypted login, so it only decrypts on its own row. */
export const mailboxBinding = (mailbox: Pick<Mailbox, 'workspaceId' | 'id'>) => `${mailbox.workspaceId}:${mailbox.id}`;

/** A send stuck in `sending` this long belongs to a worker that died mid-send. */
const STUCK_AFTER_MS = 10 * 60_000;

/**
 * Hands promised emails to mail servers, once each. Safe to run from any number of workers at the same moment: the
 * claim is a row lock plus a state change, and the network call happens after the claim commits.
 *
 * An email whose outcome is unknown (a dropped connection, a dead worker) is marked `uncertain` and never sent again
 * by itself: either its copy turns up in the mailbox, or a person decides. Sending twice is worse than not sending.
 */
export class MailDispatcher {
  private readonly now: () => Date;

  constructor(
    private readonly db: DataSource,
    private readonly options: DispatcherOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Pending sends whose time has come. */
  async due(limit = 200): Promise<{ id: string; workspaceId: string }[]> {
    return asSystem(this.db, 'mail dispatcher: list send intents that are due', async (m) => {
      const rows = (await m.query(
        `SELECT id, workspace_id FROM send_intents WHERE state = 'pending' AND not_before <= $1
          ORDER BY not_before LIMIT $2`,
        [this.now(), limit],
      )) as { id: string; workspace_id: string }[];
      return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id }));
    });
  }

  /** Sends claimed by a worker that never reported back become uncertain, and the owner is told. */
  async reapStuck(): Promise<number> {
    return asSystem(this.db, 'mail dispatcher: mark sends abandoned mid-flight as uncertain', async (m) => {
      const raw = (await m.query(
        `UPDATE send_intents SET state = 'uncertain', error = 'The worker stopped while sending.', updated_at = now()
          WHERE state = 'sending' AND claimed_at < $1
          RETURNING id, workspace_id, staff_id, message_id`,
        [new Date(this.now().getTime() - STUCK_AFTER_MS)],
      )) as unknown[];
      // UPDATE ... RETURNING comes back as [rows, count] from the pg driver.
      const rows = (Array.isArray(raw[0]) ? raw[0] : raw) as {
        id: string;
        workspace_id: string;
        staff_id: string;
        message_id: string;
      }[];
      for (const row of rows) {
        await m.update(Message, { id: row.message_id }, { delivery: 'uncertain' });
        await this.activity(m, row.workspace_id, row.staff_id, 'email.uncertain', {
          summary:
            'An email may or may not have gone out (the worker stopped while sending). It will not be sent again unless you say so.',
          intentId: row.id,
        });
      }
      return rows.length;
    });
  }

  async dispatch(workspaceId: string, intentId: string): Promise<DispatchOutcome> {
    const tenant = { workspaceId, userId: null };
    const claim = await withTenant(this.db, tenant, async (m) => {
      const intent = await m.findOne(SendIntent, {
        where: { workspaceId, id: intentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!intent || intent.state !== 'pending') return { outcome: 'skipped' as const };
      const now = this.now();
      if (intent.notBefore > now) return { outcome: 'held' as const };

      const [message, conversation, staff, mailbox] = await Promise.all([
        m.findOneByOrFail(Message, { workspaceId, id: intent.messageId }),
        m.findOneByOrFail(Conversation, { workspaceId, id: intent.conversationId }),
        m.findOneByOrFail(StaffMember, { workspaceId, id: intent.staffId }),
        m.findOneByOrFail(Mailbox, { workspaceId, id: intent.mailboxId }),
      ]);
      const lead = await m.findOneBy(Lead, { workspaceId, id: conversation.leadId });
      const ctx: SendContext = { intent, message, conversation, staff, mailbox, lead, now };

      const verdict = await this.check(m, ctx);
      if ('defer' in verdict) {
        await m.update(
          SendIntent,
          { id: intent.id },
          { notBefore: verdict.defer, error: verdict.reason.slice(0, 400) },
        );
        return { outcome: 'held' as const };
      }
      if ('block' in verdict) {
        await m.update(SendIntent, { id: intent.id }, { state: 'cancelled', error: verdict.block.slice(0, 400) });
        await m.update(Message, { id: message.id }, { delivery: 'cancelled' });
        await this.activity(m, workspaceId, staff.id, 'email.blocked', {
          summary: `Did not send "${message.subject}": ${verdict.block}`,
          intentId: intent.id,
        });
        return { outcome: 'blocked' as const };
      }

      await m.update(
        SendIntent,
        { id: intent.id },
        { state: 'sending', claimedAt: now, attempts: intent.attempts + 1, error: null },
      );
      await m.update(Message, { id: message.id }, { delivery: 'sending', occurredAt: now });
      return { outcome: 'claimed' as const, ctx };
    });
    if (claim.outcome !== 'claimed') return claim.outcome;

    const { ctx } = claim;
    const { mailbox, message, conversation, staff, intent } = ctx;
    let transport: MailTransport;
    try {
      const login = mailbox.credentialsEnc
        ? (JSON.parse(this.options.keyring.decrypt(mailbox.credentialsEnc, mailboxBinding(mailbox))) as MailboxLogin)
        : null;
      transport = this.options.transportFor(mailbox, login);
    } catch (error) {
      // Nothing reached the network, so this is a definite failure, not an uncertain one.
      return this.settleFailure(
        ctx,
        new SendError(`The mailbox login could not be read: ${(error as Error).message}`, true),
      );
    }

    const token = this.options.keyring.sign(
      UNSUBSCRIBE_PURPOSE,
      `${conversation.workspaceId}:${normaliseEmail(conversation.recipientEmail)}`,
    );
    const unsubscribe = {
      url: `${this.options.appUrl.replace(/\/+$/, '')}/unsubscribe/${token}`,
      mailto: `${mailbox.address}?subject=unsubscribe`,
    };
    try {
      const providerId = await transport.send({
        from: { name: mailbox.displayName, address: mailbox.address },
        to: conversation.recipientEmail,
        subject: message.subject,
        text: message.body,
        html: renderEmailHtml({ subject: message.subject, text: message.body, unsubscribeUrl: unsubscribe.url }),
        messageId: message.messageIdHeader,
        inReplyTo: message.inReplyTo,
        references: message.inReplyTo ? [message.inReplyTo] : undefined,
        unsubscribe,
      });
      await withTenant(this.db, { workspaceId: conversation.workspaceId, userId: null }, async (m) => {
        const sentAt = this.now();
        await m.update(SendIntent, { id: intent.id }, { state: 'sent', providerMessageId: providerId.slice(0, 300) });
        await m.update(Message, { id: message.id }, { delivery: 'accepted' });
        await m.update(
          Conversation,
          { id: conversation.id },
          { lastMessageAt: sentAt, ...(conversation.state === 'active' ? { state: 'waiting' as const } : {}) },
        );
        await m.update(Mailbox, { id: mailbox.id }, { failures: 0, lastError: null });
        await this.activity(m, conversation.workspaceId, staff.id, 'email.sent', {
          summary: `Sent "${message.subject}" to ${conversation.recipientEmail}.`,
          intentId: intent.id,
          conversationId: conversation.id,
        });
        await this.options.hooksFor(staff.roleKey)?.afterSent(m, { ...ctx, now: sentAt });
      });
      return 'sent';
    } catch (error) {
      const failure =
        error instanceof SendError
          ? error
          : new SendError(String((error as Error).message ?? error).slice(0, 300), false);
      return this.settleFailure(ctx, failure);
    }
  }

  /** A person settles an uncertain email: it did go (`sent`), or send it again (`retry`). */
  async resolveUncertain(
    actor: { workspaceId: string; userId: string },
    intentId: string,
    outcome: 'sent' | 'retry',
  ): Promise<boolean> {
    return withTenant(this.db, actor, async (m) => {
      const intent = await m.findOne(SendIntent, {
        where: { workspaceId: actor.workspaceId, id: intentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!intent || intent.state !== 'uncertain') return false;
      await m.update(
        SendIntent,
        { id: intent.id },
        outcome === 'sent' ? { state: 'sent', error: null } : { state: 'pending', error: null, notBefore: this.now() },
      );
      await m.update(Message, { id: intent.messageId }, { delivery: outcome === 'sent' ? 'accepted' : 'queued' });
      return true;
    });
  }

  /** Platform rules first (nothing a role can loosen), then the role's own. */
  private async check(m: EntityManager, ctx: SendContext): Promise<SendVerdict> {
    const { intent, conversation, staff, mailbox } = ctx;
    if (!intent.byHuman) {
      if (staff.state !== 'active') return { block: `${staff.displayName} is ${staff.state}.` };
      if (conversation.state === 'closed') return { block: 'The conversation has ended.' };
      if (conversation.handledBy === 'human') return { block: 'A person took over this conversation.' };
      if (intent.conversationVersion !== null && intent.conversationVersion !== conversation.stateVersion) {
        return { block: 'They replied, or the conversation changed, after this was written.' };
      }
    }
    if (mailbox.status !== 'verified') return { block: 'The mailbox is not verified.' };
    if (await isSuppressed(m, conversation.workspaceId, conversation.recipientEmail)) {
      return { block: 'This person asked not to be contacted, or the address bounced.' };
    }
    if (intent.byHuman) return { ok: true };
    const hooks = this.options.hooksFor(staff.roleKey);
    return hooks ? hooks.check(m, ctx) : { ok: true };
  }

  private async settleFailure(ctx: SendContext, failure: SendError): Promise<DispatchOutcome> {
    const { intent, message, mailbox, staff, conversation } = ctx;
    return withTenant(this.db, { workspaceId: conversation.workspaceId, userId: null }, async (m) => {
      if (failure.definite) {
        await m.update(SendIntent, { id: intent.id }, { state: 'failed', error: failure.message.slice(0, 400) });
        await m.update(Message, { id: message.id }, { delivery: 'failed' });
        const failures = mailbox.failures + 1;
        await m.update(
          Mailbox,
          { id: mailbox.id },
          {
            failures,
            lastError: failure.message.slice(0, 400),
            ...(failures >= 3 ? { status: 'error' as const } : {}),
          },
        );
        await this.activity(m, conversation.workspaceId, staff.id, 'email.failed', {
          summary:
            failures >= 3
              ? `The mailbox keeps refusing messages, so sending is stopped until you check its login. Last error: ${failure.message}`
              : `The mail server refused "${message.subject}": ${failure.message}`,
          intentId: intent.id,
        });
        return 'failed' as const;
      }
      await m.update(SendIntent, { id: intent.id }, { state: 'uncertain', error: failure.message.slice(0, 400) });
      await m.update(Message, { id: message.id }, { delivery: 'uncertain' });
      await this.activity(m, conversation.workspaceId, staff.id, 'email.uncertain', {
        summary: `An email to ${conversation.recipientEmail} may or may not have gone out (${failure.message}). It will not be sent again unless you say so.`,
        intentId: intent.id,
      });
      return 'uncertain' as const;
    });
  }

  private async activity(
    m: EntityManager,
    workspaceId: string,
    staffId: string,
    type: string,
    detail: { summary: string } & Record<string, unknown>,
  ): Promise<void> {
    const { summary, ...rest } = detail;
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId,
        actor: 'system',
        type,
        summary: summary.slice(0, 300),
        detail: rest,
        costUsd: null,
      }),
    );
  }
}
