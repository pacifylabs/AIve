import { createDataSource, type DataSource, EarlyAccessSignup } from '@ai-staff/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp, type TestApp, uniqueEmail } from './helpers/app.js';

let t: TestApp;
let db: DataSource;

beforeAll(async () => {
  t = await startApp();
  db = await createDataSource({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME!,
    username: process.env.DB_APP_USER!,
    password: process.env.DB_APP_PASSWORD!,
    poolSize: 1,
  }).initialize();
});

afterAll(async () => {
  await db.destroy();
  await t.close();
});

describe('early access', () => {
  it('stores a sign-up and normalises the address', async () => {
    const email = uniqueEmail('ea');
    await t
      .http()
      .post('/v1/early-access')
      .send({
        email: `  ${email.toUpperCase()} `,
        website: 'northfield.studio',
        role: 'sales',
        firstTask: 'webinar follow-ups',
      })
      .expect(202, { status: 'on_list' });
    const row = await db.getRepository(EarlyAccessSignup).findOneByOrFail({ email });
    expect(row).toMatchObject({
      website: 'northfield.studio',
      role: 'sales',
      firstTask: 'webinar follow-ups',
      invitedAt: null,
    });
  });

  it('updates the same row when someone signs up twice, with the same answer', async () => {
    const email = uniqueEmail('ea-twice');
    const http = t.http();
    await http.post('/v1/early-access').send({ email, role: 'social' }).expect(202, { status: 'on_list' });
    await http.post('/v1/early-access').send({ email, role: 'both', website: '' }).expect(202, { status: 'on_list' });
    const rows = await db.getRepository(EarlyAccessSignup).findBy({ email });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'both', website: null });
  });

  it('an email-only sign-up never changes an address already on the list', async () => {
    const email = uniqueEmail('ea-footer');
    const http = t.http();
    await http
      .post('/v1/early-access')
      .send({ email, role: 'sales', website: 'northfield.studio', firstTask: 'webinar follow-ups' })
      .expect(202);
    await http.post('/v1/early-access').send({ email }).expect(202, { status: 'on_list' });
    expect(await db.getRepository(EarlyAccessSignup).findOneByOrFail({ email })).toMatchObject({
      role: 'sales',
      website: 'northfield.studio',
      firstTask: 'webinar follow-ups',
    });
  });

  it('defaults the role to both and leaves optional fields empty', async () => {
    const email = uniqueEmail('ea-min');
    await t.http().post('/v1/early-access').send({ email }).expect(202);
    expect(await db.getRepository(EarlyAccessSignup).findOneByOrFail({ email })).toMatchObject({
      role: 'both',
      website: null,
      firstTask: null,
    });
  });

  it('rejects bad input with field errors', async () => {
    const response = await t
      .http()
      .post('/v1/early-access')
      .send({ email: 'nope', website: 'not a site', role: 'ceo', firstTask: 'x'.repeat(201) })
      .expect(400);
    expect(response.body.code).toBe('validation_failed');
    expect(response.body.errors.map((error: { path: string }) => error.path).sort()).toEqual([
      'email',
      'firstTask',
      'role',
      'website',
    ]);
  });

  it('accepts a full URL as the website', async () => {
    const email = uniqueEmail('ea-url');
    await t.http().post('/v1/early-access').send({ email, website: 'https://northfield.studio/about' }).expect(202);
  });

  it('rate-limits repeated sign-ups from one address', async () => {
    const ip = '198.51.100.7';
    for (let i = 0; i < 10; i += 1)
      await t
        .http(ip)
        .post('/v1/early-access')
        .send({ email: uniqueEmail('ea-ip') })
        .expect(202);
    const limited = await t
      .http(ip)
      .post('/v1/early-access')
      .send({ email: uniqueEmail('ea-ip') })
      .expect(429);
    expect(limited.body.code).toBe('rate_limited');
  });
});
