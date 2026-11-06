import { describe, expect, it } from 'vitest';
import { AUTOPILOT_LIMITS, autopilotProgress, type AutopilotRules, resolveAutopilotRules } from './autopilot.js';

const role = { approvals: 20, maxMedianEditRatio: 0.15, windowDays: 30 };

describe('resolveAutopilotRules', () => {
  it("uses the role's rule where the owner set nothing, and a default daily limit", () => {
    expect(resolveAutopilotRules(role, {})).toEqual({
      approvals: 20,
      maxMedianEditRatio: 0.15,
      windowDays: 30,
      maxPerDay: AUTOPILOT_LIMITS.maxPerDay.fallback,
    });
  });

  it("lets the owner override each number, inside the platform's limits", () => {
    expect(
      resolveAutopilotRules(role, { approvals: 8, windowDays: 14, maxMedianEditRatio: 0.1, maxPerDay: 3 }),
    ).toEqual({ approvals: 8, windowDays: 14, maxMedianEditRatio: 0.1, maxPerDay: 3 });
  });

  it('never lets "automatic" mean "without evidence", whatever the owner types', () => {
    const rules = resolveAutopilotRules(role, { approvals: 0, windowDays: 1, maxMedianEditRatio: 1, maxPerDay: 9999 });
    expect(rules.approvals).toBe(AUTOPILOT_LIMITS.approvals.min);
    expect(rules.windowDays).toBe(AUTOPILOT_LIMITS.windowDays.min);
    expect(rules.maxMedianEditRatio).toBe(AUTOPILOT_LIMITS.maxMedianEditRatio.max);
    expect(rules.maxPerDay).toBe(AUTOPILOT_LIMITS.maxPerDay.max);
  });

  it('ignores values that are not numbers', () => {
    const rules = resolveAutopilotRules(role, { approvals: Number.NaN, maxPerDay: null });
    expect(rules.approvals).toBe(20);
    expect(rules.maxPerDay).toBe(AUTOPILOT_LIMITS.maxPerDay.fallback);
  });
});

describe('autopilotProgress', () => {
  const rules: AutopilotRules = { approvals: 5, maxMedianEditRatio: 0.15, windowDays: 30, maxPerDay: 10 };
  const approved = (count: number, ratio = 0) => Array.from({ length: count }, () => ({ state: 'approved', ratio }));

  it('is met with enough clean approvals and no rejection', () => {
    expect(autopilotProgress(approved(5), rules)).toMatchObject({
      approvals: 5,
      rejections: 0,
      met: true,
      missing: [],
    });
  });

  it('says how many approvals are still needed', () => {
    const progress = autopilotProgress(approved(3), rules);
    expect(progress.met).toBe(false);
    expect(progress.missing).toEqual(['2 more approvals needed']);
  });

  it('is blocked by any rejection in the window', () => {
    const progress = autopilotProgress([...approved(9), { state: 'rejected', ratio: null }], rules);
    expect(progress.met).toBe(false);
    expect(progress.missing).toEqual(['1 rejection in the last 30 days']);
  });

  it('is blocked when the median edit is heavier than the limit, and counts edited items as approvals', () => {
    const progress = autopilotProgress(
      Array.from({ length: 6 }, () => ({ state: 'edited', ratio: 0.4 })),
      rules,
    );
    expect(progress).toMatchObject({ approvals: 6, met: false });
    expect(progress.missing[0]).toContain('40%');
  });

  it('uses the median, so one heavy edit does not block a clean record', () => {
    const rows = [...approved(5, 0.02), { state: 'edited', ratio: 0.9 }];
    expect(autopilotProgress(rows, rules).met).toBe(true);
  });
});
