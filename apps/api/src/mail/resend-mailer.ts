import { MailSendError, Mailer, type OutgoingMail } from './mailer.js';

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/** Sends through Resend's HTTP API. Unlike SMTP it works on hosts that block outbound mail ports. */
export class ResendMailer extends Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    // Injectable so tests run offline.
    private readonly fetcher: typeof fetch = fetch,
  ) {
    super();
  }

  async send(mail: OutgoingMail): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new MailSendError('Resend could not be reached.');
    }
    if (response.ok) return;

    const detail = await this.describe(response);
    throw new MailSendError(
      `Resend refused the message (${response.status})${detail ? `: ${detail}` : ''}.`,
      response.status,
    );
  }

  /** Resend explains refusals in a JSON `message`. Anything else is ignored, and the key is scrubbed if echoed back. */
  private async describe(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { message?: unknown };
      return typeof body.message === 'string' ? body.message.replaceAll(this.apiKey, '[redacted]').slice(0, 200) : '';
    } catch {
      return '';
    }
  }
}
