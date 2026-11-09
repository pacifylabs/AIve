import {
  ActivityEvent,
  ConnectedAccount,
  type DataSource,
  PostAutomation,
  SocialPost,
  StaffMember,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAutomations, REPURPOSE_REQUESTED } from '../src/index.js';
import { connect, events, inWorkspace, seedWorkspace } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

const NOW = new Date('2026-11-09T12:00:00Z');

async function setup() {
  const ws = await seedWorkspace(db);
  const staff = await inWorkspace(db, ws.workspaceId, (m) =>
    m.save(
      m.create(StaffMember, {
        workspaceId: ws.workspaceId,
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
    ),
  );
  const account = (health: 'ok' | 'broken' = 'ok') =>
    inWorkspace(db, ws.workspaceId, (m) =>
      m.save(
        m.create(ConnectedAccount, {
          id: uuidv7(),
          workspaceId: ws.workspaceId,
          network: 'facebook',
          externalId: uuidv7(),
          name: 'Northfield',
          username: null,
          parentExternalId: null,
          secretEnc: 'x',
          tokenExpiresAt: null,
          scopes: [],
          health,
          healthReason: null,
          lastCheckedAt: null,
          metadata: {},
        }),
      ),
    );
  const post = (accountId: string) =>
    inWorkspace(db, ws.workspaceId, (m) =>
      m.save(
        m.create(SocialPost, {
          workspaceId: ws.workspaceId,
          staffId: staff.id,
          accountId,
          body: 'Hello',
          linkUrl: null,
          firstComment: null,
          media: [],
          state: 'published',
          scheduledFor: NOW,
          publishedAt: NOW,
          externalPostId: uuidv7(),
          permalink: null,
        }),
      ),
    );
  const rule = (fields: Partial<PostAutomation> = {}) =>
    inWorkspace(db, ws.workspaceId, (m) =>
      m.save(
        m.create(PostAutomation, {
          workspaceId: ws.workspaceId,
          createdBy: null,
          threshold: 50,
          accountIds: [],
          dailyCap: 3,
          totalCap: 20,
          enabled: true,
          ...fields,
        }),
      ),
    );
  const run = (postId: string, metrics: Record<string, number>, at = NOW) =>
    inWorkspace(db, ws.workspaceId, (m) => applyAutomations(m, ws.workspaceId, postId, metrics, at));
  const asked = async () => (await events(db, ws.workspaceId)).filter((event) => event.type === REPURPOSE_REQUESTED);
  return { ws, account, post, rule, run, asked };
}

describe('automations on a workspace’s own posts', () => {
  it('does nothing while a rule is off, which is how a new rule starts', async () => {
    const s = await setup();
    const a = await s.account();
    await s.rule({ enabled: false });
    expect(await s.run((await s.post(a.id)).id, { likes: 500 })).toBe(0);
    expect(await s.asked()).toHaveLength(0);
  });

  it('asks for one draft when a post reaches the number, and never again for the same post', async () => {
    const s = await setup();
    const a = await s.account();
    await s.rule();
    const hit = await s.post(a.id);
    expect(await s.run(hit.id, { likes: 30, comments: 10, shares: 10 })).toBe(1);
    expect(await s.run(hit.id, { likes: 90 })).toBe(0);
    const [event] = await s.asked();
    expect(event?.payload).toMatchObject({ postId: hit.id, accountId: a.id });
    const logged = await inWorkspace(db, s.ws.workspaceId, (m) => m.find(ActivityEvent));
    expect(logged.filter((entry) => entry.type === 'automation.drafted')).toHaveLength(1);
  });

  it('leaves a post below the number, and an account the rule does not cover', async () => {
    const s = await setup();
    const a = await s.account();
    const b = await s.account();
    await s.rule({ accountIds: [a.id] });
    expect(await s.run((await s.post(a.id)).id, { likes: 49 })).toBe(0);
    expect(await s.run((await s.post(b.id)).id, { likes: 500 })).toBe(0);
    expect(await s.asked()).toHaveLength(0);
  });

  it('stops at the daily cap, resumes the next day, and stops for good at the total cap', async () => {
    const s = await setup();
    const a = await s.account();
    await s.rule({ dailyCap: 1, totalCap: 2 });
    const [one, two, three] = [await s.post(a.id), await s.post(a.id), await s.post(a.id)];
    expect(await s.run(one.id, { likes: 99 })).toBe(1);
    expect(await s.run(two.id, { likes: 99 })).toBe(0);
    const tomorrow = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(await s.run(two.id, { likes: 99 }, tomorrow)).toBe(1);
    const later = new Date(NOW.getTime() + 60 * 3_600_000);
    expect(await s.run(three.id, { likes: 99 }, later)).toBe(0);
    expect(await s.asked()).toHaveLength(2);
  });

  it('gives the post back when the account needs reconnecting, so a later reading can still draft', async () => {
    const s = await setup();
    const a = await s.account('broken');
    await s.rule();
    const hit = await s.post(a.id);
    expect(await s.run(hit.id, { likes: 99 })).toBe(0);
    await inWorkspace(db, s.ws.workspaceId, (m) => m.update(ConnectedAccount, { id: a.id }, { health: 'ok' }));
    expect(await s.run(hit.id, { likes: 99 })).toBe(1);
  });
});
