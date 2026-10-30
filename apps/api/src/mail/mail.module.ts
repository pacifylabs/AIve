import { Global, Inject, Injectable, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/** Platform notices (verification, password reset, invitations). Customer sales email has its own path later. */
export abstract class Mailer {
  abstract send(mail: OutgoingMail): Promise<void>;
}

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transport: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    this.transport = nodemailer.createTransport(config.SMTP_URL);
  }

  async send(mail: OutgoingMail): Promise<void> {
    await this.transport.sendMail({ from: this.config.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
  }
}

@Global()
@Module({
  providers: [{ provide: Mailer, useClass: SmtpMailer }],
  exports: [Mailer],
})
export class MailModule {}
