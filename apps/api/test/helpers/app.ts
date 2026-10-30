import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { Mailer, type OutgoingMail } from '../../src/mail/mail.module.js';

/** Collects platform emails instead of sending them, so tests can read codes and links. */
export class CaptureMailer extends Mailer {
  readonly sent: OutgoingMail[] = [];

  async send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail);
  }

  lastTo(address: string): OutgoingMail {
    const mail = [...this.sent].reverse().find((item) => item.to === address);
    if (!mail) throw new Error(`No email was sent to ${address}`);
    return mail;
  }

  codeFor(address: string): string {
    const code = this.lastTo(address).text.match(/code is (\d{6})/)?.[1];
    if (!code) throw new Error(`No verification code in the last email to ${address}`);
    return code;
  }

  tokenFor(address: string): string {
    const token = this.lastTo(address).text.match(/token=([A-Za-z0-9_%-]+)/)?.[1];
    if (!token) throw new Error(`No token link in the last email to ${address}`);
    return decodeURIComponent(token);
  }
}

type Client = Pick<ReturnType<typeof request>, 'get' | 'post' | 'patch' | 'delete'>;

export interface TestApp {
  app: INestApplication;
  mail: CaptureMailer;
  /** A client with its own IP address, so each test looks like a different visitor to the rate limits. */
  http: (ip?: string) => Client;
  close: () => Promise<void>;
}

let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};

export async function startApp(): Promise<TestApp> {
  const mail = new CaptureMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Mailer)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  const http = (ip = nextIp()): Client => {
    const agent = request(app.getHttpServer());
    return {
      get: (url: string) => agent.get(url).set('X-Forwarded-For', ip),
      post: (url: string) => agent.post(url).set('X-Forwarded-For', ip),
      patch: (url: string) => agent.patch(url).set('X-Forwarded-For', ip),
      delete: (url: string) => agent.delete(url).set('X-Forwarded-For', ip),
    };
  };
  return { app, mail, http, close: () => app.close() };
}

let counter = 0;
export const uniqueEmail = (label = 'user') => `${label}.${Date.now().toString(36)}.${(counter += 1)}@example.test`;

export const PASSWORD = 'correct horse battery';

/** Signs up, verifies and returns tokens for a fresh user. */
export async function signedInUser(t: TestApp, label = 'user', name = 'Test User') {
  const email = uniqueEmail(label);
  await t.http().post('/v1/auth/signup').send({ name, email, password: PASSWORD }).expect(202);
  const verified = await t
    .http()
    .post('/v1/auth/verify-email')
    .send({ email, code: t.mail.codeFor(email) })
    .expect(200);
  const tokens = verified.body as { accessToken: string; refreshToken: string };
  return { email, name, ...tokens, auth: { Authorization: `Bearer ${tokens.accessToken}` } };
}
