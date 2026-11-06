'use client';

import { useActionState } from 'react';
import { connectLoginAction } from '@/app/actions/social';
import { FormMessages, PasswordField, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export interface LoginField {
  name: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  hint: string;
}

/**
 * For a network with no sign-in page: the boxes it needs, each with where to find the value. Secret boxes use the
 * show/hide field and are never filled in again after a failed attempt.
 */
export function ConnectLoginForm({ network, fields }: { network: string; fields: LoginField[] }) {
  const [state, action] = useActionState(connectLoginAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="network" value={network} />
      {fields.map((box) =>
        box.secret ? (
          <PasswordField
            key={box.name}
            label={box.label}
            name={`secret.${box.name}`}
            placeholder={box.placeholder}
            hint={box.hint}
            autoComplete="off"
          />
        ) : (
          <TextField
            key={box.name}
            label={box.label}
            name={`plain.${box.name}`}
            placeholder={box.placeholder}
            hint={box.hint}
            defaultValue={state.values?.[`plain.${box.name}`] ?? ''}
            autoComplete="off"
          />
        ),
      )}
      <SubmitButton pendingLabel="Checking…">Connect</SubmitButton>
    </form>
  );
}
