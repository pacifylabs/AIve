import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Keyring, mailboxBinding, MailInbox } from '@ai-staff/core';
import { asSystem, DataSource, Mailbox, withTenant } from '@ai-staff/db';
import { type MailboxLogin, pollImap } from '@ai-staff/mail';
import { KEYRING } from './tokens.js';

const POLL_MS = 60_000;

/**
 * Reads replies from mailboxes connected over IMAP. Mailboxes that forward instead post to the API and are not
 * polled. A failing mailbox is recorded on its row and skipped; it never stops the others.
 */
@Injectable()
export class ImapPoller implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ImapPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(KEYRING) private readonly keyring: Keyring,
    @Inject(MailInbox) private readonly inbox: MailInbox,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let received = 0;
    try {
      const mailboxes = await asSystem(this.db, 'imap poller: list mailboxes that are read over IMAP', (m) =>
        m.find(Mailbox, { where: { inboundMode: 'imap' } }),
      );
      for (const mailbox of mailboxes) {
        if (mailbox.status === 'paused' || !mailbox.credentialsEnc) continue;
        try {
          const login = JSON.parse(
            this.keyring.decrypt(mailbox.credentialsEnc, mailboxBinding(mailbox)),
          ) as MailboxLogin;
          if (!login.imap) continue;
          const { mails, cursor } = await pollImap(login.imap, {
            uidValidity: mailbox.imapUidValidity,
            lastUid: mailbox.imapLastUid,
          });
          for (const mail of mails) {
            await this.inbox.receive(mailbox, mail);
            received += 1;
          }
          await withTenant(this.db, { workspaceId: mailbox.workspaceId, userId: null }, (m) =>
            m.update(
              Mailbox,
              { id: mailbox.id },
              { imapUidValidity: cursor.uidValidity, imapLastUid: cursor.lastUid, lastError: null },
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn({ mailboxId: mailbox.id, error: message }, 'imap poll failed');
          await withTenant(this.db, { workspaceId: mailbox.workspaceId, userId: null }, (m) =>
            m.update(Mailbox, { id: mailbox.id }, { lastError: `Reading replies failed: ${message}`.slice(0, 400) }),
          );
        }
      }
    } finally {
      this.running = false;
    }
    return received;
  }
}
