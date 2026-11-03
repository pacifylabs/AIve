'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Problem } from '@ai-staff/contracts';
import { api } from '@/lib/api';
import { echo, field, type FormState, fromProblem } from '@/lib/form-state';

function expired(returnTo: string): never {
  redirect(`/session/refresh?next=${encodeURIComponent(returnTo)}`);
}

function failed(problem: Problem, data: FormData, returnTo: string, names: readonly string[]): FormState {
  if (problem.status === 401) expired(returnTo);
  return { ...fromProblem(problem), values: echo(data, (name) => names.includes(name)) };
}

const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

// ---- Accounts ----------------------------------------------------------------------------------------------

/** Sends the person to the network to sign in. They come back through the API's callback, then to /app/accounts. */
export async function connectNetworkAction(data: FormData): Promise<void> {
  const result = await api<{ authUrl: string }>(
    `/social/accounts/connect/${encodeURIComponent(field(data, 'network'))}`,
    {
      method: 'POST',
      workspace: true,
    },
  );
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/accounts');
    redirect(`/app/accounts?error=${encodeURIComponent(result.problem.title)}`);
  }
  redirect(result.data.authUrl);
}

export async function selectAccountsAction(_state: FormState, data: FormData): Promise<FormState> {
  const pending = field(data, 'pending');
  const result = await api(`/social/pending/${encodeURIComponent(pending)}/select`, {
    method: 'POST',
    workspace: true,
    body: { externalIds: data.getAll('externalId').filter((value): value is string => typeof value === 'string') },
  });
  if (!result.ok) {
    if (result.problem.status === 401) expired(`/app/accounts?pending=${pending}`);
    if (result.problem.status === 404) redirect(`/app/accounts?error=${encodeURIComponent(result.problem.title)}`);
    return { ...fromProblem(result.problem), fields: { externalIds: result.problem.errors?.[0]?.message ?? '' } };
  }
  revalidatePath('/app/accounts');
  redirect('/app/accounts');
}

export async function disconnectAccountAction(data: FormData): Promise<void> {
  const result = await api(`/social/accounts/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/accounts');
  revalidatePath('/app/accounts');
  revalidatePath('/app/calendar');
}

// ---- Posts -------------------------------------------------------------------------------------------------

export async function cancelPostAction(data: FormData): Promise<void> {
  const result = await api(`/social/posts/${encodeURIComponent(field(data, 'id'))}/cancel`, {
    method: 'POST',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/calendar');
  revalidatePath('/app/calendar');
}

export async function resolvePostAction(data: FormData): Promise<void> {
  const outcome = field(data, 'outcome') === 'published' ? 'published' : 'retry';
  const result = await api(`/social/posts/${encodeURIComponent(field(data, 'id'))}/resolve`, {
    method: 'POST',
    workspace: true,
    body: { outcome },
  });
  if (!result.ok && result.problem.status === 401) expired('/app/calendar');
  revalidatePath('/app/calendar');
}

// ---- Hiring ------------------------------------------------------------------------------------------------

const HIRE_FIELDS = ['displayName', 'signature', 'goal', 'pillars', 'styleExamples', 'neverPost', 'cadence'] as const;

/** Hires Social Media Staff from the interview. The accounts chosen are the only ones it will post to. */
export async function hireSocialAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/staff', {
    method: 'POST',
    workspace: true,
    body: {
      roleKey: 'social_media',
      displayName: field(data, 'displayName'),
      signature: null,
      settings: {
        accountIds: data.getAll('accountId').filter((value): value is string => typeof value === 'string'),
        goal: field(data, 'goal').trim(),
        pillars: lines(field(data, 'pillars')),
        // Examples are separated by a line with three dashes.
        styleExamples: field(data, 'styleExamples')
          .split(/^\s*---\s*$/m)
          .map((example) => example.trim())
          .filter(Boolean),
        neverPost: field(data, 'neverPost').trim(),
        cadence: Number(field(data, 'cadence') || 3),
      },
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/hire', HIRE_FIELDS);
  revalidatePath('/app/hire');
  redirect('/app/calendar');
}
