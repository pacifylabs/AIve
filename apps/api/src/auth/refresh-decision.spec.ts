import { describe, expect, it } from 'vitest';
import { REUSE_GRACE_MS, refreshDecision } from './refresh-decision.js';

const now = new Date('2026-11-17T10:36:07Z');
const live = { revokedAt: null, rotatedAt: null, expiresAt: new Date('2026-12-17T00:00:00Z') };
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('refreshDecision', () => {
  it('rotates a token that has not been used yet', () => {
    expect(refreshDecision(live, now)).toBe('rotate');
  });

  it('refuses a missing, revoked or expired token', () => {
    expect(refreshDecision(null, now)).toBe('invalid');
    expect(refreshDecision({ ...live, revokedAt: ago(1000) }, now)).toBe('invalid');
    expect(refreshDecision({ ...live, expiresAt: now }, now)).toBe('invalid');
  });

  it('lets a token used again moments after it was exchanged through, as two requests racing to refresh', () => {
    // Seen in production: a refresh, then the same token again 2 seconds and 52 seconds later.
    expect(refreshDecision({ ...live, rotatedAt: ago(2_000) }, now)).toBe('grace');
    expect(refreshDecision({ ...live, rotatedAt: ago(52_000) }, now)).toBe('grace');
    expect(refreshDecision({ ...live, rotatedAt: ago(REUSE_GRACE_MS) }, now)).toBe('grace');
  });

  it('treats a token replayed after the grace window as copied', () => {
    expect(refreshDecision({ ...live, rotatedAt: ago(REUSE_GRACE_MS + 1) }, now)).toBe('reused');
    expect(refreshDecision({ ...live, rotatedAt: ago(3_600_000) }, now)).toBe('reused');
  });

  it('still refuses a revoked token inside the grace window', () => {
    expect(refreshDecision({ ...live, rotatedAt: ago(1000), revokedAt: ago(500) }, now)).toBe('invalid');
  });
});
