/**
 * How long to wait before checking a background job again, given how long we have been waiting. Short jobs finish in
 * seconds, so the first checks are quick; after ten minutes we stop, and the page says what state the job is in.
 */
export function pollDelay(elapsedMs: number): number | null {
  if (elapsedMs < 30_000) return 2_000;
  if (elapsedMs < 120_000) return 5_000;
  if (elapsedMs < 600_000) return 10_000;
  return null;
}
