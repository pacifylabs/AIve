import { createTransport } from 'nodemailer';
import { type MailTransport, type OutgoingMail, SendError, type SmtpLogin } from './types.js';

/** Sends through the customer's own mail server. One connection per send: volumes are low and logins rotate. */
export class SmtpTransport implements MailTransport {
  constructor(private readonly login: SmtpLogin) {}

  async send(mail: OutgoingMail): Promise<string> {
    const transport = createTransport({
      host: this.login.host,
      port: this.login.port,
      secure: this.login.secure ?? this.login.port === 465,
      requireTLS: !(this.login.secure ?? this.login.port === 465),
      auth: { user: this.login.user, pass: this.login.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    try {
      const info = await transport.sendMail({
        from: mail.from,
        to: mail.to,
        bcc: mail.bcc,
        replyTo: mail.from.address,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: mail.messageId,
        inReplyTo: mail.inReplyTo ?? undefined,
        references: mail.references,
        list: mail.unsubscribe
          ? { unsubscribe: [{ url: mail.unsubscribe.url, comment: 'Unsubscribe' }, `mailto:${mail.unsubscribe.mailto}`] }
          : undefined,
        headers: mail.unsubscribe ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
      });
      return String(info.messageId ?? mail.messageId);
    } catch (error) {
      const failure = error as { responseCode?: number; message?: string };
      // A server that answered with a refusal did not take the message; anything else leaves it unknown.
      throw new SendError(
        String(failure.message ?? 'The mail server failed.').slice(0, 300),
        typeof failure.responseCode === 'number',
      );
    } finally {
      transport.close();
    }
  }

  /** Logs in without sending, so a bad login is caught when the mailbox is connected. */
  async verify(): Promise<void> {
    const transport = createTransport({
      host: this.login.host,
      port: this.login.port,
      secure: this.login.secure ?? this.login.port === 465,
      auth: { user: this.login.user, pass: this.login.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    try {
      await transport.verify();
    } finally {
      transport.close();
    }
  }
}
