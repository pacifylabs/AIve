import 'server-only';
import type { TokenPair } from '@ai-staff/contracts';
import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'as_access';
export const REFRESH_COOKIE = 'as_refresh';
export const WORKSPACE_COOKIE = 'as_workspace';

const base = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

/**
 * Tokens live in httpOnly cookies so page scripts can never read them. Only server code (server components, server
 * actions and route handlers) talks to the API, attaching the access token itself.
 */
export async function storeTokens(tokens: TokenPair): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: tokens.accessTokenExpiresIn });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: 30 * 86_400 });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, WORKSPACE_COOKIE]) jar.delete(name);
}

export async function readSession(): Promise<{ accessToken?: string; refreshToken?: string; workspaceId?: string }> {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value,
    refreshToken: jar.get(REFRESH_COOKIE)?.value,
    workspaceId: jar.get(WORKSPACE_COOKIE)?.value,
  };
}

const MFA_COOKIE = 'as_mfa_step';

export async function rememberMfaStep(token: string): Promise<void> {
  (await cookies()).set(MFA_COOKIE, token, { ...base, maxAge: 300 });
}

/** Reads the pending two-step token; `consume` deletes it once the step succeeded. */
export async function takeMfaStep(consume: boolean): Promise<string | undefined> {
  const jar = await cookies();
  const token = jar.get(MFA_COOKIE)?.value;
  if (consume) jar.delete(MFA_COOKIE);
  return token;
}

export async function chooseWorkspace(id: string): Promise<void> {
  (await cookies()).set(WORKSPACE_COOKIE, id, { ...base, maxAge: 365 * 86_400 });
}
