import { describe, expect, it } from 'vitest';
import { activityTone, groupByDay, roleTone, standingOf, type TaskProgress } from './staff';

const task = (over: Partial<TaskProgress> = {}): TaskProgress => ({
  autonomy: 'draft',
  mode: 'ask',
  progress: { approvals: 3, met: false },
  rules: { approvals: 20 },
  ...over,
});

describe('standingOf', () => {
  it('starts everyone on probation', () => {
    expect(standingOf('active', [])).toBe('probation');
    expect(standingOf('active', [task()])).toBe('probation');
  });

  it('says ready once a record meets the rules but the task still asks', () => {
    expect(standingOf('active', [task({ progress: { approvals: 20, met: true } })])).toBe('ready');
    // A task whose autopilot is switched off is not waiting for promotion.
    expect(standingOf('active', [task({ mode: 'off', progress: { approvals: 20, met: true } })])).toBe('probation');
  });

  it('says promoted once any task acts alone, and paused above everything', () => {
    expect(standingOf('active', [task(), task({ autonomy: 'act' })])).toBe('trusted');
    expect(standingOf('paused', [task({ autonomy: 'act' })])).toBe('paused');
  });
});

describe('activityTone', () => {
  it('marks failures, warnings and wins, and leaves the rest neutral', () => {
    expect(activityTone('post.failed')).toBe('bad');
    expect(activityTone('account.expiring')).toBe('warn');
    expect(activityTone('post.published')).toBe('good');
    expect(activityTone('draft.created')).toBe('neutral');
  });
});

describe('roleTone', () => {
  it('gives each role its colour and new roles a safe default', () => {
    expect(roleTone('sales_manager')).toBe('sales');
    expect(roleTone('social_media')).toBe('social');
    expect(roleTone('future_role')).toBe('social');
  });
});

describe('groupByDay', () => {
  const now = new Date('2026-11-20T10:00:00Z');

  it('labels today and yesterday, then dates, in the workspace time zone', () => {
    const groups = groupByDay(
      [
        { createdAt: '2026-11-20T08:00:00Z' },
        { createdAt: '2026-11-19T22:30:00Z' }, // 23:30 in Lagos: still yesterday there
        { createdAt: '2026-11-17T09:00:00Z' },
      ],
      'Africa/Lagos',
      now,
    );
    expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday', 'Tuesday 17 November']);
  });

  it('moves an event across midnight with the time zone', () => {
    // 23:30 UTC on the 19th is already the 20th in Lagos (UTC+1).
    const [first] = groupByDay([{ createdAt: '2026-11-19T23:30:00Z' }], 'Africa/Lagos', now);
    expect(first?.label).toBe('Today');
  });

  it('returns nothing for an empty list', () => {
    expect(groupByDay([], 'UTC', now)).toEqual([]);
  });
});
