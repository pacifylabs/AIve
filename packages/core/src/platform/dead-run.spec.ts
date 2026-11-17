import { describe, expect, it } from 'vitest';
import { deadRunSummary } from './dead-run.js';

describe('deadRunSummary', () => {
  it('names the task in words a person reads, not its code', () => {
    expect(deadRunSummary('Plan the week', 3)).toBe(
      '“Plan the week” failed 3 times and stopped. Try it again from the dashboard.',
    );
  });

  it('falls back to a plain phrase when the task is unknown', () => {
    expect(deadRunSummary(null, 5)).toBe('A task failed 5 times and stopped. Try it again from the dashboard.');
  });
});
