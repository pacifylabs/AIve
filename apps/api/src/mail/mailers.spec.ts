import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { MailSendError } from './mailer.js';
import { createMailer } from './mail.module.js';
import { ResendMailer } from './resend-mailer.js';
import { SmtpMailer } from './smtp-mailer.js';

const mail = { to: 'dana@example.com', subject: 'Hello', text: 'Plain body' };

function reply(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('ResendMailer', () => {
  it('posts the message to Resend with the key and sender', async () => {
    const fetcher = reply(200, { id: 'email_1' });
    await new ResendMailer('re_secret', 'AI Staff <no-reply@example.com>', fetcher).send(mail);

    const [url, init] = vi.mocked(fetcher).mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_secret');
    expect(JSON.parse(init?.body as string)).toEqual({
      from: 'AI Staff <no-reply@example.com>',
      to: ['dana@example.com'],
      subject: 'Hello',
      text: 'Plain body',
    });
  });

  it('throws a typed error carrying the status and Resend message when Resend refuses', async () => {
    const mailer = new ResendMailer(
      're_secret',
      'a@example.com',
      reply(403, { message: 'The domain is not verified.' }),
    );
    const error = await mailer.send(mail).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MailSendError);
    expect((error as MailSendError).status).toBe(403);
    expect((error as MailSendError).message).toContain('The domain is not verified.');
  });

  it('never puts the API key in an error', async () => {
    const mailer = new ResendMailer('re_secret', 'a@example.com', reply(401, { message: 'Invalid key re_secret' }));
    const error = (await mailer.send(mail).catch((caught: unknown) => caught)) as MailSendError;
    expect(error.message).not.toContain('re_secret');
  });

  it('wraps a network failure instead of leaking the raw error', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const error = await new ResendMailer('re_secret', 'a@example.com', fetcher)
      .send(mail)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MailSendError);
    expect((error as MailSendError).status).toBeUndefined();
  });

  it('copes with a non-JSON error body', async () => {
    const fetcher = vi.fn(async () => new Response('Bad gateway', { status: 502 })) as unknown as typeof fetch;
    const error = (await new ResendMailer('re_secret', 'a@example.com', fetcher)
      .send(mail)
      .catch((caught: unknown) => caught)) as MailSendError;
    expect(error.status).toBe(502);
  });
});

describe('SmtpMailer', () => {
  it('sends from the configured sender through the transport', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(transport, 'sendMail');
    await new SmtpMailer('smtp://localhost:1', 'AI Staff <no-reply@example.com>', transport).send(mail);
    expect(spy).toHaveBeenCalledWith({
      from: 'AI Staff <no-reply@example.com>',
      to: 'dana@example.com',
      subject: 'Hello',
      text: 'Plain body',
    });
  });

  it('wraps a transport failure in a MailSendError', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    vi.spyOn(transport, 'sendMail').mockRejectedValue(new Error('connect ECONNREFUSED'));
    const error = await new SmtpMailer('smtp://localhost:1', 'a@example.com', transport)
      .send(mail)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MailSendError);
  });
});

describe('createMailer', () => {
  it('builds the mailer EMAIL_PROVIDER names', () => {
    const from = 'AI Staff <no-reply@example.com>';
    expect(createMailer({ EMAIL_PROVIDER: 'smtp', SMTP_URL: 'smtp://localhost:1', MAIL_FROM: from })).toBeInstanceOf(
      SmtpMailer,
    );
    expect(createMailer({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x', MAIL_FROM: from })).toBeInstanceOf(
      ResendMailer,
    );
  });

  it('refuses a provider whose setting is missing, instead of failing at first send', () => {
    expect(() => createMailer({ EMAIL_PROVIDER: 'resend', MAIL_FROM: 'a@example.com' })).toThrow(/RESEND_API_KEY/);
    expect(() => createMailer({ EMAIL_PROVIDER: 'smtp', MAIL_FROM: 'a@example.com' })).toThrow(/SMTP_URL/);
  });
});
