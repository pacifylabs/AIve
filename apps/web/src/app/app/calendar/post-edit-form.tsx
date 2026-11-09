'use client';

import { useActionState } from 'react';
import { editPostAction } from '@/app/actions/social';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

/** Change the words or the time of a post that has not gone out. */
export function PostEditForm({ id, body, updatedAt }: { id: string; body: string; updatedAt: string }) {
  const [state, action] = useActionState(editPostAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <TextAreaField
        label="Words"
        name="body"
        rows={4}
        defaultValue={state.values?.body ?? body}
        error={state.fields?.body}
      />
      <TextField
        label="Move to (optional)"
        name="scheduledLocal"
        type="datetime-local"
        error={state.fields?.scheduledLocal}
        hint="In your workspace's time zone."
      />
      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  );
}
