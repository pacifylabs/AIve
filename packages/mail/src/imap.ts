import { ImapFlow } from 'imapflow';
import { type AddressObject, simpleParser } from 'mailparser';
import type { ImapLogin, InboundMail } from './types.js';

export interface ImapCursor {
  uidValidity: number | null;
  lastUid: number | null;
}

const firstAddress = (value: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.value[0];

/** Delivery status notifications name the failed address in a `Final-Recipient` line. */
function bounceRecipient(text: string): string | undefined {
  return /Final-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i.exec(text)?.[1];
}

/**
 * Reads INBOX messages newer than the cursor. The first poll of a mailbox only records where the inbox is, so connecting
 * a mailbox never replays its whole history into the pipeline.
 */
export async function pollImap(
  login: ImapLogin,
  cursor: ImapCursor,
  max = 50,
): Promise<{ mails: InboundMail[]; cursor: ImapCursor }> {
  const client = new ImapFlow({
    host: login.host,
    port: login.port,
    secure: login.secure ?? login.port === 993,
    auth: { user: login.user, pass: login.pass },
    logger: false,
    socketTimeout: 30_000,
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  try {
    const box = client.mailbox;
    if (!box) throw new Error('INBOX did not open');
    const uidValidity = Number(box.uidValidity);
    const top = Math.max(Number(box.uidNext) - 1, 0);
    // A new UIDVALIDITY means the server renumbered the mailbox: start again from the top, as on first connect.
    if (cursor.uidValidity !== uidValidity || cursor.lastUid === null) {
      return { mails: [], cursor: { uidValidity, lastUid: top } };
    }
    if (top <= cursor.lastUid) return { mails: [], cursor };

    const mails: InboundMail[] = [];
    let lastUid = cursor.lastUid;
    for await (const message of client.fetch(`${cursor.lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
      if (message.uid <= cursor.lastUid || mails.length >= max) continue;
      lastUid = Math.max(lastUid, message.uid);
      if (!message.source) continue;
      const parsed = await simpleParser(message.source, { skipHtmlToText: false, skipImageLinks: true });
      const from = firstAddress(parsed.from);
      const text = (parsed.text ?? '').slice(0, 50_000);
      const report = /multipart\/report/i.test(String(parsed.headers.get('content-type') ?? ''));
      const references = Array.isArray(parsed.references)
        ? parsed.references
        : parsed.references
          ? [parsed.references]
          : [];
      mails.push({
        event: report ? 'bounce' : 'message',
        messageId: parsed.messageId ?? `<imap-${uidValidity}-${message.uid}@local>`,
        inReplyTo: parsed.inReplyTo ?? null,
        references,
        from: { email: from?.address ?? '', name: from?.name || undefined },
        subject: parsed.subject,
        text,
        receivedAt: (parsed.date ?? new Date()).toISOString(),
        recipient: report ? bounceRecipient(text) : undefined,
      });
    }
    return { mails, cursor: { uidValidity, lastUid } };
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}
