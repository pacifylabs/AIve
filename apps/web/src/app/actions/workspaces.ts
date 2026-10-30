'use server';

import type { InvitationResponse, WorkspaceResponse } from '@ai-staff/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { field, type FormState, fromProblem } from '@/lib/form-state';
import { chooseWorkspace } from '@/lib/session';

/** An expired access token inside an action: refresh, then come back to the page the form was on. */
function expired(returnTo: string): never {
  redirect(`/session/refresh?next=${encodeURIComponent(returnTo)}`);
}

export async function createWorkspaceAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api<WorkspaceResponse>('/workspaces', {
    method: 'POST',
    auth: true,
    body: { name: field(data, 'name'), timezone: field(data, 'timezone') || 'UTC' },
  });
  if (!result.ok) return result.problem.status === 401 ? expired('/app') : fromProblem(result.problem);
  await chooseWorkspace(result.data.id);
  redirect('/app');
}

export async function switchWorkspaceAction(data: FormData): Promise<void> {
  await chooseWorkspace(field(data, 'workspaceId'));
  redirect('/app');
}

export async function updateWorkspaceAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api<WorkspaceResponse>('/workspace', {
    method: 'PATCH',
    workspace: true,
    body: { name: field(data, 'name'), timezone: field(data, 'timezone') },
  });
  if (!result.ok) return result.problem.status === 401 ? expired('/app/settings') : fromProblem(result.problem);
  revalidatePath('/app', 'layout');
  return { notice: 'Saved.' };
}

export async function inviteAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api<InvitationResponse>('/workspace/invitations', {
    method: 'POST',
    workspace: true,
    body: { email: field(data, 'email'), role: field(data, 'role') },
  });
  if (!result.ok) return result.problem.status === 401 ? expired('/app/settings') : fromProblem(result.problem);
  revalidatePath('/app/settings');
  return { notice: `Invitation sent to ${result.data.email}.` };
}

export async function revokeInvitationAction(data: FormData): Promise<void> {
  const result = await api(`/workspace/invitations/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/settings');
  revalidatePath('/app/settings');
}

export async function acceptInvitationAction(_state: FormState, data: FormData): Promise<FormState> {
  const token = field(data, 'token');
  const result = await api<WorkspaceResponse>('/invitations/accept', { method: 'POST', auth: true, body: { token } });
  if (!result.ok)
    return result.problem.status === 401
      ? expired(`/invitations/accept?token=${encodeURIComponent(token)}`)
      : fromProblem(result.problem);
  await chooseWorkspace(result.data.id);
  redirect('/app');
}
