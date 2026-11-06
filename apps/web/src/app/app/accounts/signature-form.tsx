'use client';

import { useActionState } from 'react';
import { saveSignatureAction } from '@/app/actions/social';
import { FormMessages, SubmitButton, TextAreaField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

/** The sign-off added to the end of every post for one account. */
export function SignatureForm({ accountId, current }: { accountId: string; current: string }) {
  const [state, action] = useActionState(saveSignatureAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="accountId" value={accountId} />
      <TextAreaField
        label="Sign-off"
        name="signature"
        rows={3}
        maxLength={300}
        defaultValue={state.values?.signature ?? current}
        error={state.fields?.signature}
        hint="Added to the end of every new post for this account, so it counts toward the length limit. A link in it must be on your own website."
      />
      <SubmitButton pendingLabel="Saving…">Save sign-off</SubmitButton>
    </form>
  );
}
