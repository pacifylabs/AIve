'use client';

import { useActionState } from 'react';
import { selectAccountsAction } from '@/app/actions/social';
import { FormMessages, SubmitButton } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

/** After signing in at the network: choose which of the accounts it found we may post to. */
export function PickAccountsForm({
  pending,
  accounts,
}: {
  pending: string;
  accounts: { externalId: string; name: string; username?: string | null }[];
}) {
  const [state, action] = useActionState(selectAccountsAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="pending" value={pending} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Which accounts should your staff post to?</legend>
        {accounts.map((account) => (
          <label key={account.externalId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="externalId"
              value={account.externalId}
              defaultChecked={accounts.length === 1}
            />
            <span>
              {account.name}
              {account.username ? <span className="text-muted"> @{account.username}</span> : null}
            </span>
          </label>
        ))}
        {state.fields?.externalIds ? <p className="text-xs text-danger">{state.fields.externalIds}</p> : null}
      </fieldset>
      <SubmitButton pendingLabel="Saving…">Connect these accounts</SubmitButton>
    </form>
  );
}
