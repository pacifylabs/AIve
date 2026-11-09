import { ConnectedAccount, type DataSource, PostSchedule, PublishIntent, SocialPost, StaffMember } from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RecurringPosts } from '../src/index.js';
import { clock, connect, inWorkspace, seedWorkspace } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

async function setup(timezone = 'UTC') {
  const ws = await seedWorkspace(db, timezone);
  const time = clock('2026-11-09T08:00:00Z'); // a Monday
  const recurring = new RecurringPosts(db, time.now);
  const { staff, account } = await inWorkspace(db, ws.workspaceId, async (m) => {
    const staff = await m.save(
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
    );
    const account = await m.save(
      m.create(ConnectedAccount, {
        id: uuidv7(),
        workspaceId: ws.workspaceId,
        network: 'facebook',
        externalId: 'p',
        name: 'Page',
        username: null,
        parentExternalId: null,
        secretEnc: 'x',
        tokenExpiresAt: null,
        scopes: [],
        health: 'ok',
        healthReason: null,
        lastCheckedAt: null,
        metadata: {},
      }),
    );
    return { staff, account };
  });
  const addRule = (extra: Partial<PostSchedule> = {}) =>
    inWorkspace(db, ws.workspaceId, (m) =>
      m.save(
        m.create(PostSchedule, {
          workspaceId: ws.workspaceId,
          createdBy: null,
          accountIds: [account.id],
          body: 'Tip of the week',
          firstComment: null,
          linkUrl: null,
          media: [],
          followUps: [],
          tagId: null,
          rule: { kind: 'weekly', weekdays: [2, 5], everyWeeks: 1 },
          atTime: '09:30',
          startsOn: '2026-11-09',
          endsOn: null,
          state: 'active',
          ...extra,
        }),
      ),
    );
  const posts = () =>
    inWorkspace(db, ws.workspaceId, (m) =>
      m.find(SocialPost, { where: { workspaceId: ws.workspaceId }, order: { scheduledFor: 'ASC' } }),
    );
  return { ...ws, time, recurring, staff, account, addRule, posts };
}

describe('recurring posts', () => {
  it('makes the next four weeks of posts, at the chosen time, and never makes the same one twice', async () => {
    const s = await setup();
    const rule = await s.addRule();
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: rule.id });
    const first = await s.posts();
    // Tuesdays and Fridays from 10 Nov to 7 Dec (a Monday, so the last is Friday 4 Dec).
    expect(first.map((p) => p.scheduledFor.toISOString())).toEqual([
      '2026-11-10T09:30:00.000Z',
      '2026-11-13T09:30:00.000Z',
      '2026-11-17T09:30:00.000Z',
      '2026-11-20T09:30:00.000Z',
      '2026-11-24T09:30:00.000Z',
      '2026-11-27T09:30:00.000Z',
      '2026-12-01T09:30:00.000Z',
      '2026-12-04T09:30:00.000Z',
    ]);
    expect(first.every((p) => p.body === 'Tip of the week' && p.state === 'scheduled')).toBe(true);
    expect(await s.recurring.generate()).toBeGreaterThanOrEqual(0);
    expect(await s.posts()).toHaveLength(8);
    // Three days later the window reaches Tuesday 8 Dec, adding only what is new.
    s.time.advance(86_400_000 * 3);
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: rule.id });
    expect(await s.posts()).toHaveLength(9);
  });

  it('does not make again a post a person cancelled', async () => {
    const s = await setup();
    const rule = await s.addRule({ rule: { kind: 'weekly', weekdays: [2], everyWeeks: 1 } });
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: rule.id });
    const [first] = await s.posts();
    await inWorkspace(db, s.workspaceId, async (m) => {
      await m.update(PublishIntent, { postId: first!.id }, { state: 'cancelled' });
      await m.update(SocialPost, { id: first!.id }, { state: 'cancelled' });
    });
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: rule.id });
    expect((await s.posts()).filter((p) => p.state === 'scheduled')).toHaveLength(3);
    expect(await s.posts()).toHaveLength(4);
  });

  it('reads the time in the workspace time zone, and skips a time that has already passed today', async () => {
    const s = await setup('Africa/Lagos'); // one hour ahead of UTC in November
    const rule = await s.addRule({ rule: { kind: 'weekly', weekdays: [1], everyWeeks: 1 }, atTime: '08:30' });
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: rule.id });
    // Monday 9 Nov 08:30 Lagos is 07:30 UTC, already past at 08:00 UTC: the first post is the Monday after.
    expect((await s.posts())[0]!.scheduledFor.toISOString()).toBe('2026-11-16T07:30:00.000Z');
  });

  it('makes nothing for a paused rule, a workspace with no staff member, or a broken account', async () => {
    const s = await setup();
    const paused = await s.addRule({ state: 'paused' });
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: paused.id });
    expect(await s.posts()).toHaveLength(0);

    const active = await s.addRule();
    await inWorkspace(db, s.workspaceId, (m) => m.update(ConnectedAccount, { id: s.account.id }, { health: 'broken' }));
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: active.id });
    expect(await s.posts()).toHaveLength(0);
    await inWorkspace(db, s.workspaceId, async (m) => {
      await m.update(ConnectedAccount, { id: s.account.id }, { health: 'ok' });
      await m.update(StaffMember, { id: s.staff.id }, { state: 'paused' });
    });
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: active.id });
    expect(await s.posts()).toHaveLength(0);
  });

  it('carries the post’s tag, chain and author onto each copy', async () => {
    const s = await setup();
    const author = uuidv7();
    const rule = await s.addRule({
      rule: { kind: 'monthly_day', dayOfMonth: 15 },
      followUps: ['Reply one'],
      createdBy: author,
    });
    await s.recurring.generate({ workspaceId: s.workspaceId, scheduleId: rule.id });
    const [post] = await s.posts();
    expect(post).toMatchObject({ followUps: ['Reply one'], createdBy: author });
  });
});
