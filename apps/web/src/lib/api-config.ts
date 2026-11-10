/**
 * Where the web app finds the API, and how long it waits for it.
 *
 * The hosted API runs on a plan that sleeps when idle, and waking it took 35 to 85 seconds when measured. A shorter
 * wait turned every first visit after a quiet spell into "We could not reach the server", so calls outlast a wake.
 */
export const API_TIMEOUT_MS = 110_000;

const LOCAL_API = 'http://localhost:3100';

type Env = Record<string, string | undefined>;

/** The API's base address. A deployed build without API_URL fails loudly rather than quietly calling localhost. */
export function apiBaseUrl(env: Env = process.env): string {
  const url = env.API_URL?.trim();
  if (url) return url.replace(/\/+$/, '');
  if (env.VERCEL) throw new Error('API_URL is not set for this deployment, so the web app cannot reach the API.');
  return LOCAL_API;
}
