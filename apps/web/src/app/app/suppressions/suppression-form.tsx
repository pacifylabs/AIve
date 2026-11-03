'use client';

import { useActionState } from 'react';
import { addSuppressionAction } from '@/app/actions/sales';
import { FormMessages, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function AddSuppressionForm() {
  const [state, action] = useActionState(addSuppressionAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <TextField
        label="Address or domain"
        name="value"
        defaultValue={state.values?.value}
        error={state.fields?.value}
        placeholder="someone@company.com or @company.com"
      />
      <TextField label="Note" name="note" defaultValue={state.values?.note} error={state.fields?.note} />
      <SubmitButton pendingLabel="Adding…">Never contact</SubmitButton>
    </form>
  );
}
