export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/** Platform notices (verification, password reset, invitations). Customer sales email has its own path. */
export abstract class Mailer {
  abstract send(mail: OutgoingMail): Promise<void>;
}

/**
 * A message could not be delivered. `status` is the provider's HTTP status when there was one. The message never
 * contains credentials, so it is safe to log.
 */
export class MailSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MailSendError';
  }
}
