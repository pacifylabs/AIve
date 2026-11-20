'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Problem } from '@ai-staff/contracts';
import { api } from '@/lib/api';
import { echo, field, type FormState, fromProblem } from '@/lib/form-state';
import { approvedPayload } from '@/lib/review';

/** An expired access token inside an action: refresh, then come back to the page the form was on. */
function expired(returnTo: string): never {
  redirect(`/session/refresh?next=${encodeURIComponent(returnTo)}`);
}

/** A failed submit: the API's messages plus what the person typed, so the reset form can show it again. */
const failed = (problem: Problem, data: FormData, names: readonly string[]): FormState => ({
  ...fromProblem(problem),
  values: echo(data, (name) => names.includes(name)),
});

const PAYLOAD_FIELD = 'payload.';

/** The payload the person approved: their text, their time, and for a plan only the ideas they kept. */
function decided(data: FormData) {
  let original: Record<string, unknown> = {};
  try {
    original = JSON.parse(field(data, 'original')) as Record<string, unknown>;
  } catch {
    original = {};
  }
  return approvedPayload(original, data.entries(), field(data, 'timeZone') || 'UTC');
}

export async function approveAction(_state: FormState, data: FormData): Promise<FormState> {
  const decision = decided(data);
  const keepTyped = (name: string) => name.startsWith(PAYLOAD_FIELD) || name === 'scheduledLocal';
  if (!decision.ok) {
    return { error: decision.message, fields: { [decision.field]: decision.message }, values: echo(data, keepTyped) };
  }
  const id = encodeURIComponent(field(data, 'id'));
  const result = await api(`/inbox/${id}/approve`, {
    method: 'POST',
    workspace: true,
    body: { payload: decision.payload },
  });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/inbox');
    return { ...fromProblem(result.problem), values: echo(data, keepTyped) };
  }
  revalidatePath('/app/inbox');
  revalidatePath('/app');
  // Move on: the page opens the next item and says what happened to this one.
  redirect(`/app/inbox?done=${decision.payload.items ? 'plan' : 'approved'}`);
}

export async function rejectAction(_state: FormState, data: FormData): Promise<FormState> {
  const id = encodeURIComponent(field(data, 'id'));
  const result = await api(`/inbox/${id}/reject`, {
    method: 'POST',
    workspace: true,
    body: { reason: field(data, 'reason') },
  });
  if (!result.ok)
    return result.problem.status === 401 ? expired('/app/inbox') : failed(result.problem, data, ['reason']);
  revalidatePath('/app/inbox');
  revalidatePath('/app');
  redirect(`/app/inbox?done=${field(data, 'closing') ? 'closed' : 'rejected'}`);
}

const optional = (value: string) => (value.trim() ? value : null);
const PROFILE_FIELDS = ['website', 'summary', 'voice', 'audience', 'escalationEmail'] as const;

export async function updateCompanyAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/company', {
    method: 'PATCH',
    workspace: true,
    // Only the boxes this form has: a field it leaves out must not be wiped (the website has its own form).
    body: Object.fromEntries(
      PROFILE_FIELDS.filter((name) => data.has(name)).map((name) => [name, optional(field(data, name))]),
    ),
  });
  if (!result.ok)
    return result.problem.status === 401 ? expired('/app/company') : failed(result.problem, data, PROFILE_FIELDS);
  revalidatePath('/app/company');
  revalidatePath('/app/welcome');
  return { notice: 'Saved.' };
}

export async function addFactAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/company/facts', {
    method: 'POST',
    workspace: true,
    body: { kind: field(data, 'kind'), text: field(data, 'text') },
  });
  if (!result.ok)
    return result.problem.status === 401 ? expired('/app/company') : failed(result.problem, data, ['kind', 'text']);
  revalidatePath('/app/company');
  revalidatePath('/app/welcome');
  return { notice: 'Added. Your staff will use it from now on.' };
}

export async function updateFactAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api(`/company/facts/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'PATCH',
    workspace: true,
    body: { text: field(data, 'text') },
  });
  if (!result.ok)
    return result.problem.status === 401 ? expired('/app/company') : failed(result.problem, data, ['text']);
  revalidatePath('/app/company');
  revalidatePath('/app/welcome');
  return { notice: 'Updated. Drafts that used the old wording were withdrawn.' };
}

export async function confirmFactAction(data: FormData): Promise<void> {
  const result = await api(`/company/facts/${encodeURIComponent(field(data, 'id'))}/confirm`, {
    method: 'POST',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/company');
  revalidatePath('/app/company');
  revalidatePath('/app/welcome');
}

export async function removeFactAction(data: FormData): Promise<void> {
  const result = await api(`/company/facts/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/company');
  revalidatePath('/app/company');
  revalidatePath('/app/welcome');
}

/** Saves the website and starts reading it in one step, so the person never has to save a form first. */
export async function readWebsiteAction(_state: FormState, data: FormData): Promise<FormState> {
  const website = field(data, 'website').trim();
  if (!website) return { fields: { website: 'Enter your website, like company.com' }, values: { website } };
  const saved = await api('/company', { method: 'PATCH', workspace: true, body: { website } });
  if (!saved.ok) {
    if (saved.problem.status === 401) expired('/app/company');
    return { ...fromProblem(saved.problem), values: { website } };
  }
  const result = await api('/company/prefill', { method: 'POST', workspace: true });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/company');
    return { ...fromProblem(result.problem), values: { website } };
  }
  revalidatePath('/app/company');
  revalidatePath('/app/welcome');
  return { notice: 'Reading your website. Suggestions appear below for you to confirm.' };
}

// ---- Autopilot ---------------------------------------------------------------------------------------------

const AUTOPILOT_FIELDS = ['mode', 'approvals', 'windowDays', 'editPercent', 'maxPerDay'] as const;

const autopilotPath = (data: FormData) =>
  `/staff/${encodeURIComponent(field(data, 'staffId'))}/autopilot/${encodeURIComponent(field(data, 'taskType'))}`;

/** A blank box means "use the default", so it is left out of the rules rather than sent as zero. */
function numberField(data: FormData, name: string): number | undefined {
  const text = field(data, name).trim();
  return text === '' ? undefined : Number(text);
}

export async function saveAutopilotAction(_state: FormState, data: FormData): Promise<FormState> {
  const percent = numberField(data, 'editPercent');
  const rules = {
    approvals: numberField(data, 'approvals'),
    windowDays: numberField(data, 'windowDays'),
    maxMedianEditRatio: percent === undefined ? undefined : percent / 100,
    maxPerDay: numberField(data, 'maxPerDay'),
  };
  const result = await api(autopilotPath(data), {
    method: 'PUT',
    workspace: true,
    body: { mode: field(data, 'mode'), rules },
  });
  if (!result.ok) {
    return result.problem.status === 401 ? expired('/app/autopilot') : failed(result.problem, data, AUTOPILOT_FIELDS);
  }
  revalidatePath('/app/autopilot');
  return { notice: 'Saved.' };
}

export async function enableAutopilotAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api(`${autopilotPath(data)}/enable`, {
    method: 'POST',
    workspace: true,
    body: { confirm: field(data, 'confirm') === 'yes' },
  });
  if (!result.ok) {
    return result.problem.status === 401 ? expired('/app/autopilot') : failed(result.problem, data, []);
  }
  revalidatePath('/app/autopilot');
  revalidatePath('/app/inbox');
  return { notice: 'Autopilot is on.' };
}

/** "Plan next week now": starts the social staff member's weekly plan instead of waiting for Friday. */
export async function planWeekNowAction(_state: FormState, data: FormData): Promise<FormState> {
  const staffId = field(data, 'staffId');
  const result = await api<{ queued: boolean }>(
    `/staff/${encodeURIComponent(staffId)}/tasks/social_media.plan_week/run`,
    // A fresh id per press; the button is disabled while a press is in flight, so a double click sends one.
    { method: 'POST', workspace: true, body: { requestId: crypto.randomUUID() } },
  );
  if (!result.ok) return result.problem.status === 401 ? expired('/app') : fromProblem(result.problem);
  revalidatePath('/app');
  revalidatePath(`/app/staff/${staffId}`);
  return { notice: 'Planning started. The plan arrives in Review work in a minute or two.' };
}

export async function stopAutopilotAction(data: FormData): Promise<void> {
  const result = await api(`${autopilotPath(data)}/stop`, { method: 'POST', workspace: true });
  if (!result.ok && result.problem.status === 401) expired('/app/autopilot');
  revalidatePath('/app/autopilot');
}

export async function decideOfferAction(data: FormData): Promise<void> {
  const result = await api(`/promotions/${encodeURIComponent(field(data, 'offerId'))}`, {
    method: 'POST',
    workspace: true,
    body: { accept: field(data, 'accept') === 'yes' },
  });
  if (!result.ok && result.problem.status === 401) expired('/app/autopilot');
  revalidatePath('/app/autopilot');
}

/** Pauses a staff member (nothing new starts; work waiting for you stays) or puts them back to work. */
export async function setStaffStateAction(data: FormData): Promise<void> {
  const staffId = field(data, 'staffId');
  const state = field(data, 'state') === 'paused' ? 'paused' : 'active';
  const back = `/app/staff/${staffId}`;
  const result = await api(`/staff/${encodeURIComponent(staffId)}`, {
    method: 'PATCH',
    workspace: true,
    body: state === 'paused' ? { state, pausedReason: 'Paused by you' } : { state },
  });
  if (!result.ok && result.problem.status === 401) expired(back);
  revalidatePath(back);
  revalidatePath('/app/staff');
}
