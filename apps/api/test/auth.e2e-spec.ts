import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, signedInUser, startApp, type TestApp, uniqueEmail } from './helpers/app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startApp();
});

afterAll(async () => {
  await t.close();
});

describe('sign-up and email verification', () => {
  it('signs up, verifies with the emailed code, and signs straight in', async () => {
    const email = uniqueEmail('signup');
    await t
      .http()
      .post('/v1/auth/signup')
      .send({ name: 'Ada', email, password: PASSWORD })
      .expect(202, { status: 'check_email' });
    const verified = await t
      .http()
      .post('/v1/auth/verify-email')
      .send({ email, code: t.mail.codeFor(email) })
      .expect(200);
    expect(verified.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      accessTokenExpiresIn: 900,
    });
    const me = await t.http().get('/v1/me').set('Authorization', `Bearer ${verified.body.accessToken}`).expect(200);
    expect(me.body).toMatchObject({ email, name: 'Ada', emailVerified: true, mfaEnabled: false, workspaces: [] });
  });

  it('normalises the email address', async () => {
    const email = uniqueEmail('case');
    await t
      .http()
      .post('/v1/auth/signup')
      .send({ name: 'Case', email: `  ${email.toUpperCase()} `, password: PASSWORD })
      .expect(202);
    expect(() => t.mail.codeFor(email)).not.toThrow();
  });

  it('answers the same for an existing address and emails its owner instead', async () => {
    const user = await signedInUser(t, 'existing');
    const before = t.mail.sent.length;
    await t
      .http()
      .post('/v1/auth/signup')
      .send({ name: 'Someone', email: user.email, password: 'another password 123' })
      .expect(202, { status: 'check_email' });
    expect(t.mail.sent.length).toBe(before + 1);
    expect(t.mail.lastTo(user.email).subject).toMatch(/already have an AI Staff account/);
  });

  it('rejects invalid input with field errors', async () => {
    const response = await t
      .http()
      .post('/v1/auth/signup')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.body.code).toBe('validation_failed');
    expect(response.body.errors.map((error: { path: string }) => error.path).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
  });

  it('rejects a wrong code and burns the code after five wrong tries', async () => {
    const email = uniqueEmail('wrongcode');
    await t.http().post('/v1/auth/signup').send({ name: 'W', email, password: PASSWORD }).expect(202);
    const right = t.mail.codeFor(email);
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const response = await t.http().post('/v1/auth/verify-email').send({ email, code: wrong }).expect(400);
      expect(response.body.code).toBe('invalid_code');
    }
    const locked = await t.http().post('/v1/auth/verify-email').send({ email, code: right }).expect(400);
    expect(locked.body.code).toBe('code_expired');
  });

  it('only accepts the latest code after a resend', async () => {
    const email = uniqueEmail('resend');
    await t.http().post('/v1/auth/signup').send({ name: 'R', email, password: PASSWORD }).expect(202);
    const first = t.mail.codeFor(email);
    await t.http().post('/v1/auth/verify-email/resend').send({ email }).expect(202);
    const second = t.mail.codeFor(email);
    if (first !== second) {
      expect((await t.http().post('/v1/auth/verify-email').send({ email, code: first }).expect(400)).body.code).toBe(
        'invalid_code',
      );
    }
    await t.http().post('/v1/auth/verify-email').send({ email, code: second }).expect(200);
  });
});

describe('login', () => {
  it('logs in with the right password', async () => {
    const user = await signedInUser(t, 'login');
    const response = await t.http().post('/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
    expect(response.body).toMatchObject({ mfaRequired: false, accessToken: expect.any(String) });
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    const user = await signedInUser(t, 'wrongpass');
    const wrong = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'wrong password here' })
      .expect(401);
    const unknown = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'wrong password here' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.code).toBe('invalid_credentials');
  });

  it('refuses an unverified account and sends a fresh code', async () => {
    const email = uniqueEmail('unverified');
    await t.http().post('/v1/auth/signup').send({ name: 'U', email, password: PASSWORD }).expect(202);
    const before = t.mail.sent.length;
    const response = await t.http().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(403);
    expect(response.body.code).toBe('email_not_verified');
    expect(t.mail.sent.length).toBe(before + 1);
  });

  it('rate-limits repeated attempts on one address', async () => {
    const user = await signedInUser(t, 'ratelimit');
    for (let i = 0; i < 10; i += 1)
      await t.http().post('/v1/auth/login').send({ email: user.email, password: 'wrong password here' }).expect(401);
    const limited = await t.http().post('/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(429);
    expect(limited.body.code).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rate-limits sign-ups from one IP address', async () => {
    const ip = '192.0.2.10';
    for (let i = 0; i < 10; i += 1)
      await t
        .http(ip)
        .post('/v1/auth/signup')
        .send({ name: 'S', email: uniqueEmail('ipcap'), password: PASSWORD })
        .expect(202);
    await t
      .http(ip)
      .post('/v1/auth/signup')
      .send({ name: 'S', email: uniqueEmail('ipcap'), password: PASSWORD })
      .expect(429);
    await t
      .http('192.0.2.11')
      .post('/v1/auth/signup')
      .send({ name: 'S', email: uniqueEmail('ipcap'), password: PASSWORD })
      .expect(202);
  });

  it('rejects requests without a valid access token', async () => {
    expect((await t.http().get('/v1/me').expect(401)).body.code).toBe('unauthorized');
    await t.http().get('/v1/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
  });
});

describe('refresh tokens', () => {
  it('rotates on every use', async () => {
    const user = await signedInUser(t, 'rotate');
    const next = await t.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);
    expect(next.body.refreshToken).not.toBe(user.refreshToken);
    await t.http().post('/v1/auth/refresh').send({ refreshToken: next.body.refreshToken }).expect(200);
  });

  it('revokes the whole family when an old token is replayed', async () => {
    const user = await signedInUser(t, 'reuse');
    const next = await t.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);
    const replay = await t.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    expect(replay.body.code).toBe('refresh_token_reused');
    const after = await t.http().post('/v1/auth/refresh').send({ refreshToken: next.body.refreshToken }).expect(401);
    expect(after.body.code).toBe('refresh_token_invalid');
  });

  it('ends the session on logout', async () => {
    const user = await signedInUser(t, 'logout');
    await t.http().post('/v1/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
    await t.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
  });

  it('rejects an unknown token', async () => {
    expect((await t.http().post('/v1/auth/refresh').send({ refreshToken: 'made-up' }).expect(401)).body.code).toBe(
      'refresh_token_invalid',
    );
  });
});

describe('password reset', () => {
  it('resets the password, signs out every session and invalidates access tokens', async () => {
    const user = await signedInUser(t, 'reset');
    await t.http().post('/v1/auth/password/forgot').send({ email: user.email }).expect(202);
    const token = t.mail.tokenFor(user.email);
    await t.http().post('/v1/auth/password/reset').send({ token, password: 'a brand new password' }).expect(204);

    await t.http().get('/v1/me').set(user.auth).expect(401);
    await t.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    await t.http().post('/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
    await t.http().post('/v1/auth/login').send({ email: user.email, password: 'a brand new password' }).expect(200);
    expect(
      (await t.http().post('/v1/auth/password/reset').send({ token, password: 'another new password' }).expect(400))
        .body.code,
    ).toBe('code_expired');
  });

  it('answers the same for an unknown address and sends nothing', async () => {
    const before = t.mail.sent.length;
    await t
      .http()
      .post('/v1/auth/password/forgot')
      .send({ email: uniqueEmail('ghost') })
      .expect(202, { status: 'check_email' });
    expect(t.mail.sent.length).toBe(before);
  });
});

describe('two-step sign-in (TOTP)', () => {
  const codeFrom = (secret: string) =>
    new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();

  it('enrols, then requires the code at login, then can be turned off', async () => {
    const user = await signedInUser(t, 'mfa');
    const enrol = await t.http().post('/v1/auth/mfa/enable').set(user.auth).expect(200);
    expect(enrol.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(
      (await t.http().post('/v1/auth/mfa/verify').set(user.auth).send({ code: '000000' }).expect(400)).body.code,
    ).toBe('invalid_code');
    await t
      .http()
      .post('/v1/auth/mfa/verify')
      .set(user.auth)
      .send({ code: codeFrom(enrol.body.secret) })
      .expect(204);

    const login = await t.http().post('/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
    expect(login.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    await t.http().post('/v1/auth/login/mfa').send({ mfaToken: login.body.mfaToken, code: '000000' }).expect(401);
    const done = await t
      .http()
      .post('/v1/auth/login/mfa')
      .send({ mfaToken: login.body.mfaToken, code: codeFrom(enrol.body.secret) })
      .expect(200);
    expect(done.body.accessToken).toEqual(expect.any(String));

    // An MFA step token is not an access token.
    await t.http().get('/v1/me').set('Authorization', `Bearer ${login.body.mfaToken}`).expect(401);

    await t
      .http()
      .post('/v1/auth/mfa/disable')
      .set(user.auth)
      .send({ code: codeFrom(enrol.body.secret), password: 'wrong password!!' })
      .expect(400);
    await t
      .http()
      .post('/v1/auth/mfa/disable')
      .set(user.auth)
      .send({ code: codeFrom(enrol.body.secret), password: PASSWORD })
      .expect(204);
    expect(
      (await t.http().post('/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(200)).body
        .mfaRequired,
    ).toBe(false);
  });
});

describe('health', () => {
  it('reports live and ready outside the /v1 prefix', async () => {
    await t.http().get('/health/live').expect(200, { status: 'ok' });
    await t.http().get('/health/ready').expect(200, { status: 'ok' });
  });

  it('answers unknown routes with a problem document', async () => {
    const response = await t.http().get('/v1/nope').expect(404);
    expect(response.body.code).toBe('not_found');
  });
});
