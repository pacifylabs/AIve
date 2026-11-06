'use client';

import { useActionState } from 'react';
import { composePostAction } from '@/app/actions/social';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function ComposeForm({
  requestId,
  accounts,
}: {
  requestId: string;
  accounts: { id: string; name: string; network: string }[];
}) {
  const [state, action] = useActionState(composePostAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Post to</legend>
        {accounts.map((account) => (
          <label key={account.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="accountId" value={account.id} defaultChecked={accounts.length === 1} />
            <span>
              {account.name} <span className="text-muted">· {account.network}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <TextAreaField
        label="What do you want to say?"
        name="body"
        rows={6}
        defaultValue={state.values?.body ?? ''}
        error={state.fields?.body}
        hint="Checked against each network's length limit when you post. Sign-offs are not added to posts you write yourself."
        required
      />
      <TextAreaField
        label="Pictures or a video (optional)"
        name="mediaUrls"
        rows={2}
        defaultValue={state.values?.mediaUrls ?? ''}
        error={state.fields?.mediaUrls}
        hint="One public https address per line. Instagram needs a picture or video; TikTok needs a video."
      />
      <TextField
        label="Link (optional)"
        name="linkUrl"
        type="url"
        inputMode="url"
        placeholder="https://yourcompany.com/offer"
        defaultValue={state.values?.linkUrl ?? ''}
        error={state.fields?.linkUrl}
      />
      <TextField
        label="First comment (optional)"
        name="firstComment"
        defaultValue={state.values?.firstComment ?? ''}
        error={state.fields?.firstComment}
      />
      <TextField
        label="Send at (optional)"
        name="scheduledLocal"
        type="datetime-local"
        defaultValue={state.values?.scheduledLocal ?? ''}
        error={state.fields?.scheduledLocal}
        hint="In your workspace's time zone. Leave empty to post right away."
      />
      <SubmitButton pendingLabel="Posting…">Post</SubmitButton>
    </form>
  );
}
