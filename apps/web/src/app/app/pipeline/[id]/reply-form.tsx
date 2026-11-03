'use client';

import { useActionState } from 'react';
import { replyAction } from '@/app/actions/sales';
import { FormMessages, SubmitButton, TextAreaField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function ReplyForm({ id }: { id: string }) {
  const [state, action] = useActionState(replyAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="id" value={id} />
      <TextAreaField
        label="Your reply"
        name="body"
        rows={6}
        defaultValue={state.values?.body}
        error={state.fields?.body}
        hint="Sent from your mailbox as you, with your Sales Manager's signature."
      />
      <SubmitButton pendingLabel="Queueing…">Send reply</SubmitButton>
    </form>
  );
}
