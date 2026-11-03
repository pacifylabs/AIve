import { Global, Module } from '@nestjs/common';
import type { AppConfig } from '@ai-staff/config';
import { APP_CONFIG } from '../config/config.module.js';
import { Mailer } from './mailer.js';
import { ResendMailer } from './resend-mailer.js';
import { SmtpMailer } from './smtp-mailer.js';

// Callers import these from here; the definitions live in mailer.ts so the adapters can extend Mailer without a cycle.
export { MailSendError, Mailer, type OutgoingMail } from './mailer.js';

/** Builds the mailer EMAIL_PROVIDER names. Config validation already guarantees the matching setting is present. */
export function createMailer(
  config: Pick<AppConfig, 'EMAIL_PROVIDER' | 'MAIL_FROM'> & Partial<Pick<AppConfig, 'SMTP_URL' | 'RESEND_API_KEY'>>,
): Mailer {
  if (config.EMAIL_PROVIDER === 'resend') {
    if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    return new ResendMailer(config.RESEND_API_KEY, config.MAIL_FROM);
  }
  if (!config.SMTP_URL) throw new Error('SMTP_URL is required when EMAIL_PROVIDER=smtp');
  return new SmtpMailer(config.SMTP_URL, config.MAIL_FROM);
}

@Global()
@Module({
  providers: [{ provide: Mailer, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createMailer(config) }],
  exports: [Mailer],
})
export class MailModule {}
