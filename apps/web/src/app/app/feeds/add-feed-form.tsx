'use client';

import { useActionState } from 'react';
import { addFeedAction } from '@/app/actions/social';
import { FormMessages, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function AddFeedForm({ accounts }: { accounts: { id: string; name: string; network: string }[] }) {
  const [state, action] = useActionState(addFeedAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField
        label="Feed address"
        name="url"
        type="url"
        inputMode="url"
        placeholder="https://yourcompany.com/blog/feed.xml"
        hint="An RSS or Atom address. Most blogs have one at /feed or /rss.xml."
        defaultValue={state.values?.url ?? ''}
        error={state.fields?.url}
        required
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Post about new articles on</legend>
        {accounts.map((account) => (
          <label key={account.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="accountId" value={account.id} defaultChecked={accounts.length === 1} />
            <span>
              {account.name} <span className="text-muted">· {account.network}</span>
            </span>
          </label>
        ))}
        {state.fields?.accountIds ? <p className="text-xs text-danger">{state.fields.accountIds}</p> : null}
      </fieldset>
      <TextField
        label="Note for your staff member (optional)"
        name="note"
        placeholder="Only the how-to articles"
        defaultValue={state.values?.note ?? ''}
        error={state.fields?.note}
      />
      <SubmitButton pendingLabel="Checking the feed…">Add feed</SubmitButton>
    </form>
  );
}
