'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Problem } from '@ai-staff/contracts';
import { api } from '@/lib/api';
import { echo, field, type FormState, fromProblem } from '@/lib/form-state';

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

/**
 * Rebuilds a draft from the form. Text fields arrive as `payload.<key>`; everything else in the original payload
 * (numbers, lists) is carried over unchanged from the hidden copy, so only text a person can see is editable.
 */
function editedPayload(data: FormData): Record<string, unknown> {
  let original: Record<string, unknown> = {};
  try {
    original = JSON.parse(field(data, 'original')) as Record<string, unknown>;
  } catch {
    original = {};
  }
  const edited = { ...original };
  for (const [key, value] of data.entries()) {
    if (key.startsWith(PAYLOAD_FIELD) && typeof value === 'string') edited[key.slice(PAYLOAD_FIELD.length)] = value;
  }
  return edited;
}

export async function approveAction(_state: FormState, data: FormData): Promise<FormState> {
  const id = encodeURIComponent(field(data, 'id'));
  const result = await api(`/inbox/${id}/approve`, {
    method: 'POST',
    workspace: true,
    body: { payload: editedPayload(data) },
  });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/inbox');
    return { ...fromProblem(result.problem), values: echo(data, (name) => name.startsWith(PAYLOAD_FIELD)) };
  }
  revalidatePath('/app/inbox');
  return { notice: 'Approved.' };
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
  return { notice: 'Rejected. Your reason helps it next time.' };
}

const optional = (value: string) => (value.trim() ? value : null);
const PROFILE_FIELDS = ['website', 'summary', 'voice', 'audience', 'escalationEmail'] as const;

export async function updateCompanyAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/company', {
    method: 'PATCH',
    workspace: true,
    body: {
      website: optional(field(data, 'website')),
      summary: optional(field(data, 'summary')),
      voice: optional(field(data, 'voice')),
      audience: optional(field(data, 'audience')),
      escalationEmail: optional(field(data, 'escalationEmail')),
    },
  });
  if (!result.ok)
    return result.problem.status === 401 ? expired('/app/company') : failed(result.problem, data, PROFILE_FIELDS);
  revalidatePath('/app/company');
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
  return { notice: 'Updated. Drafts that used the old wording were withdrawn.' };
}

export async function confirmFactAction(data: FormData): Promise<void> {
  const result = await api(`/company/facts/${encodeURIComponent(field(data, 'id'))}/confirm`, {
    method: 'POST',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/company');
  revalidatePath('/app/company');
}

export async function removeFactAction(data: FormData): Promise<void> {
  const result = await api(`/company/facts/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/company');
  revalidatePath('/app/company');
}

export async function prefillAction(_state: FormState): Promise<FormState> {
  const result = await api('/company/prefill', { method: 'POST', workspace: true });
  if (!result.ok) return result.problem.status === 401 ? expired('/app/company') : fromProblem(result.problem);
  revalidatePath('/app/company');
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
