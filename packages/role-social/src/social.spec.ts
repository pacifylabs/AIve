import { RoleRegistry, type TaskContext } from '@ai-staff/core';
import type { ConnectedAccount, SocialEngagement } from '@ai-staff/db';
import { describe, expect, it } from 'vitest';
import {
  composeHashtags,
  composeSignature,
  emojiPolicy,
  fitsNetwork,
  hashtagPolicy,
  isSensitive,
  limitReplies,
  noUnknownMentions,
  repliesFit,
  type PostOutput,
  requiresMedia,
} from './guardrails.js';
import { socialMediaRole } from './role.js';
import { socialSettingsSchema } from './settings.js';
import { triageEngagement, type Triage } from './tasks/triage.js';
import { localDate, nextWeekStart, weekDates, zonedTimeToUtc } from './time.js';

describe('time helpers', () => {
  it('converts a wall-clock time in a zone to UTC, either side of daylight saving', () => {
    expect(zonedTimeToUtc('2026-11-04', '09:00', 'UTC').toISOString()).toBe('2026-11-04T09:00:00.000Z');
    expect(zonedTimeToUtc('2026-11-04', '09:00', 'Africa/Lagos').toISOString()).toBe('2026-11-04T08:00:00.000Z');
    // New York is on EST in November (UTC-5) and EDT in July (UTC-4).
    expect(zonedTimeToUtc('2026-11-04', '09:00', 'America/New_York').toISOString()).toBe('2026-11-04T14:00:00.000Z');
    expect(zonedTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });

  it('plans the week that starts on the next Monday', () => {
    // Friday 6 Nov 2026 10:00 UTC -> Monday 9 Nov.
    expect(nextWeekStart(new Date('2026-11-06T10:00:00Z'), 'UTC')).toBe('2026-11-09');
    // Sunday -> the next day. Monday -> a week later, not the same day.
    expect(nextWeekStart(new Date('2026-11-08T10:00:00Z'), 'UTC')).toBe('2026-11-09');
    expect(nextWeekStart(new Date('2026-11-09T10:00:00Z'), 'UTC')).toBe('2026-11-16');
    expect(weekDates('2026-11-09')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
  });

  it('reads the date in the zone, not in UTC', () => {
    expect(localDate(new Date('2026-11-06T23:30:00Z'), 'Africa/Lagos')).toBe('2026-11-07');
  });
});

const settings = socialSettingsSchema.parse({ hashtags: { always: ['northfield'], never: ['giveaway'], max: 3 } });

const ctxFor = (
  input: Record<string, unknown> = {},
  overrides: Partial<ReturnType<typeof socialSettingsSchema.parse>> = {},
) =>
  ({
    staff: { displayName: 'Sam', settings: { ...settings, ...overrides } },
    facts: [],
    run: { input },
  }) as unknown as TaskContext;

const post = (body: string, hashtags: string[] = []): PostOutput => ({ body, hashtags });

describe('social guardrails', () => {
  it('adds the always-hashtags, caps the rest, and refuses a banned one', () => {
    const ok = hashtagPolicy().check(post('Hi', ['#onboarding', 'agency', 'extra', 'more']), ctxFor());
    expect(ok).toMatchObject({ ok: true, output: { hashtags: ['northfield', 'onboarding', 'agency'] } });
    expect(hashtagPolicy().check(post('Hi', ['Giveaway']), ctxFor()).ok).toBe(false);
  });

  it('puts the hashtags on the end of the post', () => {
    const result = composeHashtags().check(post('Hello', ['a', 'b']), ctxFor());
    expect(result).toMatchObject({ ok: true, output: { body: 'Hello\n\n#a #b', hashtags: [] } });
  });

  it('enforces the emoji setting', () => {
    expect(emojiPolicy().check(post('Hi 🎉🎉🎉'), ctxFor()).ok).toBe(false);
    expect(emojiPolicy().check(post('Hi 🎉'), ctxFor()).ok).toBe(true);
    expect(emojiPolicy().check(post('Hi 🎉'), ctxFor({}, { emoji: 'none' })).ok).toBe(false);
    expect(emojiPolicy().check(post('Hi 🎉🎉🎉'), ctxFor({}, { emoji: 'free' })).ok).toBe(true);
  });

  it('fits the network, counting an X link as 23 characters', () => {
    expect(fitsNetwork().check(post('x'.repeat(281)), ctxFor({ network: 'x' })).ok).toBe(false);
    expect(
      fitsNetwork().check(
        post(`${'x'.repeat(250)} https://northfield.test/a-very-long-path-here`),
        ctxFor({ network: 'x' }),
      ).ok,
    ).toBe(true);
    expect(fitsNetwork().check(post('x'.repeat(300)), ctxFor({ network: 'facebook' })).ok).toBe(true);
    expect(fitsNetwork().check(post('hi'), ctxFor({ network: 'myspace' })).ok).toBe(false);
  });

  it('Instagram needs media', () => {
    expect(requiresMedia().check(post('Hi'), ctxFor({ network: 'instagram', mediaUrls: [] })).ok).toBe(false);
    expect(
      requiresMedia().check(post('Hi'), ctxFor({ network: 'instagram', mediaUrls: ['https://c.test/a.jpg'] })).ok,
    ).toBe(true);
    expect(requiresMedia().check(post('Hi'), ctxFor({ network: 'facebook' })).ok).toBe(true);
    // TikTok takes a video and nothing else, so a picture does not do.
    expect(requiresMedia().check(post('Hi'), ctxFor({ network: 'tiktok', mediaUrls: [] })).ok).toBe(false);
    expect(
      requiresMedia().check(post('Hi'), ctxFor({ network: 'tiktok', mediaUrls: ['https://c.test/a.jpg'] })).ok,
    ).toBe(false);
    expect(
      requiresMedia().check(post('Hi'), ctxFor({ network: 'tiktok', mediaUrls: ['https://c.test/a.mp4?x=1'] })).ok,
    ).toBe(true);
  });

  it('adds the account’s sign-off after the hashtags, once, and only to that account', () => {
    const id = '0198a1b2-0000-7000-8000-000000000001';
    const ctx = ctxFor({ accountId: id }, { signatures: { [id]: '— Team Northfield, since 2019' } });
    const tagged = composeHashtags().check(post('Hello', ['a']), ctx);
    const signed = tagged.ok ? composeSignature().check(tagged.output, ctx) : tagged;
    expect(signed.ok && signed.output.body).toBe('Hello\n\n#a\n\n— Team Northfield, since 2019');
    // A model that already ended with it, or an account with none, is left alone.
    expect(composeSignature().check(post('Hi\n\n— Team Northfield, since 2019'), ctx)).toMatchObject({
      ok: true,
      output: { body: 'Hi\n\n— Team Northfield, since 2019' },
    });
    const other = ctxFor({ accountId: '0198a1b2-0000-7000-8000-000000000002' }, { signatures: { [id]: 'x' } });
    expect(composeSignature().check(post('Hi'), other)).toMatchObject({ ok: true, output: { body: 'Hi' } });
  });

  it('lets figures in the owner’s own sign-off through the facts check by adding it to the text that may be repeated', () => {
    const id = '0198a1b2-0000-7000-8000-000000000001';
    const ctx = ctxFor({ accountId: id }, { signatures: { [id]: 'Since 2019' } });
    composeSignature().check(post('Hi'), ctx);
    expect(ctx.evidence).toContain('Since 2019');
  });

  it('refuses a mention of any account but its own', () => {
    const ctx = ctxFor({ network: 'x', handle: '@northfield' });
    expect(noUnknownMentions().check(post('Thanks @northfield'), ctx).ok).toBe(true);
    expect(noUnknownMentions().check(post('Thanks @someoneelse'), ctx).ok).toBe(false);
    expect(noUnknownMentions().check(post('Email sales@northfield.test'), ctx).ok).toBe(true);
  });

  it('lets the staff member tag an account a person saved for that network, and no other', () => {
    const saved = {
      mentions: [{ network: 'x' as const, handle: 'northfielddesign', name: 'Northfield', verified: true }],
    };
    const onX = ctxFor({ network: 'x', handle: '@us' }, saved);
    expect(noUnknownMentions().check(post('Thanks @NorthfieldDesign and @us'), onX).ok).toBe(true);
    expect(noUnknownMentions().check(post('Thanks @someoneelse'), onX).ok).toBe(false);
    // The same name saved for X is not allowed on Instagram, where it could be a different person.
    const onInstagram = ctxFor({ network: 'instagram', handle: '@us' }, saved);
    expect(noUnknownMentions().check(post('Thanks @northfielddesign'), onInstagram).ok).toBe(false);
    // In the first comment too.
    expect(noUnknownMentions().check({ ...post('Hi'), firstComment: 'cc @stranger' }, onX).ok).toBe(false);
  });

  it('keeps only the replies the staff member is set to write, and none where the network cannot chain', () => {
    const full = { ...post('Main'), reply1: 'One', reply2: 'Two', reply3: 'Three' };
    const two = ctxFor({ network: 'x' }, { chainReplies: 2 });
    expect(limitReplies().check(full, two)).toMatchObject({
      ok: true,
      output: { reply1: 'One', reply2: 'Two', reply3: null },
    });
    // Set to write none, or a network with no reply: all dropped.
    expect(limitReplies().check(full, ctxFor({ network: 'x' }, { chainReplies: 0 }))).toMatchObject({
      output: { reply1: null, reply2: null, reply3: null },
    });
    expect(limitReplies().check(full, ctxFor({ network: 'discord' }, { chainReplies: 3 }))).toMatchObject({
      output: { reply1: null },
    });
  });

  it('refuses a reply that is too long for the network', () => {
    const ctx = ctxFor({ network: 'x' }, { chainReplies: 2 });
    expect(repliesFit().check({ ...post('Main'), reply1: 'a'.repeat(280) }, ctx).ok).toBe(true);
    const long = repliesFit().check({ ...post('Main'), reply1: 'ok', reply2: 'a'.repeat(281) }, ctx);
    expect(long).toMatchObject({ ok: false, reason: expect.stringMatching(/Reply 2 is longer than the 280/) });
  });

  it('spots words that always go to a person', () => {
    for (const text of ['I want a refund', 'my lawyer will call', 'delete my data', 'this is a scam'])
      expect(isSensitive(text)).toBe(true);
    expect(isSensitive('Love this, how do I book?')).toBe(false);
  });
});

describe('the role', () => {
  it('registers cleanly, and no task that acts externally defaults to acting alone', () => {
    const registry = new RoleRegistry().register(socialMediaRole);
    for (const task of socialMediaRole.tasks.filter((t) => t.risk === 'acts_external')) {
      expect(registry.task(task.type).task.defaultAutonomy).toBe('draft');
    }
  });

  it('has safe default settings and refuses nonsense', () => {
    expect(socialSettingsSchema.parse({})).toMatchObject({ cadence: 3, emoji: 'light', accountIds: [] });
    expect(() => socialSettingsSchema.parse({ postingTimes: ['25:00'] })).toThrow();
    expect(() => socialSettingsSchema.parse({ pillars: ['a', 'b', 'c', 'd', 'e', 'f'] })).toThrow();
  });
});

describe('triage clamping', () => {
  const engagement = (over: Partial<SocialEngagement> = {}) =>
    ({
      id: 'e1',
      accountId: 'a1',
      kind: 'comment',
      externalId: 'x1',
      authorName: 'Ada',
      text: 'How do I book?',
      replyWindowEndsAt: null,
      ...over,
    }) as SocialEngagement;
  const account = { id: 'a1', name: 'Northfield' } as ConnectedAccount;
  const run = (
    decision: Triage & { reply?: string | null },
    e: SocialEngagement,
    now = new Date('2026-11-03T10:00:00Z'),
    autonomy: 'draft' | 'act' = 'draft',
  ) =>
    Promise.resolve(
      triageEngagement.toEffects(
        {
          ...ctxFor(),
          workspaceId: 'ws',
          autonomy,
          now,
          read: (work: (m: unknown) => Promise<unknown>) =>
            work({
              findOneByOrFail: (entity: { name?: string }) =>
                Promise.resolve(entity?.name === 'ConnectedAccount' ? account : e),
            }),
        } as unknown as TaskContext,
        decision,
        { engagementId: 'e1' },
      ),
    ).then((effects) => effects.map((effect) => effect.type));

  const reply = { classification: 'question' as const, reply: 'Book here.', reason: 'r' };

  it('a question gets a drafted reply for a person, even at act', async () => {
    expect(await run(reply, engagement(), undefined, 'act')).toEqual(['updateEngagement', 'createWorkItem']);
  });

  it('a complaint is never answered, whatever the model drafted', async () => {
    expect(await run({ ...reply, classification: 'complaint' }, engagement())).toEqual([
      'updateEngagement',
      'escalate',
    ]);
  });

  it('a refund or legal mention escalates even when the model called it a question', async () => {
    expect(await run(reply, engagement({ text: 'I want a refund now' }))).toEqual(['updateEngagement', 'escalate']);
  });

  it('spam is dismissed quietly', async () => {
    expect(await run({ classification: 'spam', reason: 'r' }, engagement())).toEqual(['updateEngagement']);
  });

  it('buying intent passes a lead on, and still drafts the reply', async () => {
    expect(await run({ ...reply, classification: 'buying_intent' }, engagement())).toEqual([
      'createLead',
      'updateEngagement',
      'createWorkItem',
    ]);
  });

  it('a private message past its reply window is handed to a person, not answered', async () => {
    const dm = engagement({ kind: 'dm', replyWindowEndsAt: new Date('2026-11-03T09:00:00Z') });
    expect(await run(reply, dm)).toEqual(['updateEngagement', 'escalate']);
    const open = engagement({ kind: 'dm', replyWindowEndsAt: new Date('2026-11-03T20:00:00Z') });
    expect(await run(reply, open)).toEqual(['updateEngagement', 'createWorkItem']);
  });

  it('no reply means nothing to approve', async () => {
    expect(await run({ classification: 'praise', reason: 'r' }, engagement())).toEqual(['updateEngagement']);
  });
});
