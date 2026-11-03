import { isOptOut } from '@ai-staff/mail';
import { describe, expect, it } from 'vitest';
import { OUTREACH_FIXTURES } from './outreach.js';
import { REPLY_FIXTURES } from './replies.js';

describe('eval fixtures', () => {
  it('has 30 outreach and 40 reply fixtures with unique ids', () => {
    expect(OUTREACH_FIXTURES).toHaveLength(30);
    expect(REPLY_FIXTURES).toHaveLength(40);
    expect(new Set(OUTREACH_FIXTURES.map((fixture) => fixture.id)).size).toBe(30);
    expect(new Set(REPLY_FIXTURES.map((fixture) => fixture.id)).size).toBe(40);
  });

  it('covers every reply classification and the injection cases', () => {
    const classes = new Set(REPLY_FIXTURES.flatMap((fixture) => fixture.expect.classification));
    for (const classification of [
      'interested',
      'question',
      'objection',
      'out_of_office',
      'opt_out',
      'bounce',
      'unclear',
      'escalate',
    ]) {
      expect(classes.has(classification as never)).toBe(true);
    }
    expect(REPLY_FIXTURES.filter((fixture) => fixture.group === 'injection').length).toBeGreaterThanOrEqual(4);
    expect(OUTREACH_FIXTURES.filter((fixture) => fixture.injection).length).toBeGreaterThanOrEqual(5);
  });

  it('never expects a reply to an opt-out or a bounce', () => {
    for (const fixture of REPLY_FIXTURES.filter((f) => f.group === 'opt_out' || f.group === 'bounce')) {
      expect(fixture.expect.action).toEqual(['stop']);
    }
  });
});

describe('opt-outs are decided by rule, not by a model', () => {
  it('stops every opt-out fixture from the text alone', () => {
    for (const fixture of REPLY_FIXTURES.filter((f) => f.optOutByRule)) {
      expect(isOptOut(fixture.text), fixture.id).toBe(true);
    }
  });

  it('does not stop on any other reply', () => {
    for (const fixture of REPLY_FIXTURES.filter((f) => !f.optOutByRule)) {
      expect(isOptOut(fixture.text), fixture.id).toBe(false);
    }
  });
});
