/** One email to hand to a mail server. `text` is the full plain-text body, signature included. */
export interface OutgoingMail {
  from: { name: string; address: string };
  to: string;
  /** Blind copies for the owner's oversight address, if any. */
  bcc?: string;
  subject: string;
  text: string;
  html: string;
  /** `<id@domain>`; set by us so a copy turning up in the mailbox can be matched. */
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  /** `List-Unsubscribe` targets: a mailto and a one-click https URL (RFC 8058). */
  unsubscribe?: { mailto: string; url: string };
}

/**
 * A send that failed. `definite` is true when the server answered with a refusal, so the message certainly did not go.
 * Anything else (a timeout, a dropped connection) leaves it unknown, and an unknown send is never retried by itself.
 */
export class SendError extends Error {
  constructor(
    message: string,
    readonly definite: boolean,
  ) {
    super(message);
    this.name = 'SendError';
  }
}

export interface MailTransport {
  /** Returns the provider's message id. Throws SendError. */
  send(mail: OutgoingMail): Promise<string>;
}

export interface SmtpLogin {
  host: string;
  port: number;
  /** Implicit TLS; defaults to port 465. STARTTLS is required otherwise. */
  secure?: boolean;
  user: string;
  pass: string;
}

export interface ImapLogin {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
}

/** Stored, encrypted, per mailbox. IMAP is optional: forwarding is the other way replies arrive. */
export interface MailboxLogin {
  smtp: SmtpLogin;
  imap?: ImapLogin;
}

/**
 * One inbound event, whichever way it arrived (IMAP poll or a forwarding webhook). Deliberately plain, so a forwarding
 * rule or any provider's inbound parse can produce it.
 */
export interface InboundMail {
  event: 'message' | 'bounce' | 'complaint';
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  from: { email: string; name?: string };
  subject?: string;
  text?: string;
  receivedAt?: string;
  /** For bounces and complaints: the address that failed. */
  recipient?: string;
}
