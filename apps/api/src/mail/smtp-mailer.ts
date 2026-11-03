import nodemailer, { type Transporter } from 'nodemailer';
import { MailSendError, Mailer, type OutgoingMail } from './mailer.js';

/** Sends through any SMTP server named by `smtp://` or `smtps://` URL. */
export class SmtpMailer extends Mailer {
  constructor(
    smtpUrl: string,
    private readonly from: string,
    // Injectable so tests can capture messages without a server.
    private readonly transport: Transporter = nodemailer.createTransport(smtpUrl),
  ) {
    super();
  }

  async send(mail: OutgoingMail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
    } catch {
      // The transport error can echo the connection URL, which holds the SMTP password.
      throw new MailSendError('The SMTP server did not accept the message.');
    }
  }
}
