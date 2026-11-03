import { randomBytes } from 'node:crypto';
import {
  AccountTokens,
  accountBinding,
  ApprovalService,
  CompanyBrain,
  hireStaff,
  Keyring,
  PostPublisher,
  ReplySender,
  RoleRegistry,
  SocialGateway,
  TaskEngine,
  Triggers,
} from '@ai-staff/core';
import {
  ActivityEvent,
  asSystem,
  ConnectedAccount,
  createDataSource,
  type DataSource,
  Lead,
  ReplyIntent,
  SocialEngagement,
  SocialMetric,
  SocialPost,
  TaskRun,
  WorkItem,
  withTenant,
} from '@ai-staff/db';
import { type FakeReply, FakeModelProvider, type GenerateRequest } from '@ai-staff/llm';
import { salesManagerRole } from '@ai-staff/role-sales';
import { FixtureSocialProvider, SocialProviders } from '@ai-staff/social';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { socialMediaRole } from '../src/index.js';

let db: DataSource;
beforeAll(async () => {
  db = await createDataSource({
    host: process.env.TEST_DB_HOST!,
    port: Number(process.env.TEST_DB_PORT),
    database: process.env.TEST_DB_NAME!,
    username: process.env.TEST_DB_APP_USER!,
    password: process.env.TEST_DB_APP_PASSWORD!,
    poolSize: 5,
  }).initialize();
});
afterAll(async () => {
  await db.destroy();
});

const keyring = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');
const HOUR = 3_600_000;

/** What the fake model answers, by task: tests overwrite these to script a scenario. */
interface Script {
  accountId: string;
  triage: { classification: string; reply?: string | null; reason: string };
  draft: { body: string; hashtags: string[]; firstComment?: string | null };
}

async function setup() {
  const time = { now: new Date('2026-11-06T10:00:00Z') }; // a Friday
  const now = () => new Date(time.now);
  const userId = uuidv7();
  const workspaceId = uuidv7();
  await asSystem(db, 'test: create a user and workspace', async (m) => {
    await m.query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, 'Owner', 'x')`, [
      userId,
      `${userId}@test.local`,
    ]);
    await m.query(`INSERT INTO workspaces (id, name, slug, timezone) VALUES ($1, 'Northfield', $2, 'UTC')`, [
      workspaceId,
      `ws-${workspaceId}`,
    ]);
    await m.query(`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES ($1, $2, $3, 'owner')`, [
      uuidv7(),
      workspaceId,
      userId,
    ]);
  });
  const actor = { workspaceId, userId };
  const inWs = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(db, { workspaceId, userId: null }, work);

  const brain = new CompanyBrain(db, now);
  await brain.updateProfile(actor, { website: 'https://northfield.test', summary: 'Client onboarding for agencies.' });
  await brain.addFact(actor, 'price', 'Starter plan: $1,200 a year');

  const networks = {
    facebook: new FixtureSocialProvider('facebook'),
    instagram: new FixtureSocialProvider('instagram'),
  };
  const providers = new SocialProviders({}, Object.values(networks));
  const makeAccount = (network: 'facebook' | 'instagram', name: string) =>
    inWs(async (m) => {
      const id = uuidv7();
      await m.save(
        m.create(ConnectedAccount, {
          id,
          workspaceId,
          network,
          externalId: `${network}-1`,
          name,
          username: null,
          parentExternalId: null,
          secretEnc: keyring.encrypt(JSON.stringify({ accessToken: 'tok' }), accountBinding({ workspaceId, id })),
          tokenExpiresAt: null,
          scopes: [],
          health: 'ok',
          healthReason: null,
          lastCheckedAt: null,
          metadata: {},
        }),
      );
      return m.findOneByOrFail(ConnectedAccount, { id });
    });
  const facebook = await makeAccount('facebook', 'Northfield Studio');

  const registry = new RoleRegistry().register(socialMediaRole).register(salesManagerRole);
  const staff = await hireStaff(db, registry, actor, {
    roleKey: 'social_media',
    displayName: 'Sam',
    settings: { accountIds: [facebook.id], cadence: 2, pillars: ['Onboarding'] },
  });
  const sales = await hireStaff(db, registry, actor, { roleKey: 'sales_manager', displayName: 'Dee', settings: {} });

  const script: Script = {
    accountId: facebook.id,
    triage: { classification: 'buying_intent', reply: 'You can book a call on our website.', reason: 'Asked to book.' },
    draft: { body: 'Onboarding a new client takes about two weeks with us.', hashtags: ['agency'], firstComment: null },
  };
  const model = new FakeModelProvider((request: GenerateRequest<z.ZodType>): FakeReply => {
    if (request.user.includes('Plan the posts for the week')) {
      return {
        output: {
          items: [
            { accountId: script.accountId, date: '2026-11-09', pillar: 'Onboarding', angle: 'How onboarding works' },
            { accountId: script.accountId, date: '2026-11-10', pillar: 'Onboarding', angle: 'What we need from you' },
            { accountId: uuidv7(), date: '2026-11-11', pillar: 'Onboarding', angle: 'An account we do not post to' },
            { accountId: script.accountId, date: '2026-12-25', pillar: 'Onboarding', angle: 'A day outside the week' },
          ],
        },
      };
    }
    if (request.user.includes('Write one post for')) return { output: script.draft };
    if (request.user.includes('Classify it.')) return { output: script.triage };
    return { error: new Error(`Unexpected prompt: ${request.user.slice(0, 80)}`) };
  });

  const tokens = new AccountTokens(db, keyring, providers, now);
  const gateway = new SocialGateway(db, { providers, tokens, now });
  const engine = new TaskEngine(db, registry, model, { now, leaseMs: 60_000, social: gateway });
  const triggers = new Triggers(db, registry, now);
  const approvals = new ApprovalService(db, registry, now);
  const publisher = new PostPublisher(db, { keyring, providers, now });
  const replySender = new ReplySender(db, { providers, tokens, now });

  /** Runs everything due in this workspace until nothing is left: events, task runs, then publishes. */
  const settle = async () => {
    for (let round = 0; round < 12; round += 1) {
      await triggers.dispatchEvents();
      const due = (await triggers.dueRuns()).filter((run) => run.workspaceId === workspaceId);
      for (const run of due) await engine.run(workspaceId, run.id);
      const posts = (await publisher.due()).filter((send) => send.workspaceId === workspaceId);
      for (const send of posts) await publisher.dispatch(workspaceId, send.id);
      const replies = (await replySender.due()).filter((reply) => reply.workspaceId === workspaceId);
      for (const reply of replies) await replySender.dispatch(workspaceId, reply.id);
      if (!due.length && !posts.length && !replies.length) return;
    }
  };
  const pending = () =>
    inWs((m) => m.find(WorkItem, { where: { workspaceId, state: 'pending' }, order: { createdAt: 'ASC' } }));
  const approveAll = async () => {
    for (const item of await pending()) if (item.kind !== 'escalation') await approvals.approve(actor, item.id);
  };
  const planNow = () =>
    triggers.runNow({
      workspaceId,
      staffId: staff.id,
      taskType: 'social_media.plan_week',
      requestId: uuidv7(),
      taskInput: {},
    });
  const posts = () => inWs((m) => m.find(SocialPost, { where: { workspaceId }, order: { scheduledFor: 'ASC' } }));
  const publishedPost = () =>
    inWs((m) =>
      m.save(
        m.create(SocialPost, {
          workspaceId,
          staffId: staff.id,
          accountId: facebook.id,
          body: 'Hello',
          linkUrl: null,
          firstComment: null,
          media: [],
          state: 'published',
          scheduledFor: new Date('2026-11-09T09:00:00Z'),
          publishedAt: new Date('2026-11-09T09:00:00Z'),
          externalPostId: 'fx-1',
          permalink: null,
        }),
      ),
    );
  return {
    time,
    publishedPost,
    workspaceId,
    actor,
    staff,
    sales,
    facebook,
    networks,
    script,
    settle,
    pending,
    approveAll,
    planNow,
    posts,
    inWs,
    gateway,
    makeAccount,
    registry,
    triggers,
    approvals,
    engine,
    brain,
  };
}

describe('Social Media Staff, end to end', () => {
  it('plans a week, drafts each post after approval, publishes at the scheduled time, and captures metrics', async () => {
    const s = await setup();
    await s.planNow();
    await s.settle();

    const [plan] = await s.pending();
    expect(plan?.kind).toBe('plan');
    // The two usable ideas stay; the stranger's account and the day outside the week are dropped.
    expect((plan?.payload.items as unknown[]).length).toBe(2);
    expect(plan?.title).toMatch(/week of 2026-11-09 \(2 posts\)/);
    expect((await s.posts()).length).toBe(0);

    await s.approveAll();
    await s.settle();
    const drafts = await s.pending();
    expect(drafts.map((item) => item.kind)).toEqual(['post_draft', 'post_draft']);
    expect(drafts[0]?.payload).toMatchObject({ scheduledFor: '2026-11-09T09:00:00.000Z', network: 'facebook' });
    expect(String(drafts[0]?.payload.body)).toContain('#agency');
    // Nothing is published until a person approves it.
    expect(s.networks.facebook.posts).toHaveLength(0);

    await s.approveAll();
    await s.settle();
    expect(s.networks.facebook.posts).toHaveLength(0);
    expect((await s.posts()).map((post) => post.state)).toEqual(['scheduled', 'scheduled']);

    s.time.now = new Date('2026-11-09T09:00:00Z');
    await s.settle();
    expect(s.networks.facebook.posts).toHaveLength(1);
    s.time.now = new Date('2026-11-10T09:00:00Z');
    await s.settle();
    expect(s.networks.facebook.posts).toHaveLength(2);
    expect((await s.posts()).map((post) => post.state)).toEqual(['published', 'published']);

    // A day after each publish, the post's numbers are read from the network.
    s.time.now = new Date('2026-11-11T10:00:00Z');
    await s.settle();
    const metrics = await s.inWs((m) => m.find(SocialMetric, { where: { workspaceId: s.workspaceId } }));
    expect(metrics.map((row) => row.capture)).toEqual(['24h', '24h']);
    expect(metrics[0]?.metrics).toMatchObject({ reactions: 3, comments: 1 });
  });

  it('an edited post publishes the edited text and time', async () => {
    const s = await setup();
    await s.planNow();
    await s.settle();
    await s.approveAll();
    await s.settle();
    const [first] = await s.pending();
    await s.approvals.approve(s.actor, first!.id, {
      ...first!.payload,
      body: 'Edited by a person.',
      scheduledFor: '2026-11-09T15:00:00.000Z',
    });
    s.time.now = new Date('2026-11-09T15:00:00Z');
    await s.settle();
    expect(s.networks.facebook.posts[0]?.body).toBe('Edited by a person.');
  });

  it('a post that invents a price is escalated, never queued', async () => {
    const s = await setup();
    s.script.draft = { body: 'Everything is half price at $99 this week.', hashtags: [] };
    await s.planNow();
    await s.settle();
    await s.approveAll();
    await s.settle();
    const items = await s.pending();
    expect(items.every((item) => item.kind === 'escalation')).toBe(true);
    expect(items[0]?.flaggedReason).toMatch(/factsOnly/);
  });

  it('an Instagram post with no picture is escalated with a clear reason', async () => {
    const s = await setup();
    const instagram = await s.makeAccount('instagram', 'Northfield on Instagram');
    await s.triggers.runNow({
      workspaceId: s.workspaceId,
      staffId: s.staff.id,
      taskType: 'social_media.draft_post',
      requestId: uuidv7(),
      taskInput: {
        accountId: instagram.id,
        network: 'instagram',
        scheduledFor: '2026-11-09T09:00:00.000Z',
        pillar: 'Onboarding',
        angle: 'How onboarding works',
        mediaUrls: [],
      },
    });
    await s.settle();
    const [item] = await s.pending();
    expect(item?.kind).toBe('escalation');
    expect(item?.flaggedReason).toMatch(/picture or a video/);
  });

  it('a comment with buying intent becomes a lead for the Sales Manager, and a reply is drafted for a person', async () => {
    const s = await setup();
    s.networks.facebook.incoming = [
      {
        externalId: 'c1',
        authorName: 'Ada Buyer',
        message: 'How do I book a call?',
        receivedAt: new Date('2026-11-09T11:00:00Z'),
      },
    ];
    await s.inWs((m) =>
      m.save(
        m.create(SocialPost, {
          workspaceId: s.workspaceId,
          staffId: s.staff.id,
          accountId: s.facebook.id,
          body: 'Hello',
          linkUrl: null,
          firstComment: null,
          media: [],
          state: 'published',
          scheduledFor: new Date('2026-11-09T09:00:00Z'),
          publishedAt: new Date('2026-11-09T09:00:00Z'),
          externalPostId: 'fx-1',
          permalink: null,
        }),
      ),
    );
    s.time.now = new Date('2026-11-09T12:00:00Z');
    const filed = () => s.inWs((m) => m.count(SocialEngagement, { where: { workspaceId: s.workspaceId } }));
    // The sweep covers every workspace, so what counts here is this workspace's own rows.
    await s.gateway.syncComments();
    expect(await filed()).toBe(1);
    // The same comment seen again is the same row.
    await s.gateway.syncComments();
    expect(await filed()).toBe(1);
    await s.settle();

    const leads = await s.inWs((m) => m.find(Lead, { where: { workspaceId: s.workspaceId } }));
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ source: 'social', name: 'Ada Buyer', email: null, assignedStaffId: s.sales.id });
    // Social leads are not researched like a website lead.
    const researched = await s.inWs((m) =>
      m.find(TaskRun, { where: { workspaceId: s.workspaceId, taskType: 'sales_manager.research_lead' } }),
    );
    expect(researched).toHaveLength(0);

    const [draft] = await s.pending();
    expect(draft?.kind).toBe('reply_draft');
    expect(draft?.payload.reply).toBe('You can book a call on our website.');
    const engagement = await s.inWs((m) => m.findOneByOrFail(SocialEngagement, { workspaceId: s.workspaceId }));
    expect(engagement).toMatchObject({ classification: 'buying_intent', state: 'triaged' });
  });

  it('a complaint is handed to a person and never answered', async () => {
    const s = await setup();
    s.script.triage = { classification: 'complaint', reply: 'So sorry! Here is a refund.', reason: 'Upset.' };
    await s.inWs((m) =>
      m.save(
        m.create(SocialPost, {
          workspaceId: s.workspaceId,
          staffId: s.staff.id,
          accountId: s.facebook.id,
          body: 'Hello',
          linkUrl: null,
          firstComment: null,
          media: [],
          state: 'published',
          scheduledFor: new Date('2026-11-09T09:00:00Z'),
          publishedAt: new Date('2026-11-09T09:00:00Z'),
          externalPostId: 'fx-1',
          permalink: null,
        }),
      ),
    );
    s.networks.facebook.incoming = [
      {
        externalId: 'c2',
        authorName: 'Bob',
        message: 'This was terrible service.',
        receivedAt: new Date('2026-11-09T11:00:00Z'),
      },
    ];
    s.time.now = new Date('2026-11-09T12:00:00Z');
    await s.gateway.syncComments();
    await s.settle();
    const items = await s.pending();
    expect(items.map((item) => item.kind)).toEqual(['escalation']);
    expect(await s.inWs((m) => m.find(Lead, { where: { workspaceId: s.workspaceId } }))).toHaveLength(0);
  });

  it('an approved reply is sent with the wording the person left, once', async () => {
    const s = await setup();
    await s.publishedPost();
    s.networks.facebook.incoming = [
      {
        externalId: 'c1',
        authorName: 'Ada Buyer',
        message: 'How do I book a call?',
        receivedAt: new Date('2026-11-09T11:00:00Z'),
      },
    ];
    s.time.now = new Date('2026-11-09T12:00:00Z');
    await s.gateway.syncComments();
    await s.settle();
    const [draft] = await s.pending();
    expect(s.networks.facebook.comments).toHaveLength(0);

    await s.approvals.approve(s.actor, draft!.id, { ...draft!.payload, reply: 'Book a call on our website, Ada.' });
    await s.settle();
    expect(s.networks.facebook.comments).toEqual([
      expect.objectContaining({ externalPostId: 'c1', message: 'Book a call on our website, Ada.' }),
    ]);
    const engagement = await s.inWs((m) => m.findOneByOrFail(SocialEngagement, { workspaceId: s.workspaceId }));
    expect(engagement.state).toBe('replied');
    await s.settle();
    expect(s.networks.facebook.comments).toHaveLength(1);
  });

  it('answers a private message by the sender id, inside the reply window', async () => {
    const s = await setup();
    s.time.now = new Date('2026-11-09T12:00:00Z');
    s.script.triage = { classification: 'question', reply: 'We are open nine to five.', reason: 'Asked hours.' };
    await s.gateway.receiveMessage(s.workspaceId, s.staff.id, {
      accountId: s.facebook.id,
      externalId: 'm1',
      senderId: 'psid-77',
      authorName: 'Bob',
      text: 'When are you open?',
      receivedAt: new Date('2026-11-09T11:30:00Z'),
    });
    await s.settle();
    const queued = await s.pending();
    expect(queued.map((item) => [item.kind, item.flaggedReason])).toEqual([['reply_draft', null]]);
    await s.approveAll();
    const intents = await s.inWs((m) => m.find(ReplyIntent, { where: { workspaceId: s.workspaceId } }));
    expect(intents.map((intent) => [intent.state, intent.error])).toEqual([['pending', null]]);
    await s.settle();
    expect(s.networks.facebook.messages).toEqual([
      expect.objectContaining({ recipientId: 'psid-77', message: 'We are open nine to five.' }),
    ]);
  });

  it('a reply approved too late, after the reply window closes, is never sent', async () => {
    const s = await setup();
    s.time.now = new Date('2026-11-09T12:00:00Z');
    await s.gateway.receiveMessage(s.workspaceId, s.staff.id, {
      accountId: s.facebook.id,
      externalId: 'm2',
      senderId: 'psid-9',
      authorName: 'Cy',
      text: 'Do you ship?',
      receivedAt: new Date('2026-11-08T13:00:00Z'),
    });
    // Received 23 hours ago: still open for one more hour, so a draft is made.
    s.script.triage = { classification: 'question', reply: 'Yes, we ship.', reason: 'Asked.' };
    await s.settle();
    const [draft] = await s.pending();
    expect(draft?.kind).toBe('reply_draft');
    // The person gets to it two hours later: too late.
    s.time.now = new Date('2026-11-09T14:00:00Z');
    await s.approvals.approve(s.actor, draft!.id);
    await s.settle();
    expect(s.networks.facebook.messages).toHaveLength(0);
    const types = (await s.inWs((m) => m.find(ActivityEvent, { where: { workspaceId: s.workspaceId } }))).map(
      (e) => e.type,
    );
    expect(types).toContain('reply.not_queued');
  });

  it('a reply on an account that needs reconnecting waits, and a dropped connection is never resent', async () => {
    const s = await setup();
    await s.publishedPost();
    s.networks.facebook.incoming = [
      {
        externalId: 'c3',
        authorName: 'Di',
        message: 'Do you do weddings?',
        receivedAt: new Date('2026-11-09T11:00:00Z'),
      },
    ];
    s.script.triage = { classification: 'question', reply: 'Not yet.', reason: 'Asked.' };
    s.time.now = new Date('2026-11-09T12:00:00Z');
    await s.gateway.syncComments();
    await s.settle();
    s.networks.facebook.nextReply = 'drop';
    await s.approveAll();
    await s.settle();
    expect(await s.inWs((m) => m.find(ReplyIntent, { where: { workspaceId: s.workspaceId } }))).toEqual([
      expect.objectContaining({ state: 'uncertain' }),
    ]);
    await s.settle();
    expect(s.networks.facebook.comments).toHaveLength(0);
  });
});
