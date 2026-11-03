import { type MailTransport, type OutgoingMail, SendError } from './types.js';

/**
 * Records mail instead of sending it, for tests and local development. `next` makes the following send fail the way a
 * real server can: `refuse` (it answered no) or `drop` (nobody knows whether it went).
 */
export class FixtureTransport implements MailTransport {
  readonly outbox: (OutgoingMail & { at: Date })[] = [];
  next: 'refuse' | 'drop' | null = null;

  send(mail: OutgoingMail): Promise<string> {
    const behaviour = this.next;
    this.next = null;
    if (behaviour === 'refuse') return Promise.reject(new SendError('550 The mailbox refused the message.', true));
    if (behaviour === 'drop') return Promise.reject(new SendError('Connection closed before the server answered.', false));
    this.outbox.push({ ...mail, at: new Date() });
    return Promise.resolve(`fixture-${mail.messageId}`);
  }
}
