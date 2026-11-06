import { createHmac } from 'node:crypto';
import {
  ConnectedAccount,
  createDataSource,
  type DataSource,
  PublishIntent,
  SocialPost,
  StaffMember,
  withTenant,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signedInUser, startApp, type TestApp } from './helpers/app.js';

// The key Threads signs its callbacks with, set before the app reads its settings.
process.env.THREADS_APP_SECRET = 'threads-test-secret';

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
    poolSize: 2,
  }).initialize();
});

afterAll(async () => {
  await db.destroy();
  await t.close();
});

async function workspace(label: string) {
  const owner = await signedInUser(t, label);
  const ws = (
    await t
      .http()
      .post('/v1/workspaces')
      .set(owner.auth)
      .send({ name: `${label} Co` })
      .expect(201)
  ).body as { id: string };
  return { owner, workspaceId: ws.id, as: { ...owner.auth, 'X-Workspace-Id': ws.id } };
}

/** Runs the whole sign-in dance against the fixture network and returns the pending id the browser lands on. */
async function signIn(as: Record<string, string>, network = 'facebook') {
  const start = await t.http().post(`/v1/social/accounts/connect/${network}`).set(as).expect(200);
  const state = new URL(start.body.authUrl).searchParams.get('state')!;
  const callback = await t.http().get(`/v1/social/callback/${network}`).query({ code: 'abc', state }).expect(302);
  const landed = new URL(callback.headers.location!);
  return { state, landed };
}

describe('connecting a social account', () => {
  it('lists networks and says which are configured', async () => {
    const w = await workspace('net1');
    const res = await t.http().get('/v1/social/networks').set(w.as).expect(200);
    expect(res.body.map((n: { network: string }) => n.network)).toEqual([
      'facebook',
      'instagram',
      'linkedin',
      'threads',
      'tiktok',
      'x',
      'telegram',
      'discord',
    ]);
  });

  it('walks the sign-in, offers the accounts, saves the chosen one, and never returns a token', async () => {
    const w = await workspace('conn1');
    t.social.facebook.accounts = [
      { externalId: 'page-1', name: 'Northfield Studio', kind: 'page', accessToken: 'page-secret-token' },
      { externalId: 'page-2', name: 'Other Page', kind: 'page' },
    ];
    const { landed } = await signIn(w.as);
    expect(landed.pathname).toBe('/app/accounts');
    const pending = landed.searchParams.get('pending')!;

    const offered = await t.http().get(`/v1/social/pending/${pending}`).set(w.as).expect(200);
    expect(offered.body.accounts.map((a: { name: string }) => a.name)).toEqual(['Northfield Studio', 'Other Page']);
    expect(JSON.stringify(offered.body)).not.toMatch(
      /page-secret-token|fixture-token|accessToken|refreshToken|secretEnc/,
    );

    const saved = await t
      .http()
      .post(`/v1/social/pending/${pending}/select`)
      .set(w.as)
      .send({ externalIds: ['page-1'] })
      .expect(200);
    expect(saved.body).toHaveLength(1);
    expect(saved.body[0]).toMatchObject({ network: 'facebook', name: 'Northfield Studio', health: 'ok' });
    expect(JSON.stringify(saved.body)).not.toMatch(
      /page-secret-token|fixture-token|accessToken|refreshToken|secretEnc/,
    );

    const stored = await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.findOneByOrFail(ConnectedAccount, { workspaceId: w.workspaceId }),
    );
    expect(stored.secretEnc).toMatch(/^v1\./);
    expect(stored.secretEnc).not.toContain('page-secret-token');
    // The choice is spent: choosing again does nothing.
    await t
      .http()
      .post(`/v1/social/pending/${pending}/select`)
      .set(w.as)
      .send({ externalIds: ['page-2'] })
      .expect(404);
  });

  it('a state works once, and a replayed callback does nothing', async () => {
    const w = await workspace('conn2');
    t.social.facebook.accounts = [{ externalId: 'p', name: 'P', kind: 'page' }];
    const { state } = await signIn(w.as);
    const again = await t.http().get('/v1/social/callback/facebook').query({ code: 'abc', state }).expect(302);
    expect(new URL(again.headers.location!).searchParams.get('error')).toMatch(/expired/i);
  });

  it('the state is tied to its network, and a denied sign-in connects nothing', async () => {
    const w = await workspace('conn3');
    const start = await t.http().post('/v1/social/accounts/connect/facebook').set(w.as).expect(200);
    const state = new URL(start.body.authUrl).searchParams.get('state')!;
    const wrong = await t.http().get('/v1/social/callback/instagram').query({ code: 'abc', state }).expect(302);
    expect(new URL(wrong.headers.location!).searchParams.get('error')).toMatch(/did not match/i);

    const second = await t.http().post('/v1/social/accounts/connect/facebook').set(w.as).expect(200);
    const state2 = new URL(second.body.authUrl).searchParams.get('state')!;
    const denied = await t
      .http()
      .get('/v1/social/callback/facebook')
      .query({ error: 'access_denied', state: state2 })
      .expect(302);
    expect(new URL(denied.headers.location!).searchParams.get('error')).toMatch(/did not allow/i);
    expect((await t.http().get('/v1/social/accounts').set(w.as).expect(200)).body).toEqual([]);
  });

  it("someone else cannot read or save another person's pending connection", async () => {
    const a = await workspace('conn4a');
    const b = await workspace('conn4b');
    t.social.facebook.accounts = [{ externalId: 'p', name: 'P', kind: 'page' }];
    const pending = (await signIn(a.as)).landed.searchParams.get('pending')!;
    await t.http().get(`/v1/social/pending/${pending}`).set(b.as).expect(404);
    await t
      .http()
      .post(`/v1/social/pending/${pending}/select`)
      .set(b.as)
      .send({ externalIds: ['p'] })
      .expect(404);
  });

  it('refuses an unknown network, and a callback with no state goes back with a readable error', async () => {
    const w = await workspace('conn5');
    await t.http().post('/v1/social/accounts/connect/myspace').set(w.as).expect(404);
    const res = await t.http().get('/v1/social/callback/facebook').expect(302);
    expect(new URL(res.headers.location!).searchParams.get('error')).toBeTruthy();
  });

  it('connecting again refreshes the same account and clears a broken state', async () => {
    const w = await workspace('conn6');
    t.social.facebook.accounts = [{ externalId: 'p', name: 'P', kind: 'page' }];
    const first = (await signIn(w.as)).landed.searchParams.get('pending')!;
    const [account] = (
      await t
        .http()
        .post(`/v1/social/pending/${first}/select`)
        .set(w.as)
        .send({ externalIds: ['p'] })
        .expect(200)
    ).body as { id: string }[];
    await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.update(ConnectedAccount, { id: account!.id }, { health: 'broken', healthReason: 'The token is invalid.' }),
    );
    const second = (await signIn(w.as)).landed.searchParams.get('pending')!;
    const [again] = (
      await t
        .http()
        .post(`/v1/social/pending/${second}/select`)
        .set(w.as)
        .send({ externalIds: ['p'] })
        .expect(200)
    ).body as { id: string; health: string }[];
    expect(again).toMatchObject({ id: account!.id, health: 'ok' });
    expect((await t.http().get('/v1/social/accounts').set(w.as).expect(200)).body).toHaveLength(1);
  });
});

describe('posts and disconnecting', () => {
  async function accountWithPost(label: string) {
    const w = await workspace(label);
    t.social.facebook.accounts = [{ externalId: 'p', name: 'Northfield', kind: 'page' }];
    const pending = (await signIn(w.as)).landed.searchParams.get('pending')!;
    const [account] = (
      await t
        .http()
        .post(`/v1/social/pending/${pending}/select`)
        .set(w.as)
        .send({ externalIds: ['p'] })
        .expect(200)
    ).body as { id: string }[];
    const post = await withTenant(db, { workspaceId: w.workspaceId, userId: null }, async (m) => {
      const staff = await m.save(
        m.create(StaffMember, {
          workspaceId: w.workspaceId,
          roleKey: 'social_media',
          roleVersion: 1,
          displayName: 'Sam',
          signature: null,
          disclosure: 'ai_labelled',
          settings: {},
          state: 'active',
          pausedReason: null,
          dailyCapUsd: null,
        }),
      );
      const post = await m.save(
        m.create(SocialPost, {
          workspaceId: w.workspaceId,
          staffId: staff.id,
          accountId: account!.id,
          body: 'Hello',
          linkUrl: null,
          firstComment: null,
          media: [],
          state: 'scheduled',
          scheduledFor: new Date(Date.now() + 86_400_000),
          publishedAt: null,
          externalPostId: null,
          permalink: null,
        }),
      );
      await m.save(
        m.create(PublishIntent, {
          workspaceId: w.workspaceId,
          staffId: staff.id,
          accountId: account!.id,
          postId: post.id,
          idempotencyKey: `k-${uuidv7()}`,
          state: 'pending',
          notBefore: post.scheduledFor,
          claimedAt: null,
          attempts: 0,
          error: null,
          externalPostId: null,
        }),
      );
      return post;
    });
    return { ...w, account: account!, post };
  }

  it('lists posts for the calendar and cancels one that has not gone out', async () => {
    const w = await accountWithPost('post1');
    const list = await t.http().get('/v1/social/posts').set(w.as).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: w.post.id,
        state: 'scheduled',
        account: expect.objectContaining({ name: 'Northfield' }),
        publish: expect.objectContaining({ state: 'pending' }),
      }),
    ]);
    await t.http().post(`/v1/social/posts/${w.post.id}/cancel`).set(w.as).expect(200);
    await t.http().post(`/v1/social/posts/${w.post.id}/cancel`).set(w.as).expect(409);
  });

  it('shows a post the network is still processing, and says why it cannot be cancelled', async () => {
    const w = await accountWithPost('post1b');
    await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.update(
        PublishIntent,
        { postId: w.post.id },
        { state: 'processing', ticket: 'container-1', processingSince: new Date(), checkAfter: new Date() },
      ),
    );
    const [row] = (await t.http().get('/v1/social/posts').set(w.as).expect(200)).body as {
      state: string;
      publish: { state: string };
    }[];
    expect(row).toMatchObject({ state: 'scheduled', publish: { state: 'processing' } });
    const refused = await t.http().post(`/v1/social/posts/${w.post.id}/cancel`).set(w.as).expect(409);
    expect(refused.body.title).toMatch(/already processing/);
  });

  it('only a failed or unclear post can be settled, and retrying queues it again', async () => {
    const w = await accountWithPost('post2');
    await t.http().post(`/v1/social/posts/${w.post.id}/resolve`).set(w.as).send({ outcome: 'retry' }).expect(409);
    await withTenant(db, { workspaceId: w.workspaceId, userId: null }, async (m) => {
      await m.update(SocialPost, { id: w.post.id }, { state: 'failed' });
      await m.update(PublishIntent, { postId: w.post.id }, { state: 'uncertain' });
    });
    await t.http().post(`/v1/social/posts/${w.post.id}/resolve`).set(w.as).send({ outcome: 'retry' }).expect(200);
    const intents = await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.find(PublishIntent, { where: { postId: w.post.id } }),
    );
    expect(intents.map((i) => i.state).sort()).toEqual(['pending', 'uncertain']);
  });

  it('disconnecting stops what was waiting, wipes the tokens and keeps the history', async () => {
    const w = await accountWithPost('post3');
    await t.http().delete(`/v1/social/accounts/${w.account.id}`).set(w.as).expect(204);
    const row = await withTenant(db, { workspaceId: w.workspaceId, userId: null }, async (m) => ({
      account: await m.findOneByOrFail(ConnectedAccount, { id: w.account.id }),
      post: await m.findOneByOrFail(SocialPost, { id: w.post.id }),
      intent: await m.findOneByOrFail(PublishIntent, { postId: w.post.id }),
    }));
    expect(row.account.health).toBe('broken');
    expect(row.post.state).toBe('cancelled');
    expect(row.intent.state).toBe('cancelled');
  });

  it('another workspace cannot see, cancel or disconnect them', async () => {
    const a = await accountWithPost('post4a');
    const b = await workspace('post4b');
    expect((await t.http().get('/v1/social/posts').set(b.as).expect(200)).body).toEqual([]);
    await t.http().post(`/v1/social/posts/${a.post.id}/cancel`).set(b.as).expect(404);
    await t.http().delete(`/v1/social/accounts/${a.account.id}`).set(b.as).expect(404);
  });
});

describe('hiring Social Media Staff', () => {
  it('only accepts accounts of its own workspace', async () => {
    const a = await workspace('hire1a');
    const b = await workspace('hire1b');
    t.social.facebook.accounts = [{ externalId: 'p', name: 'P', kind: 'page' }];
    const pending = (await signIn(a.as)).landed.searchParams.get('pending')!;
    const [account] = (
      await t
        .http()
        .post(`/v1/social/pending/${pending}/select`)
        .set(a.as)
        .send({ externalIds: ['p'] })
        .expect(200)
    ).body as { id: string }[];
    const stranger = await t
      .http()
      .post('/v1/staff')
      .set(b.as)
      .send({ roleKey: 'social_media', displayName: 'Sam', settings: { accountIds: [account!.id] } })
      .expect(400);
    expect(stranger.body.errors[0].path).toBe('settings.accountIds');
    await t
      .http()
      .post('/v1/staff')
      .set(a.as)
      .send({ roleKey: 'social_media', displayName: 'Sam', settings: { accountIds: [account!.id], cadence: 2 } })
      .expect(201);
  });
});

describe('networks that connect with a pasted login', () => {
  const connect = (as: Record<string, string>, network: string, credentials: Record<string, string>) =>
    t.http().post(`/v1/social/accounts/connect/${network}/credentials`).set(as).send({ credentials });

  it('lists them as ready, with the boxes to fill in', async () => {
    const { as } = await workspace('cred1');
    const list = (await t.http().get('/v1/social/networks').set(as).expect(200)).body as {
      network: string;
      auth: string;
      configured: boolean;
      fields: { name: string; hint: string }[];
    }[];
    expect(list.find((entry) => entry.network === 'telegram')).toMatchObject({
      auth: 'credentials',
      configured: true,
      fields: [expect.objectContaining({ name: 'token' })],
    });
    expect(list.find((entry) => entry.network === 'facebook')).toMatchObject({ auth: 'oauth', fields: [] });
  });

  it('saves the account, shows it without any secret, and connects it again without making a second one', async () => {
    const { as, workspaceId } = await workspace('cred2');
    t.social.telegram.accounts = [
      { externalId: 'did:plc:one', name: 'one.example', username: 'one.example', kind: 'profile' },
    ];
    const first = await connect(as, 'telegram', { token: 'secret-one' }).expect(200);
    expect(first.body).toEqual([expect.objectContaining({ network: 'telegram', name: 'one.example', health: 'ok' })]);
    expect(JSON.stringify(first.body)).not.toContain('secret-one');

    await connect(as, 'telegram', { token: 'secret-two' }).expect(200);
    const listed = (await t.http().get('/v1/social/accounts').set(as).expect(200)).body as { id: string }[];
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain('secret');

    // What is stored is encrypted, never the token as typed.
    const stored = await withTenant(db, { workspaceId, userId: null }, (m) =>
      m.find(ConnectedAccount, { where: { workspaceId } }),
    );
    expect(stored[0]!.secretEnc).not.toContain('secret');
  });

  it('refuses a login the network does not accept, with its words, and saves nothing', async () => {
    const { as } = await workspace('cred3');
    const response = await connect(as, 'telegram', { token: 'bad' }).expect(400);
    expect(response.body.errors).toEqual([{ path: 'credentials', message: 'The fixture refused that token.' }]);
    expect((await t.http().get('/v1/social/accounts').set(as).expect(200)).body).toEqual([]);
  });

  it('is only for networks without a sign-in page, and only for networks that exist', async () => {
    const { as } = await workspace('cred4');
    await connect(as, 'x', { token: 'a' }).expect(409);
    await connect(as, 'myspace', { token: 'a' }).expect(404);
    await t.http().post('/v1/social/accounts/connect/telegram/credentials').set(as).send({}).expect(400);
  });

  it('limits attempts, since each one calls another company’s server', async () => {
    const { as } = await workspace('cred5');
    for (let attempt = 0; attempt < 10; attempt += 1) await connect(as, 'telegram', { token: 'bad' }).expect(400);
    await connect(as, 'telegram', { token: 'bad' }).expect(429);
  });
});

describe('feeds', () => {
  async function hired(label: string) {
    const w = await workspace(label);
    t.social.facebook.accounts = [{ externalId: 'p', name: 'Northfield', kind: 'page' }];
    const pending = (await signIn(w.as)).landed.searchParams.get('pending')!;
    const [account] = (
      await t
        .http()
        .post(`/v1/social/pending/${pending}/select`)
        .set(w.as)
        .send({ externalIds: ['p'] })
        .expect(200)
    ).body as { id: string }[];
    await t
      .http()
      .post('/v1/staff')
      .set(w.as)
      .send({ roleKey: 'social_media', displayName: 'Sam', settings: { accountIds: [account!.id], cadence: 2 } })
      .expect(201);
    return { ...w, account: account! };
  }
  const add = (as: Record<string, string>, body: Record<string, unknown>) =>
    t.http().post('/v1/social/feeds').set(as).send(body);

  it('adds a feed, lists it with its accounts, and refuses the same address twice', async () => {
    const w = await hired('feed1');
    const body = { url: 'https://blog.example.com/feed.xml', accountIds: [w.account.id] };
    const created = await add(w.as, body).expect(201);
    expect(created.body).toMatchObject({ queued: 1 });
    const list = (await t.http().get('/v1/social/feeds').set(w.as).expect(200)).body as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ url: body.url, state: 'active', accountIds: [w.account.id], articles: [] });
    await add(w.as, body).expect(409);
  });

  it('refuses an address that is not a feed, naming the box, and saves nothing', async () => {
    const w = await hired('feed2');
    const response = await add(w.as, { url: 'https://example.com/not-a-feed', accountIds: [w.account.id] }).expect(400);
    expect(response.body.errors[0]).toMatchObject({ path: 'url' });
    expect((await t.http().get('/v1/social/feeds').set(w.as).expect(200)).body).toEqual([]);
  });

  it('only accepts web addresses and accounts of its own workspace', async () => {
    const a = await hired('feed3a');
    const b = await hired('feed3b');
    await add(a.as, { url: 'file:///etc/passwd', accountIds: [a.account.id] }).expect(400);
    await add(a.as, { url: 'https://blog.example.com/feed', accountIds: [] }).expect(400);
    const stranger = await add(b.as, { url: 'https://blog.example.com/feed', accountIds: [a.account.id] }).expect(400);
    expect(stranger.body.errors[0].path).toBe('accountIds');
  });

  it('needs a Social Media Staff member to write the posts', async () => {
    const w = await workspace('feed4');
    t.social.facebook.accounts = [{ externalId: 'p', name: 'P', kind: 'page' }];
    const pending = (await signIn(w.as)).landed.searchParams.get('pending')!;
    const [account] = (
      await t
        .http()
        .post(`/v1/social/pending/${pending}/select`)
        .set(w.as)
        .send({ externalIds: ['p'] })
        .expect(200)
    ).body as { id: string }[];
    await add(w.as, { url: 'https://blog.example.com/feed', accountIds: [account!.id] }).expect(409);
  });

  it('pauses, resumes, checks and removes a feed, and another workspace cannot touch it', async () => {
    const w = await hired('feed5');
    const other = await hired('feed5b');
    const { id } = (await add(w.as, { url: 'https://blog.example.com/a.xml', accountIds: [w.account.id] }).expect(201))
      .body as { id: string };

    await t.http().patch(`/v1/social/feeds/${id}`).set(other.as).send({ paused: true }).expect(404);
    await t.http().delete(`/v1/social/feeds/${id}`).set(other.as).expect(404);

    await t.http().patch(`/v1/social/feeds/${id}`).set(w.as).send({ paused: true }).expect(200);
    await t.http().post(`/v1/social/feeds/${id}/check`).set(w.as).expect(409);
    await t.http().patch(`/v1/social/feeds/${id}`).set(w.as).send({ paused: false }).expect(200);
    const checked = await t.http().post(`/v1/social/feeds/${id}/check`).set(w.as).expect(200);
    expect(checked.body).toMatchObject({ queued: 1, state: 'active' });
    await t.http().patch(`/v1/social/feeds/${id}`).set(w.as).send({}).expect(400);

    await t.http().delete(`/v1/social/feeds/${id}`).set(w.as).expect(204);
    expect((await t.http().get('/v1/social/feeds').set(w.as).expect(200)).body).toEqual([]);
  });
});

describe('Threads removing our access', () => {
  const sign = (userId: string, secret = 'threads-test-secret') => {
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: userId })).toString('base64url');
    return `${createHmac('sha256', secret).update(payload).digest('base64url')}.${payload}`;
  };
  async function threadsAccount(label: string) {
    const w = await workspace(label);
    const externalId = `th-${uuidv7()}`;
    const account = await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.save(
        m.create(ConnectedAccount, {
          workspaceId: w.workspaceId,
          network: 'threads',
          externalId,
          name: '@northfield',
          username: 'northfield',
          parentExternalId: null,
          secretEnc: 'placeholder',
          tokenExpiresAt: null,
          scopes: [],
          health: 'ok',
          healthReason: null,
          lastCheckedAt: null,
          metadata: {},
        }),
      ),
    );
    return { ...w, account, externalId };
  }
  const health = (workspaceId: string, id: string) =>
    withTenant(db, { workspaceId, userId: null }, (m) => m.findOneByOrFail(ConnectedAccount, { id }));
  const call = (path: string, signed: string) =>
    t.http().post(`/v1/social/threads/${path}`).type('form').send({ signed_request: signed });

  it('disconnects the account when Threads says the person removed the app', async () => {
    const w = await threadsAccount('revoke1');
    await call('deauthorize', sign(w.externalId)).expect(200);
    const after = await health(w.workspaceId, w.account.id);
    expect(after.health).toBe('broken');
    expect(after.healthReason).toMatch(/removed this app's access/);
    expect(after.secretEnc).not.toBe('placeholder');
  });

  it('answers a deletion request with a page and a code, and removes the connection', async () => {
    const w = await threadsAccount('revoke2');
    const response = await call('data-deletion', sign(w.externalId)).expect(200);
    expect(response.body.confirmation_code).toMatch(/^[\w-]{16}$/);
    expect(response.body.url).toContain(`/data-deletion?code=${response.body.confirmation_code}`);
    expect((await health(w.workspaceId, w.account.id)).healthReason).toMatch(/asked the network to delete/);
  });

  it('ignores a message that is not signed with the Threads secret, and leaves the account alone', async () => {
    const w = await threadsAccount('revoke3');
    await call('deauthorize', sign(w.externalId, 'someone-elses-secret')).expect(400);
    await call('deauthorize', 'not-a-signed-request').expect(400);
    await t.http().post('/v1/social/threads/deauthorize').send({}).expect(400);
    expect((await health(w.workspaceId, w.account.id)).health).toBe('ok');
  });

  it('does nothing, quietly, for a person we never connected', async () => {
    await call('deauthorize', sign('nobody-we-know')).expect(200);
  });
});
