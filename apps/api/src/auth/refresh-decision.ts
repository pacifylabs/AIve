/**
 * How long an exchanged refresh token still works. Two requests often refresh at the same moment (several pages
 * loading after the access token ran out, two tabs, a retry against an API waking from sleep). Without this window the
 * second one looked like a stolen token and signed the person out of every device. A replay after it still revokes the
 * whole family.
 */
export const REUSE_GRACE_MS = 60_000;

export type RefreshDecision = 'rotate' | 'grace' | 'reused' | 'invalid';

interface TokenRow {
  revokedAt: Date | null;
  rotatedAt: Date | null;
  expiresAt: Date;
}

export function refreshDecision(row: TokenRow | null, now: Date): RefreshDecision {
  if (!row || row.revokedAt || row.expiresAt <= now) return 'invalid';
  if (!row.rotatedAt) return 'rotate';
  return now.getTime() - row.rotatedAt.getTime() <= REUSE_GRACE_MS ? 'grace' : 'reused';
}
