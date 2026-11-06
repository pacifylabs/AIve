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

/**
 * Connects a network that has no sign-in page, from a token, app password or webhook address the person pasted. Boxes
 * arrive as `plain.<name>` or `secret.<name>`. Only plain ones are sent back to the form after a failure: a secret is
 * never put back into a page.
 */
export async function connectLoginAction(_state: FormState, data: FormData): Promise<FormState> {
  const network = field(data, 'network');
  const credentials: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value !== 'string') continue;
    if (key.startsWith('plain.')) {
      credentials[key.slice(6)] = value;
      values[key] = value;
    } else if (key.startsWith('secret.')) credentials[key.slice(7)] = value;
  }
  const result = await api<{ name: string }[]>(`/social/accounts/connect/${encodeURIComponent(network)}/credentials`, {
    method: 'POST',
    workspace: true,
    body: { credentials },
  });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/accounts');
    return { error: result.problem.errors?.[0]?.message ?? result.problem.title, values };
  }
  revalidatePath('/app/accounts');
  revalidatePath('/app/calendar');
  return { notice: `Connected ${result.data.map((account) => account.name).join(', ')}.` };
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

// ---- Writing a post by hand ----------------------------------------------------------------------------------

const COMPOSE_FIELDS = ['body', 'firstComment', 'mediaUrls', 'linkUrl', 'scheduledLocal'] as const;

/** Queues a post the person wrote: for every ticked account, now or at the time they chose. */
export async function composePostAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api<{ postId: string | null; queued: boolean }[]>('/social/posts', {
    method: 'POST',
    workspace: true,
    body: {
      requestId: field(data, 'requestId'),
      accountIds: data.getAll('accountId').filter((value): value is string => typeof value === 'string'),
      body: field(data, 'body'),
      firstComment: field(data, 'firstComment').trim() || undefined,
      mediaUrls: lines(field(data, 'mediaUrls')),
      linkUrl: field(data, 'linkUrl').trim() || undefined,
      scheduledLocal: field(data, 'scheduledLocal') || undefined,
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/compose', COMPOSE_FIELDS);
  revalidatePath('/app/calendar');
  redirect('/app/calendar');
}

// ---- Sign-offs ---------------------------------------------------------------------------------------------

/** Saves the sign-off added to every post for one account. Empty removes it. It lives in the staff member's settings. */
export async function saveSignatureAction(_state: FormState, data: FormData): Promise<FormState> {
  const accountId = field(data, 'accountId');
  const signature = field(data, 'signature').trim();
  const staff = await api<{ id: string; roleKey: string; settings: { signatures?: Record<string, string> } }[]>(
    '/staff',
    { workspace: true },
  );
  if (!staff.ok) return failed(staff.problem, data, '/app/accounts', ['signature']);
  const social = staff.data.find((member) => member.roleKey === 'social_media');
  if (!social) return { error: 'Hire a Social Media Staff member first.', values: { signature } };
  const signatures = { ...(social.settings.signatures ?? {}) };
  if (signature) signatures[accountId] = signature;
  else delete signatures[accountId];
  const result = await api(`/staff/${encodeURIComponent(social.id)}/settings`, {
    method: 'PATCH',
    workspace: true,
    body: { settings: { signatures } },
  });
  if (!result.ok) return failed(result.problem, data, '/app/accounts', ['signature']);
  revalidatePath('/app/accounts');
  // The text is echoed back so the box keeps it: React empties an uncontrolled box after a form action.
  return {
    notice: signature ? 'Sign-off saved. New drafts will end with it.' : 'Sign-off removed.',
    values: { signature },
  };
}

// ---- Feeds -------------------------------------------------------------------------------------------------

/** Adds a blog or news feed. The API reads it first, so an address that is not a feed is refused with a reason. */
export async function addFeedAction(_state: FormState, data: FormData): Promise<FormState> {
  const accountIds = data.getAll('accountId').filter((value): value is string => typeof value === 'string');
  const result = await api<{ id: string; queued: number }>('/social/feeds', {
    method: 'POST',
    workspace: true,
    body: { url: field(data, 'url').trim(), accountIds, note: field(data, 'note').trim() || undefined },
  });
  if (!result.ok) return failed(result.problem, data, '/app/feeds', ['url', 'note']);
  revalidatePath('/app/feeds');
  revalidatePath('/app/inbox');
  return {
    notice: result.data.queued
      ? 'Feed added. A draft for the newest article is on its way to your inbox.'
      : 'Feed added. New articles will be picked up automatically.',
  };
}

export async function checkFeedAction(data: FormData): Promise<void> {
  const result = await api(`/social/feeds/${encodeURIComponent(field(data, 'id'))}/check`, {
    method: 'POST',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/feeds');
  revalidatePath('/app/feeds');
  revalidatePath('/app/inbox');
}

export async function pauseFeedAction(data: FormData): Promise<void> {
  const result = await api(`/social/feeds/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'PATCH',
    workspace: true,
    body: { paused: field(data, 'paused') === 'true' },
  });
  if (!result.ok && result.problem.status === 401) expired('/app/feeds');
  revalidatePath('/app/feeds');
}

export async function removeFeedAction(data: FormData): Promise<void> {
  const result = await api(`/social/feeds/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/feeds');
  revalidatePath('/app/feeds');
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
