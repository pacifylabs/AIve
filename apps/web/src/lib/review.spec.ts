import { describe, expect, it } from 'vitest';
import { approvedPayload, fromLocalInput, kindLabel, planIdeas, toLocalInput } from './review';

const idea = (id: string, day: string) => ({
  id,
  accountId: '0190c9b0-0000-7000-8000-000000000001',
  network: 'linkedin',
  handle: null,
  accountName: 'Ada',
  scheduledFor: `2026-11-${day}T09:00:00.000Z`,
  pillar: 'CVs',
  angle: `Idea ${id}`,
});

describe('kindLabel', () => {
  it('names known kinds in plain words and tidies unknown ones', () => {
    expect(kindLabel('post_draft')).toBe('Post');
    expect(kindLabel('plan')).toBe('Weekly plan');
    expect(kindLabel('note_draft')).toBe('Note draft');
  });
});

describe('local times in the workspace time zone', () => {
  it('shows an ISO time as the wall-clock time there', () => {
    expect(toLocalInput('2026-11-23T09:00:00.000Z', 'Africa/Lagos')).toBe('2026-11-23T10:00');
    expect(toLocalInput('2026-11-23T09:00:00.000Z', 'UTC')).toBe('2026-11-23T09:00');
    expect(toLocalInput('not a date', 'UTC')).toBe('');
  });

  it('reads a wall-clock time back to the same instant, across a daylight-saving change', () => {
    expect(fromLocalInput('2026-11-23T10:00', 'Africa/Lagos')).toBe('2026-11-23T09:00:00.000Z');
    // New York: 9:30 on 8 March 2026 is after the clocks went forward (UTC-4).
    expect(fromLocalInput('2026-03-08T09:30', 'America/New_York')).toBe('2026-03-08T13:30:00.000Z');
    expect(fromLocalInput('tomorrow', 'UTC')).toBeNull();
  });
});

describe('approvedPayload', () => {
  it('replaces only text the draft had, and carries everything else over', () => {
    const original = { body: 'Hello', network: 'linkedin', accountId: 'a1', count: 3 };
    const result = approvedPayload(
      original,
      [
        ['payload.body', 'Hello there'],
        ['payload.network', 'x'], // not editable text in the form, but present: allowed only because it was text
        ['payload.injected', 'nope'],
        ['id', 'ignored'],
      ],
      'UTC',
    );
    expect(result).toEqual({
      ok: true,
      payload: { body: 'Hello there', network: 'x', accountId: 'a1', count: 3 },
    });
  });

  it('turns a chosen local time into the scheduled time, and refuses a non-time', () => {
    const original = { body: 'Hi', scheduledFor: '2026-11-23T09:00:00.000Z' };
    expect(approvedPayload(original, [['scheduledLocal', '2026-11-24T12:30']], 'Africa/Lagos')).toEqual({
      ok: true,
      payload: { body: 'Hi', scheduledFor: '2026-11-24T11:30:00.000Z' },
    });
    expect(approvedPayload(original, [['scheduledLocal', '']], 'UTC')).toMatchObject({
      ok: false,
      field: 'scheduledLocal',
    });
  });

  it('keeps only the ticked ideas of a plan and rewrites its summary to match', () => {
    const original = {
      weekStart: '2026-11-23',
      overview: 'old',
      items: [idea('1', '23'), idea('2', '24'), idea('3', '25')],
    };
    const result = approvedPayload(
      original,
      [
        ['planShown', '1'],
        ['keep', '1'],
        ['keep', '3'],
      ],
      'UTC',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(planIdeas(result.payload).map((kept) => kept.id)).toEqual(['1', '3']);
    expect(result.payload.overview).toBe(
      '2026-11-23 · Ada (linkedin) · CVs: Idea 1\n2026-11-25 · Ada (linkedin) · CVs: Idea 3',
    );
  });

  it('refuses a plan with every idea unticked', () => {
    const original = { weekStart: '2026-11-23', items: [idea('1', '23')] };
    expect(approvedPayload(original, [['planShown', '1']], 'UTC')).toEqual({
      ok: false,
      field: 'keep',
      message: 'Keep at least one idea, or reject the plan.',
    });
  });

  it('leaves a plan whole when the plan list was not part of the form', () => {
    const original = { weekStart: '2026-11-23', items: [idea('1', '23'), idea('2', '24')] };
    const result = approvedPayload(original, [], 'UTC');
    expect(result.ok && planIdeas(result.payload)).toHaveLength(2);
  });
});
