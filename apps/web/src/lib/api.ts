import 'server-only';
import type { MeResponse, Problem } from '@ai-staff/contracts';
import { redirect } from 'next/navigation';
import { readSession } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:3100';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: Problem };

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the signed-in user's access token. */
  auth?: boolean;
  /** Act inside the chosen workspace (sends X-Workspace-Id). */
  workspace?: boolean;
}

/** Calls the API from the server. Expected failures come back as a Problem; network failures become one too. */
export async function api<T>(path: string, options: CallOptions = {}): Promise<ApiResult<T>> {
  const session = options.auth || options.workspace ? await readSession() : {};
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  if (options.workspace) {
    const workspaceId = session.workspaceId ?? (await firstWorkspaceId());
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return {
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'We could not reach the server. Try again in a moment.',
        status: 503,
        code: 'internal_error',
      },
    };
  }
  if (response.status === 204) return { ok: true, data: undefined as T };
  const json = (await response.json().catch(() => null)) as unknown;
  if (response.ok) return { ok: true, data: json as T };
  const problem = (json as Problem | null) ?? {
    type: 'about:blank',
    title: 'Something went wrong.',
    status: response.status,
    code: 'internal_error',
  };
  return { ok: false, problem };
}

/** With no workspace chosen yet (a fresh sign-in), act in the first one the user belongs to. */
async function firstWorkspaceId(): Promise<string | undefined> {
  const me = await api<MeResponse>('/me', { auth: true });
  return me.ok ? me.data.workspaces[0]?.id : undefined;
}

/**
 * For server components: returns data, or sends the visitor to refresh their session when the access token has
 * expired (cookies can only be rewritten in a route handler or action, not while rendering a page).
 */
export async function apiOrRedirect<T>(
  path: string,
  returnTo: string,
  options: CallOptions = {},
): Promise<ApiResult<T>> {
  const result = await api<T>(path, { auth: true, ...options });
  if (!result.ok && result.problem.status === 401) redirect(`/session/refresh?next=${encodeURIComponent(returnTo)}`);
  return result;
}
