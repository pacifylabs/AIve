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

const COMPOSE_FIELDS = ['body', 'firstComment', 'mediaUrls', 'linkUrl', 'scheduledLocal', 'repeatEndsOn'] as const;
// Follow-up boxes are echoed back as `followUp.0`, `followUp.1`… so the parts a person wrote survive a refused post.

/** Queues a post the person wrote: for every ticked account, now or at the time they chose. */
/** The repeat the form describes, or nothing when "Does not repeat" is chosen. */
function repeatFrom(data: FormData) {
  const kind = field(data, 'repeatKind');
  if (kind === 'weekly') {
    return {
      kind,
      weekdays: data.getAll('weekday').map(Number),
      everyWeeks: Number(field(data, 'everyWeeks') || 1),
    };
  }
  if (kind === 'monthly_day') return { kind, dayOfMonth: Number(field(data, 'dayOfMonth') || 1) };
  if (kind === 'monthly_weekday') {
    return { kind, nth: Number(field(data, 'nth') || 1), weekday: Number(field(data, 'monthWeekday') || 1) };
  }
  return undefined;
}

export async function composePostAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api<unknown>('/social/posts', {
    method: 'POST',
    workspace: true,
    body: {
      requestId: field(data, 'requestId'),
      accountIds: data.getAll('accountId').filter((value): value is string => typeof value === 'string'),
      body: field(data, 'body'),
      firstComment: field(data, 'firstComment').trim() || undefined,
      mediaUrls: lines(field(data, 'mediaUrls')),
      followUps: data
        .getAll('followUp')
        .filter((value): value is string => typeof value === 'string' && value.trim() !== ''),
      linkUrl: field(data, 'linkUrl').trim() || undefined,
      tagId: field(data, 'tagId') || undefined,
      repeat: repeatFrom(data),
      repeatEndsOn: field(data, 'repeatEndsOn') || undefined,
      scheduledLocal: field(data, 'scheduledLocal') || undefined,
    },
  });
  if (!result.ok) {
    const state = failed(result.problem, data, '/app/compose', COMPOSE_FIELDS);
    data.getAll('followUp').forEach((part, index) => {
      if (typeof part === 'string') state.values = { ...state.values, [`followUp.${index}`]: part };
    });
    return state;
  }
  revalidatePath('/app/calendar');
  redirect('/app/calendar');
}

// ---- Changing a post that has not gone out ----------------------------------------------------------------------

const EDIT_FIELDS = ['body', 'scheduledLocal'] as const;

/** Saves new words and/or a new time. `expectedUpdatedAt` is the copy the person was looking at. */
export async function editPostAction(_state: FormState, data: FormData): Promise<FormState> {
  const body = field(data, 'body').trim();
  const result = await api(`/social/posts/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'PATCH',
    workspace: true,
    body: {
      expectedUpdatedAt: field(data, 'expectedUpdatedAt'),
      ...(body ? { body } : {}),
      ...(field(data, 'scheduledLocal') ? { scheduledLocal: field(data, 'scheduledLocal') } : {}),
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/calendar', EDIT_FIELDS);
  revalidatePath('/app/calendar');
  return { notice: 'Saved.', values: echo(data, (name) => name === 'body') };
}

/** A drag on the calendar: the same time of day (UTC, as the calendar shows it), on the day it was dropped on. */
export async function movePostAction(
  id: string,
  expectedUpdatedAt: string,
  currentIso: string,
  day: string,
): Promise<{ error?: string }> {
  const result = await api(`/social/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    workspace: true,
    body: { expectedUpdatedAt, scheduledFor: `${day}T${currentIso.slice(11)}` },
  });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/calendar');
    return { error: result.problem.errors?.[0]?.message ?? result.problem.title };
  }
  revalidatePath('/app/calendar');
  return {};
}

// ---- Saved @mentions ----------------------------------------------------------------------------------------

/** Saves an account the staff member may tag. The network confirms it where it can. */
export async function addMentionAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/social/mentions', {
    method: 'POST',
    workspace: true,
    body: { network: field(data, 'network'), handle: field(data, 'handle') },
  });
  if (!result.ok) return failed(result.problem, data, '/app/accounts', ['handle']);
  revalidatePath('/app/accounts');
  return { notice: 'Saved. Your staff member may now tag this account.' };
}

export async function removeMentionAction(data: FormData): Promise<void> {
  const result = await api(
    `/social/mentions/${encodeURIComponent(field(data, 'network'))}/${encodeURIComponent(field(data, 'handle'))}`,
    { method: 'DELETE', workspace: true },
  );
  if (!result.ok && result.problem.status === 401) expired('/app/accounts');
  revalidatePath('/app/accounts');
}

// ---- How the staff member drafts -------------------------------------------------------------------------------

/** The tag put on every staff draft, and how many follow-up replies a draft may carry. */
export async function saveDraftSettingsAction(_state: FormState, data: FormData): Promise<FormState> {
  const staff = await api<{ id: string; roleKey: string }[]>('/staff', { workspace: true });
  if (!staff.ok) return failed(staff.problem, data, '/app/templates', []);
  const social = staff.data.find((member) => member.roleKey === 'social_media');
  if (!social) return { error: 'Hire a Social Media Staff member first.' };
  const result = await api(`/staff/${encodeURIComponent(social.id)}/settings`, {
    method: 'PATCH',
    workspace: true,
    body: {
      settings: {
        draftTagId: field(data, 'draftTagId') || null,
        chainReplies: Number(field(data, 'chainReplies') || 0),
      },
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/templates', []);
  revalidatePath('/app/templates');
  return { notice: 'Saved. New drafts follow this.' };
}

// ---- Media library ------------------------------------------------------------------------------------------

interface UploadTicket {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

/** What the browser needs to upload one file straight to Cloudinary. */
export async function mediaTicketAction(): Promise<{ ticket?: UploadTicket; error?: string }> {
  const result = await api<UploadTicket>('/social/media/ticket', { method: 'POST', workspace: true });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/media');
    return { error: result.problem.title };
  }
  return { ticket: result.data };
}

/** Records a file the browser has uploaded. The API asks Cloudinary what was stored before it believes this. */
export async function registerMediaAction(
  publicId: string,
  type: 'image' | 'video',
  name: string,
): Promise<{ error?: string }> {
  const result = await api('/social/media', { method: 'POST', workspace: true, body: { publicId, type, name } });
  if (!result.ok) return { error: result.problem.errors?.[0]?.message ?? result.problem.title };
  revalidatePath('/app/media');
  revalidatePath('/app/compose');
  return {};
}

export async function deleteMediaAction(data: FormData): Promise<void> {
  const result = await api(`/social/media/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/media');
    redirect(`/app/media?error=${encodeURIComponent(result.problem.title)}`);
  }
  revalidatePath('/app/media');
  revalidatePath('/app/compose');
}

// ---- Tags and templates -------------------------------------------------------------------------------------

/** Makes a tag, or changes one when an id is sent. */
export async function saveTagAction(_state: FormState, data: FormData): Promise<FormState> {
  const id = field(data, 'id');
  const result = await api(id ? `/social/tags/${encodeURIComponent(id)}` : '/social/tags', {
    method: id ? 'PATCH' : 'POST',
    workspace: true,
    body: { name: field(data, 'name'), colour: field(data, 'colour') || 'blue' },
  });
  if (!result.ok) return failed(result.problem, data, '/app/templates', ['name', 'colour']);
  revalidatePath('/app/templates');
  revalidatePath('/app/calendar');
  revalidatePath('/app/compose');
  return { notice: id ? 'Tag saved.' : 'Tag added.', values: id ? { name: field(data, 'name') } : {} };
}

export async function deleteTagAction(data: FormData): Promise<void> {
  const result = await api(`/social/tags/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/templates');
  revalidatePath('/app/templates');
  revalidatePath('/app/calendar');
  revalidatePath('/app/compose');
}

const TEMPLATE_FIELDS = ['name', 'body', 'firstComment', 'mediaUrls', 'linkUrl'] as const;

/** Saves a template, or changes one when an id is sent. */
export async function saveTemplateAction(_state: FormState, data: FormData): Promise<FormState> {
  const id = field(data, 'id');
  const result = await api(id ? `/social/templates/${encodeURIComponent(id)}` : '/social/templates', {
    method: id ? 'PATCH' : 'POST',
    workspace: true,
    body: {
      name: field(data, 'name'),
      body: field(data, 'body'),
      firstComment: field(data, 'firstComment').trim() || undefined,
      mediaUrls: lines(field(data, 'mediaUrls')),
      linkUrl: field(data, 'linkUrl').trim() || undefined,
      accountIds: data.getAll('accountId').filter((value): value is string => typeof value === 'string'),
      tagId: field(data, 'tagId') || null,
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/templates', TEMPLATE_FIELDS);
  revalidatePath('/app/templates');
  revalidatePath('/app/compose');
  return {
    notice: id ? 'Template saved.' : 'Template added.',
    values: id ? echo(data, (name) => TEMPLATE_FIELDS.includes(name as (typeof TEMPLATE_FIELDS)[number])) : {},
  };
}

export async function deleteTemplateAction(data: FormData): Promise<void> {
  const result = await api(`/social/templates/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/templates');
  revalidatePath('/app/templates');
  revalidatePath('/app/compose');
}

/** Puts a tag on a post already on the calendar, or takes it off (an empty choice). */
export async function setPostTagAction(data: FormData): Promise<void> {
  const result = await api(`/social/posts/${encodeURIComponent(field(data, 'id'))}/tag`, {
    method: 'PATCH',
    workspace: true,
    body: { tagId: field(data, 'tagId') || null },
  });
  if (!result.ok && result.problem.status === 401) expired('/app/calendar');
  revalidatePath('/app/calendar');
  revalidatePath('/app/templates');
}

/** Pauses or resumes a recurring post. */
export async function pauseScheduleAction(data: FormData): Promise<void> {
  const result = await api(`/social/schedules/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'PATCH',
    workspace: true,
    body: { paused: field(data, 'paused') === 'true' },
  });
  if (!result.ok && result.problem.status === 401) expired('/app/recurring');
  revalidatePath('/app/recurring');
}

/** Removes a recurring rule. Posts it already made stay on the calendar. */
export async function removeScheduleAction(data: FormData): Promise<void> {
  const result = await api(`/social/schedules/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/recurring');
  revalidatePath('/app/recurring');
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
