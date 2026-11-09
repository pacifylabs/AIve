'use client';

import { useActionState } from 'react';
import { addMentionAction } from '@/app/actions/social';
import { FormMessages, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

/** Saves an account the staff member may tag in posts for one network. */
export function MentionForm({ networks }: { networks: { network: string; label: string }[] }) {
  const [state, action] = useActionState(addMentionAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <label className="block space-y-1 text-sm font-medium">
        Network
        <select name="network" className="field font-normal" defaultValue={networks[0]?.network}>
          {networks.map((network) => (
            <option key={network.network} value={network.network}>
              {network.label}
            </option>
          ))}
        </select>
      </label>
      <TextField
        label="Account name"
        name="handle"
        placeholder="@northfielddesign"
        defaultValue={state.values?.handle ?? ''}
        error={state.fields?.handle}
        hint="Checked with the network where it allows, using one of your connected accounts there."
        required
      />
      <SubmitButton pendingLabel="Checking…">Save account</SubmitButton>
    </form>
  );
}
