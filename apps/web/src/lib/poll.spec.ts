import { describe, expect, it } from 'vitest';
import { pollDelay } from './poll';

describe('pollDelay', () => {
  it('checks often at first, when a short job usually finishes', () => {
    expect(pollDelay(0)).toBe(2_000);
    expect(pollDelay(29_999)).toBe(2_000);
  });

  it('slows down for a job that takes longer', () => {
    expect(pollDelay(30_000)).toBe(5_000);
    expect(pollDelay(119_999)).toBe(5_000);
    expect(pollDelay(120_000)).toBe(10_000);
  });

  it('gives up after ten minutes, so a stuck job does not poll forever', () => {
    expect(pollDelay(599_999)).toBe(10_000);
    expect(pollDelay(600_000)).toBeNull();
  });
});
