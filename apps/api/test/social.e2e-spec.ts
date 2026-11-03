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
    expect(res.body.map((n: { network: string }) => n.network)).toEqual(['facebook', 'instagram', 'linkedin', 'x']);
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
