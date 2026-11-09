import { randomBytes } from 'node:crypto';
import { ConnectedAccount, type DataSource, PublishIntent, SocialPost, StaffMember } from '@ai-staff/db';
import { FixtureSocialProvider, SocialProviders } from '@ai-staff/social';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accountBinding,
  APPROVED_PAYLOAD,
  checkDelayMs,
  type Effect,
  EffectExecutor,
  type EffectOrigin,
  Keyring,
  PostPublisher,
  rateLimitBackoffMs,
  withApprovedPayload,
} from '../src/index.js';
import { activity, clock, connect, events, inWorkspace, seedWorkspace } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

const keyring = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');

async function setup() {
  const ws = await seedWorkspace(db);
  const time = clock('2026-11-03T10:00:00Z');
  const network = new FixtureSocialProvider('facebook');
  const publisher = new PostPublisher(db, { keyring, providers: new SocialProviders({}, [network]), now: time.now });
  const { account, staff } = await inWorkspace(db, ws.workspaceId, async (m) => {
    const staff = await m.save(
      m.create(StaffMember, {
        workspaceId: ws.workspaceId,
        roleKey: 'dummy',
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
    const id = (
      await m.save(
        m.create(ConnectedAccount, {
          workspaceId: ws.workspaceId,
          network: 'facebook',
          externalId: 'page-1',
          name: 'Northfield Studio',
          username: null,
          parentExternalId: null,
          secretEnc: 'placeholder',
          tokenExpiresAt: null,
          scopes: [],
          health: 'ok',
          healthReason: null,
          lastCheckedAt: null,
          metadata: {},
        }),
      )
    ).id;
    const secretEnc = keyring.encrypt(
      JSON.stringify({ accessToken: 'tok', refreshToken: 'ref' }),
      accountBinding({ workspaceId: ws.workspaceId, id }),
    );
    await m.update(ConnectedAccount, { id }, { secretEnc });
    return { staff, account: await m.findOneByOrFail(ConnectedAccount, { id }) };
  });
  const origin: EffectOrigin = {
    workspaceId: ws.workspaceId,
    staffId: staff.id,
    taskType: 'dummy.draft_note',
    taskRunId: null,
    profileVersion: null,
    factIds: [],
    actor: 'staff',
  };
  const execute = (effects: Effect[]) =>
    inWorkspace(db, ws.workspaceId, (m) => new EffectExecutor(time.now).execute(m, origin, effects));
  const queue = (extra: Partial<Extract<Effect, { type: 'createPublishIntent' }>> = {}) =>
    execute([
      {
        type: 'createPublishIntent',
        accountId: account.id,
        body: 'Our Starter plan is $1,200 a year.',
        media: [],
        scheduledFor: '2026-11-03T10:00:00Z',
        idempotencyKey: 'post:1',
        ...extra,
      },
    ]);
  const intents = () =>
    inWorkspace(db, ws.workspaceId, (m) => m.find(PublishIntent, { where: { workspaceId: ws.workspaceId } }));
  const post = () =>
    inWorkspace(db, ws.workspaceId, (m) => m.findOneByOrFail(SocialPost, { workspaceId: ws.workspaceId }));
  const publishDue = async () => {
    const out = [];
    for (const due of await publisher.due())
      if (due.workspaceId === ws.workspaceId) out.push(await publisher.dispatch(due.workspaceId, due.id));
    return out;
  };
  return { ...ws, time, network, publisher, account, staff, queue, intents, post, publishDue };
}

describe('publish intents and the publisher', () => {
  it('queues once per key, publishes once at the time, and records the permalink', async () => {
    const s = await setup();
    await s.queue();
    await s.queue();
    expect(await s.intents()).toHaveLength(1);
    expect(await s.publishDue()).toEqual(['sent']);
    expect(await s.publishDue()).toEqual([]);
    expect(s.network.posts).toHaveLength(1);
    expect(s.network.posts[0]).toMatchObject({
      accessToken: 'tok',
      externalId: 'page-1',
      body: 'Our Starter plan is $1,200 a year.',
    });
    const post = await s.post();
    expect(post).toMatchObject({ state: 'published' });
    expect(post.permalink).toMatch(/fixture\.test/);
    expect((await events(db, s.workspaceId)).map((e) => e.type)).toContain('post.published');
  });

  it('waits for the scheduled time', async () => {
    const s = await setup();
    await s.queue({ scheduledFor: '2026-11-04T09:00:00Z' });
    expect(await s.publishDue()).toEqual([]);
    s.time.set('2026-11-04T09:00:00Z');
    expect(await s.publishDue()).toEqual(['sent']);
  });

  it('two publishers racing cannot post twice', async () => {
    const s = await setup();
    await s.queue();
    const [due] = await s.publisher.due();
    const results = await Promise.all([
      s.publisher.dispatch(s.workspaceId, due!.id),
      s.publisher.dispatch(s.workspaceId, due!.id),
    ]);
    expect(results.sort()).toEqual(['sent', 'skipped']);
    expect(s.network.posts).toHaveLength(1);
  });

  it('an auth error breaks the account and pauses its posts until it is reconnected', async () => {
    const s = await setup();
    await s.queue();
    s.network.next = 'auth';
    expect(await s.publishDue()).toEqual(['held']);
    const account = await inWorkspace(db, s.workspaceId, (m) =>
      m.findOneByOrFail(ConnectedAccount, { id: s.account.id }),
    );
    expect(account.health).toBe('broken');
    expect((await activity(db, s.workspaceId)).map((e) => e.type)).toContain('account.broken');
    expect(await s.publishDue()).toEqual([]);

    await inWorkspace(db, s.workspaceId, (m) =>
      m.update(ConnectedAccount, { id: s.account.id }, { health: 'ok', healthReason: null }),
    );
    expect(await s.publishDue()).toEqual(['sent']);
  });

  it('a rate limit backs off, then fails the post after five attempts', async () => {
    const s = await setup();
    await s.queue();
    s.network.next = 'rate_limit';
    expect(await s.publishDue()).toEqual(['held']);
    expect(await s.publishDue()).toEqual([]);
    s.time.advance(5 * 60_000);
    expect(await s.publishDue()).toEqual(['sent']);

    const exhausted = await setup();
    await exhausted.queue();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      exhausted.network.next = 'rate_limit';
      await exhausted.publishDue();
      exhausted.time.advance(61 * 60_000);
    }
    expect((await exhausted.intents())[0]?.state).toBe('failed');
    expect((await exhausted.post()).state).toBe('failed');
  });

  it('computes back-off from five minutes, doubling, capped at an hour', () => {
    expect([1, 2, 3, 4, 5, 8].map(rateLimitBackoffMs)).toEqual([5, 10, 20, 40, 60, 60].map((m) => m * 60_000));
  });

  it('a refusal fails the post for good', async () => {
    const s = await setup();
    await s.queue();
    s.network.next = 'refuse';
    expect(await s.publishDue()).toEqual(['failed']);
    expect((await s.post()).state).toBe('failed');
  });

  it('a dropped connection is uncertain, never resent, and settles when the post is found', async () => {
    const s = await setup();
    await s.queue();
    s.network.next = 'drop';
    expect(await s.publishDue()).toEqual(['uncertain']);
    expect(await s.publishDue()).toEqual([]);
    const [intent] = await s.intents();
    expect(await s.publisher.reconcile(s.workspaceId, intent!.id)).toBe('found');
    expect((await s.intents())[0]?.state).toBe('sent');
    expect(s.network.posts).toHaveLength(1);
    expect((await s.post()).state).toBe('published');
  });

  it('a post that is not on the network is handed to a person after 30 minutes, never retried', async () => {
    const s = await setup();
    await s.queue();
    s.network.next = 'drop_and_lose';
    expect(await s.publishDue()).toEqual(['uncertain']);
    const [intent] = await s.intents();
    expect(await s.publisher.reconcile(s.workspaceId, intent!.id)).toBe('waiting');
    s.time.advance(31 * 60_000);
    expect(await s.publisher.reconcile(s.workspaceId, intent!.id)).toBe('gave_up');
    expect((await s.intents())[0]?.state).toBe('failed');
    expect(await s.publishDue()).toEqual([]);
    expect(s.network.posts).toHaveLength(0);
    expect((await activity(db, s.workspaceId)).map((e) => e.type)).toContain('post.unconfirmed');
  });

  it('marks a publish abandoned mid-flight as uncertain', async () => {
    const s = await setup();
    await s.queue();
    await inWorkspace(db, s.workspaceId, (m) =>
      m.update(
        PublishIntent,
        { workspaceId: s.workspaceId },
        { state: 'sending', claimedAt: new Date('2026-11-03T09:00:00Z') },
      ),
    );
    expect(await s.publisher.reapStuck()).toBeGreaterThanOrEqual(1);
    expect((await s.intents())[0]?.state).toBe('uncertain');
  });

  it('holds a post that is more than a day late for a person instead of publishing it late', async () => {
    const s = await setup();
    await s.queue({ idempotencyKey: 'late', scheduledFor: '2026-11-03T10:00:00Z', body: 'A stale offer' });
    await s.queue({ idempotencyKey: 'recent', scheduledFor: '2026-11-04T09:00:00Z', body: 'Only slightly late' });
    s.time.set('2026-11-04T11:00:00Z'); // first is 25 hours late, second is 2 hours late
    expect(await s.publisher.holdStale()).toBe(1);
    const intents = await s.intents();
    expect(intents.find((i) => i.idempotencyKey === 'late')).toMatchObject({
      state: 'failed',
      error: expect.stringMatching(/more than a day late/),
    });
    expect(intents.find((i) => i.idempotencyKey === 'recent')?.state).toBe('pending');
    // Only the recent one goes out; the stale one waits under "needs you".
    await s.publishDue();
    expect(s.network.posts.map((p) => p.body)).toEqual(['Only slightly late']);
    const posts = await inWorkspace(db, s.workspaceId, (m) =>
      m.find(SocialPost, { where: { workspaceId: s.workspaceId }, order: { scheduledFor: 'ASC' } }),
    );
    expect(posts.map((p) => p.state)).toEqual(['failed', 'published']);
    expect((await activity(db, s.workspaceId)).map((e) => e.type)).toContain('post.missed');
    // Running again holds nothing more.
    expect(await s.publisher.holdStale()).toBe(0);
  });

  it('holds a post whose account was broken for days once it is reconnected, not before', async () => {
    const s = await setup();
    await s.queue({ idempotencyKey: 'x', scheduledFor: '2026-11-01T10:00:00Z' });
    await inWorkspace(db, s.workspaceId, (m) =>
      m.update(ConnectedAccount, { id: s.account.id }, { health: 'broken', healthReason: 'Disconnected.' }),
    );
    // Still held by the broken account, and still counted as stale: a person decides after reconnecting.
    expect(await s.publisher.holdStale()).toBe(1);
    await inWorkspace(db, s.workspaceId, (m) =>
      m.update(ConnectedAccount, { id: s.account.id }, { health: 'ok', healthReason: null }),
    );
    expect(await s.publishDue()).toEqual([]);
    expect(s.network.posts).toHaveLength(0);
  });

  it('a paused staff member publishes nothing', async () => {
    const s = await setup();
    await s.queue();
    await inWorkspace(db, s.workspaceId, (m) => m.update(StaffMember, { id: s.staff.id }, { state: 'paused' }));
    expect(await s.publishDue()).toEqual(['held']);
    expect(s.network.posts).toHaveLength(0);
  });

  it('a first comment failing does not undo a post that is up', async () => {
    const s = await setup();
    await s.queue({ firstComment: 'More at northfield.test' });
    s.network.addComment = () => Promise.reject(new Error('comments are off'));
    expect(await s.publishDue()).toEqual(['sent']);
    expect((await s.post()).state).toBe('published');
  });
});

describe('a network that is still working on a post', () => {
  /** Queues a post, lets the network answer "still working", and returns what the tests need to look at it. */
  async function processing() {
    const t = await setup();
    t.network.next = 'pending';
    await t.queue();
    expect(await t.publishDue()).toEqual(['processing']);
    const looks = async () => {
      const out = [];
      for (const due of await t.publisher.dueChecks())
        if (due.workspaceId === t.workspaceId) out.push(await t.publisher.check(due.workspaceId, due.id));
      return out;
    };
    return { ...t, looks };
  }

  it('keeps the ticket, posts nothing yet, and publishes once a look finds it ready', async () => {
    const t = await processing();
    const [intent] = await t.intents();
    expect(intent).toMatchObject({ state: 'processing', checks: 0 });
    expect(intent!.ticket).toMatch(/^ticket-fixture-post-/);
    expect((await t.post()).state).toBe('scheduled');
    expect(t.network.posts).toHaveLength(0);

    // Not before its time: the first look is 15 seconds away.
    expect(await t.looks()).toEqual([]);
    t.time.advance(20_000);
    t.network.checks = ['processing', 'ready'];
    expect(await t.looks()).toEqual(['processing']);
    expect((await t.intents())[0]).toMatchObject({ state: 'processing', checks: 1 });

    t.time.advance(checkDelayMs(1) + 1_000);
    expect(await t.looks()).toEqual(['sent']);
    expect((await t.intents())[0]).toMatchObject({ state: 'sent' });
    expect(await t.post()).toMatchObject({ state: 'published', permalink: expect.stringContaining('fixture.test') });
    expect(t.network.posts).toHaveLength(1);
    expect((await events(db, t.workspaceId)).some((event) => event.type === 'post.published')).toBe(true);
    expect((await activity(db, t.workspaceId)).some((entry) => entry.type === 'post.processing')).toBe(true);
  });

  it('spaces the looks further apart, up to five minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((checks) => checkDelayMs(checks) / 1000)).toEqual([
      30, 60, 120, 240, 300, 300, 300,
    ]);
  });

  it('lets only one worker look at a ticket at a time', async () => {
    const t = await processing();
    t.time.advance(20_000);
    t.network.checks = ['processing', 'processing'];
    const [due] = await t.publisher.dueChecks();
    const results = await Promise.all([
      t.publisher.check(t.workspaceId, due!.id),
      t.publisher.check(t.workspaceId, due!.id),
    ]);
    expect([...results].sort()).toEqual(['processing', 'skipped']);
    expect(t.network.checked).toHaveLength(1);
  });

  it('fails the post, and posts nothing, when the network says it could not process it', async () => {
    const t = await processing();
    t.time.advance(20_000);
    t.network.checks = ['failed'];
    expect(await t.looks()).toEqual(['failed']);
    expect((await t.intents())[0]).toMatchObject({ state: 'failed', error: 'The network could not process it.' });
    expect((await t.post()).state).toBe('failed');
    expect(t.network.posts).toHaveLength(0);
  });

  it('treats a last step that was sent and never answered as uncertain, and never repeats it', async () => {
    const t = await processing();
    t.time.advance(20_000);
    t.network.checks = ['uncertain'];
    expect(await t.looks()).toEqual(['uncertain']);
    expect((await t.intents())[0]).toMatchObject({ state: 'uncertain' });
    // Nothing queues it again: it is not due to publish, and no more looks are made.
    t.time.advance(3_600_000);
    expect(await t.publishDue()).toEqual([]);
    expect(await t.looks()).toEqual([]);
    expect(t.network.posts).toHaveLength(0);
    expect((await t.publisher.uncertain()).some((row) => row.workspaceId === t.workspaceId)).toBe(true);
  });

  it('asks a person once the network has taken 30 minutes', async () => {
    const t = await processing();
    t.network.checks = Array.from({ length: 40 }, () => 'processing' as const);
    let last: string[] = [];
    for (let minute = 0; minute < 40 && (await t.intents())[0]!.state === 'processing'; minute += 1) {
      t.time.advance(60_000 * 1.2);
      last = await t.looks();
    }
    expect(last).toEqual(['uncertain']);
    expect((await t.intents())[0]).toMatchObject({ state: 'uncertain', checkAfter: null });
    expect((await t.intents())[0]!.error).toContain('30 minutes');
  });

  it('a login problem pauses the looks, keeps the post, and resumes after reconnecting without posting twice', async () => {
    const t = await processing();
    t.time.advance(20_000);
    t.network.checks = ['auth', 'ready'];
    expect(await t.looks()).toEqual(['held']);
    expect(
      (await inWorkspace(db, t.workspaceId, (m) => m.findOneByOrFail(ConnectedAccount, { id: t.account.id }))).health,
    ).toBe('broken');
    expect((await t.intents())[0]!.state).toBe('processing');

    t.time.advance(11 * 60_000);
    expect(await t.looks()).toEqual([]); // a broken account is not looked at
    await inWorkspace(db, t.workspaceId, (m) =>
      m.update(ConnectedAccount, { id: t.account.id }, { health: 'ok', healthReason: null }),
    );
    expect(await t.looks()).toEqual(['sent']);
    expect(t.network.posts).toHaveLength(1);
  });

  it('treats a limit, or a look that got no answer, as a pause and nothing more', async () => {
    const t = await processing();
    t.time.advance(20_000);
    t.network.checks = ['rate_limit', 'lost'];
    expect(await t.looks()).toEqual(['processing']);
    const waitUntil = (await t.intents())[0]!.checkAfter!.getTime();
    expect(waitUntil - t.time.now().getTime()).toBeGreaterThanOrEqual(5 * 60_000);

    t.time.advance(6 * 60_000);
    expect(await t.looks()).toEqual(['processing']);
    expect((await t.intents())[0]).toMatchObject({ state: 'processing', checks: 2 });
    expect(t.network.posts).toHaveLength(0);
  });
});

describe('approved posts', () => {
  it('publishes the edited body and time, and refuses an unfilled marker', () => {
    const [effect] = withApprovedPayload(
      [
        {
          type: 'createPublishIntent',
          accountId: 'a',
          body: APPROVED_PAYLOAD,
          firstComment: APPROVED_PAYLOAD,
          media: [],
          scheduledFor: APPROVED_PAYLOAD,
          idempotencyKey: 'k',
        },
      ],
      { body: 'Edited', scheduledFor: '2026-11-05T09:00:00Z' },
    );
    expect(effect).toMatchObject({ body: 'Edited', firstComment: null, scheduledFor: '2026-11-05T09:00:00Z' });
    expect(() =>
      withApprovedPayload(
        [
          {
            type: 'createPublishIntent',
            accountId: 'a',
            body: APPROVED_PAYLOAD,
            media: [],
            scheduledFor: 'x',
            idempotencyKey: 'k',
          },
        ],
        { body: '' },
      ),
    ).toThrow(/no body/);
  });
});
