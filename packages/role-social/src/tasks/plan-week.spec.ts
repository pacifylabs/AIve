import { describe, expect, it } from 'vitest';
import { planWeek } from './plan-week.js';

describe('planWeek', () => {
  it('leaves room for the largest plan the schema allows, so the answer is never cut off', () => {
    // 15 ideas with every field at its limit, as JSON. Seen on staging: 9 ideas did not fit in 1,200 tokens.
    const idea = {
      accountId: '01a1e8f6-7e9b-73c0-a2b8-4876b3a5a82d',
      date: '2026-11-23',
      pillar: 'p'.repeat(120),
      angle: 'a'.repeat(300),
    };
    const largest = JSON.stringify({ items: Array.from({ length: 15 }, () => idea) });
    // Three characters per token is a cautious estimate for English text and JSON punctuation.
    expect(planWeek.model!.maxTokens).toBeGreaterThanOrEqual(Math.ceil(largest.length / 3));
  });
});
