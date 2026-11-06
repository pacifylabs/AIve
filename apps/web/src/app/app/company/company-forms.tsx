'use client';

import { useActionState, useState } from 'react';
import { addFactAction, prefillAction, updateCompanyAction, updateFactAction } from '@/app/actions/platform';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';
import { FACT_KINDS } from './fact-kinds';

export interface Profile {
  website: string | null;
  summary: string | null;
  voice: string | null;
  audience: string | null;
  escalationEmail: string | null;
  prefillState: 'none' | 'queued' | 'running' | 'done' | 'failed';
  prefillError: string | null;
}

export function ProfileForm({ profile, canEdit }: { profile: Profile; canEdit: boolean }) {
  const [state, action] = useActionState(updateCompanyAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <fieldset disabled={!canEdit} className="space-y-4">
        <TextField
          label="Website"
          name="website"
          defaultValue={state.values?.website ?? profile.website ?? ''}
          inputMode="url"
          placeholder="company.com"
          error={state.fields?.website}
        />
        <TextAreaField
          label="What the company does"
          name="summary"
          defaultValue={state.values?.summary ?? profile.summary ?? ''}
          error={state.fields?.summary}
        />
        <TextAreaField
          label="How you sound"
          name="voice"
          rows={2}
          defaultValue={state.values?.voice ?? profile.voice ?? ''}
          hint="For example: plain and friendly, no jargon."
          error={state.fields?.voice}
        />
        <TextAreaField
          label="Who you sell to"
          name="audience"
          rows={2}
          defaultValue={state.values?.audience ?? profile.audience ?? ''}
          error={state.fields?.audience}
        />
        <TextField
          label="Escalation email"
          name="escalationEmail"
          type="email"
          defaultValue={state.values?.escalationEmail ?? profile.escalationEmail ?? ''}
          hint="Where staff send anything they hand to a person."
          error={state.fields?.escalationEmail}
        />
      </fieldset>
      {canEdit ? <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton> : null}
    </form>
  );
}

const PREFILL_STATUS: Record<Profile['prefillState'], string> = {
  none: '',
  queued: 'Waiting to read your website…',
  running: 'Reading your website…',
  done: 'Done. Check the suggestions marked "From your website" below.',
  failed: 'Could not read your website.',
};

export function PrefillButton({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(prefillAction, initialFormState);
  const busy = profile.prefillState === 'queued' || profile.prefillState === 'running';
  return (
    <form action={action} className="space-y-2" noValidate>
      <FormMessages state={state} />
      <p className="text-sm text-muted" role="status">
        {PREFILL_STATUS[profile.prefillState]}
        {profile.prefillState === 'failed' && profile.prefillError ? ` ${profile.prefillError}` : ''}
      </p>
      {!busy ? (
        <SubmitButton pendingLabel="Starting…">
          {profile.prefillState === 'done' ? 'Read the website again' : 'Fill this in from my website'}
        </SubmitButton>
      ) : null}
    </form>
  );
}

export function AddFactForm() {
  const [state, action] = useActionState(addFactAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <div className="space-y-1">
        <label htmlFor="fact-kind" className="block text-sm font-medium">
          Kind
        </label>
        <select id="fact-kind" name="kind" defaultValue={state.values?.kind ?? 'offering'} className="field">
          {FACT_KINDS.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
      <TextAreaField
        label="Fact"
        name="text"
        rows={2}
        required
        defaultValue={state.values?.text}
        error={state.fields?.text}
      />
      <SubmitButton pendingLabel="Adding…">Add fact</SubmitButton>
    </form>
  );
}

export function EditFactForm({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateFactAction, initialFormState);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-accent hover:underline">
        Edit
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 w-full space-y-2" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="id" value={id} />
      <TextAreaField
        label="Fact"
        name="text"
        rows={2}
        defaultValue={state.values?.text ?? text}
        error={state.fields?.text}
      />
      <div className="flex gap-3">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-sm hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
