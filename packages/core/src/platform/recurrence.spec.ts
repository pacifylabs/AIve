import { describe, expect, it } from 'vitest';
import { occurrences } from './recurrence.js';

describe('occurrences', () => {
  it('weekly: the chosen weekdays, every week', () => {
    // Tuesday 3 Nov 2026 and Friday 6 Nov 2026 in the first week.
    expect(
      occurrences({ kind: 'weekly', weekdays: [2, 5], everyWeeks: 1 }, '2026-11-03', null, '2026-11-01', '2026-11-17'),
    ).toEqual(['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13', '2026-11-17']);
  });

  it('weekly every two weeks counts whole weeks from the start, so a mid-week start does not shift the rhythm', () => {
    const rule = { kind: 'weekly', weekdays: [1, 4], everyWeeks: 2 } as const;
    // Start on Thursday 5 Nov: that week counts (Thursday only, since Monday was before the start), then two weeks later.
    expect(occurrences(rule, '2026-11-05', null, '2026-11-01', '2026-12-10')).toEqual([
      '2026-11-05',
      '2026-11-16',
      '2026-11-19',
      '2026-11-30',
      '2026-12-03',
    ]);
  });

  it('stops at the end date and never goes before the start date', () => {
    const rule = { kind: 'weekly', weekdays: [1], everyWeeks: 1 } as const;
    expect(occurrences(rule, '2026-11-09', '2026-11-23', '2026-10-01', '2026-12-31')).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ]);
    expect(occurrences(rule, '2026-12-01', null, '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('monthly on a day: that day, or the last day of a month that is too short', () => {
    const rule = { kind: 'monthly_day', dayOfMonth: 31 } as const;
    expect(occurrences(rule, '2026-01-01', null, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
    // A leap year has a 29th of February.
    expect(occurrences(rule, '2028-02-01', null, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('monthly on a weekday: the first to fourth, or the last, such weekday', () => {
    // First Monday of each month, and the last Friday.
    expect(
      occurrences({ kind: 'monthly_weekday', nth: 1, weekday: 1 }, '2026-01-01', null, '2026-11-01', '2027-01-31'),
    ).toEqual(['2026-11-02', '2026-12-07', '2027-01-04']);
    expect(
      occurrences({ kind: 'monthly_weekday', nth: 5, weekday: 5 }, '2026-01-01', null, '2026-11-01', '2027-01-31'),
    ).toEqual(['2026-11-27', '2026-12-25', '2027-01-29']);
    expect(
      occurrences({ kind: 'monthly_weekday', nth: 4, weekday: 3 }, '2026-01-01', null, '2026-11-01', '2026-11-30'),
    ).toEqual(['2026-11-25']);
  });
});
