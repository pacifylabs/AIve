import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { connectMailboxRequest } from '@ai-staff/contracts';
import { inboundSecretHash, Keyring, mailboxBinding } from '@ai-staff/core';
import { AuditEntry, DataSource, type EntityManager, Mailbox, withTenant } from '@ai-staff/db';
import {
  checkSendingDns,
  domainOf,
  type MailboxLogin,
  normaliseEmail,
  renderEmailHtml,
  SendError,
  SmtpTransport,
} from '@ai-staff/mail';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

/** A mailbox as the API shows it: never the login, never the forwarding secret (shown once, when it is made). */
export const publicMailbox = (mailbox: Mailbox) => ({
  id: mailbox.id,
  address: mailbox.address,
  displayName: mailbox.displayName,
  provider: mailbox.provider,
  inboundMode: mailbox.inboundMode,
  status: mailbox.status,
  spfOk: mailbox.spfOk,
  dkimOk: mailbox.dkimOk,
  dmarcOk: mailbox.dmarcOk,
  dnsCheckedAt: mailbox.dnsCheckedAt,
  verifiedAt: mailbox.verifiedAt,
  lastError: mailbox.lastError,
  lastInboundAt: mailbox.lastInboundAt,
});

@Injectable()
export class MailboxService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Keyring) private readonly keyring: Keyring,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  list(ctx: WorkspaceContext) {
    return this.tx(ctx, async (m) =>
      (await m.find(Mailbox, { where: { workspaceId: ctx.workspaceId }, order: { createdAt: 'ASC' } })).map(
        publicMailbox,
      ),
    );
  }

  /**
   * Connects a mailbox. The SMTP login is tried before anything is saved, so a wrong password is reported now, not on
   * the first send. The mailbox stays `pending` until a reply to the test message reaches us.
   */
  async connect(ctx: WorkspaceContext, input: z.output<typeof connectMailboxRequest>) {
    if (input.provider === 'fixture' && this.config.NODE_ENV === 'production') {
      throw AppError.forbidden('Fixture mailboxes are for development only.');
    }
    if (input.provider === 'smtp' && !input.smtp) {
      throw new AppError(400, 'validation_failed', 'Enter the SMTP login for this mailbox.', {
        errors: [{ path: 'smtp', message: 'Required.' }],
      });
    }
    if (input.inboundMode === 'imap' && !input.imap) {
      throw new AppError(400, 'validation_failed', 'Enter the IMAP login to read replies.', {
        errors: [{ path: 'imap', message: 'Required.' }],
      });
    }
    if (input.provider === 'smtp') {
      try {
        await new SmtpTransport(input.smtp!).verify();
      } catch (error) {
        throw new AppError(
          400,
          'validation_failed',
          `The mail server refused this login: ${(error as Error).message}`.slice(0, 300),
          {
            errors: [{ path: 'smtp', message: 'Login failed.' }],
          },
        );
      }
    }
    const address = normaliseEmail(input.address);
    const id = uuidv7();
    const secret = randomBytes(24).toString('base64url');
    const login: MailboxLogin | null = input.smtp ? { smtp: input.smtp, imap: input.imap } : null;
    const mailbox = await this.tx(ctx, async (m) => {
      if (await m.existsBy(Mailbox, { workspaceId: ctx.workspaceId, address })) {
        throw AppError.conflict('That mailbox is already connected.');
      }
      const saved = await m.save(
        m.create(Mailbox, {
          id,
          workspaceId: ctx.workspaceId,
          address,
          displayName: input.displayName,
          provider: input.provider,
          credentialsEnc: login
            ? this.keyring.encrypt(JSON.stringify(login), mailboxBinding({ workspaceId: ctx.workspaceId, id }))
            : null,
          inboundMode: input.inboundMode,
          inboundSecretHash: inboundSecretHash(secret),
          status: 'pending',
          failures: 0,
        }),
      );
      await m.save(
        m.create(AuditEntry, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'mailbox.connected',
          target: saved.id,
          detail: { address, provider: input.provider, inboundMode: input.inboundMode },
        }),
      );
      return saved;
    });
    return {
      ...publicMailbox(mailbox),
      // Shown once: only a hash is stored.
      forwardingUrl: `${(this.config.API_PUBLIC_URL ?? `http://localhost:${this.config.API_PORT}`).replace(/\/+$/, '')}/v1/inbound/mail/${mailbox.id}/${secret}`,
    };
  }

  /** Sends a test message. A reply to it is what verifies the mailbox. */
  async sendTest(ctx: WorkspaceContext, id: string, to: string) {
    const mailbox = await this.tx(ctx, (m) => m.findOneBy(Mailbox, { workspaceId: ctx.workspaceId, id }));
    if (!mailbox) throw AppError.notFound('Mailbox not found.');
    const messageId = `<test-${uuidv7()}@${domainOf(mailbox.address) || 'localhost'}>`;
    const text = `This is a test message from ${mailbox.address}, sent to check the connection.\n\nPlease reply to it with anything. Your reply is how we know replies reach us.`;
    if (mailbox.provider === 'smtp') {
      const login = JSON.parse(this.keyring.decrypt(mailbox.credentialsEnc!, mailboxBinding(mailbox))) as MailboxLogin;
      try {
        await new SmtpTransport(login.smtp).send({
          from: { name: mailbox.displayName, address: mailbox.address },
          to: normaliseEmail(to),
          subject: 'Mailbox test',
          text,
          html: renderEmailHtml({ subject: 'Mailbox test', text }),
          messageId,
        });
      } catch (error) {
        const message = error instanceof SendError ? error.message : String(error);
        await this.tx(ctx, (m) => m.update(Mailbox, { id }, { lastError: message.slice(0, 400), status: 'error' }));
        throw new AppError(400, 'validation_failed', `The test message could not be sent: ${message}`.slice(0, 300));
      }
    }
    await this.tx(ctx, (m) =>
      m.update(
        Mailbox,
        { id },
        { testMessageId: messageId, lastError: null, status: mailbox.status === 'verified' ? 'verified' : 'pending' },
      ),
    );
    return { sentTo: normaliseEmail(to) };
  }

  async checkDns(ctx: WorkspaceContext, id: string) {
    const mailbox = await this.tx(ctx, (m) => m.findOneBy(Mailbox, { workspaceId: ctx.workspaceId, id }));
    if (!mailbox) throw AppError.notFound('Mailbox not found.');
    const report = await checkSendingDns(domainOf(mailbox.address));
    await this.tx(ctx, (m) =>
      m.update(
        Mailbox,
        { id },
        { spfOk: report.spf, dkimOk: report.dkim, dmarcOk: report.dmarc, dnsCheckedAt: new Date() },
      ),
    );
    return report;
  }

  /** Lets a mailbox that was paused or errored try again (after the owner fixed its login or DNS). */
  async resume(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const mailbox = await m.findOneBy(Mailbox, { workspaceId: ctx.workspaceId, id });
      if (!mailbox) throw AppError.notFound('Mailbox not found.');
      if (mailbox.status !== 'paused' && mailbox.status !== 'error') return publicMailbox(mailbox);
      await m.update(
        Mailbox,
        { id },
        { status: mailbox.verifiedAt ? 'verified' : 'pending', failures: 0, lastError: null },
      );
      return publicMailbox(await m.findOneByOrFail(Mailbox, { id }));
    });
  }
}
