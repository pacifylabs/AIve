import { describe, expect, it } from 'vitest';
import { localDate, localTime, sameTimeOnDay, zoneLabel } from './zoned';

describe('zoned times', () => {
  it('shows an instant in the workspace’s own time and day', () => {
    // 08:00 UTC is 09:00 in Lagos (UTC+1, no daylight saving).
    expect(localTime('2026-11-23T08:00:00.000Z', 'Africa/Lagos')).toBe('09:00');
    expect(localDate('2026-11-23T08:00:00.000Z', 'Africa/Lagos')).toBe('2026-11-23');
    // Late UTC evening is already the next day in Lagos.
    expect(localDate('2026-11-23T23:30:00.000Z', 'Africa/Lagos')).toBe('2026-11-24');
  });

  it('moves a post to another day at the same local time', () => {
    expect(sameTimeOnDay('2026-11-23T08:00:00.000Z', '2026-11-25', 'Africa/Lagos')).toBe('2026-11-25T08:00:00.000Z');
  });

  it('keeps the local time across a daylight-saving change', () => {
    // 09:00 in London is 08:00 UTC in summer and 09:00 UTC in winter; the clocks went back on 25 Oct 2026.
    expect(sameTimeOnDay('2026-10-20T08:00:00.000Z', '2026-10-27', 'Europe/London')).toBe('2026-10-27T09:00:00.000Z');
  });

  it('names the zone people know', () => {
    expect(zoneLabel('Africa/Lagos')).toBe('Lagos time');
    expect(zoneLabel('UTC')).toBe('UTC');
  });
});
