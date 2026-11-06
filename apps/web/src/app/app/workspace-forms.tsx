'use client';

import { useActionState } from 'react';
import { createWorkspaceAction, inviteAction, updateWorkspaceAction } from '@/app/actions/workspaces';
import { FormMessages, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function CreateWorkspaceForm() {
  const [state, action] = useActionState(createWorkspaceAction, initialFormState);
  const timezone = typeof Intl === 'undefined' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField label="Business name" name="name" required error={state.fields?.name} />
      <TextField
        label="Time zone"
        name="timezone"
        defaultValue={timezone}
        required
        hint="Schedules and reports use this."
        error={state.fields?.timezone}
      />
      <SubmitButton pendingLabel="Creating…">Create workspace</SubmitButton>
    </form>
  );
}

export function WorkspaceSettingsForm({ name, timezone }: { name: string; timezone: string }) {
  const [state, action] = useActionState(updateWorkspaceAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField label="Business name" name="name" defaultValue={name} required error={state.fields?.name} />
      <TextField label="Time zone" name="timezone" defaultValue={timezone} required error={state.fields?.timezone} />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

export function InviteForm() {
  const [state, action] = useActionState(inviteAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField label="Email" name="email" type="email" required error={state.fields?.email} />
      <div className="space-y-1">
        <label htmlFor="invite-role" className="block text-sm font-medium">
          Role
        </label>
        <select id="invite-role" name="role" defaultValue="member" className="field">
          <option value="member">Member: approves and edits work</option>
          <option value="admin">Admin: also manages settings and the team</option>
        </select>
      </div>
      <SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>
    </form>
  );
}
