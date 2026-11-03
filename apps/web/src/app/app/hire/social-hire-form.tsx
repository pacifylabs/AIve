'use client';

import { useActionState } from 'react';
import { hireSocialAction } from '@/app/actions/social';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export interface AccountOption {
  id: string;
  name: string;
  network: string;
  health: string;
}

/** The hiring interview from docs/roles/SOCIAL-MEDIA-STAFF.md, plus a name and the accounts to post to. */
export function SocialHireForm({
  accounts,
  questions,
}: {
  accounts: AccountOption[];
  questions: Record<string, string>;
}) {
  const [state, action] = useActionState(hireSocialAction, initialFormState);
  const v = state.values ?? {};
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField label="Their name" name="displayName" defaultValue={v.displayName ?? 'Sam'} error={f.displayName} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Post to</legend>
        {accounts.map((account) => (
          <label key={account.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="accountId" value={account.id} disabled={account.health !== 'ok'} />
            <span>
              {account.name}{' '}
              <span className="text-muted">
                ({account.network}
                {account.health !== 'ok' ? ', needs reconnecting' : ''})
              </span>
            </span>
          </label>
        ))}
        {f['settings.accountIds'] ? <p className="text-xs text-danger">{f['settings.accountIds']}</p> : null}
      </fieldset>
      <TextAreaField
        label={questions.goal ?? 'What should people do after seeing your posts?'}
        name="goal"
        rows={2}
        defaultValue={v.goal}
        error={f['settings.goal']}
      />
      <TextAreaField
        label={questions.pillars ?? 'Pick 3–5 topics you want to be known for.'}
        name="pillars"
        rows={4}
        defaultValue={v.pillars}
        error={f['settings.pillars']}
        hint="One topic per line."
      />
      <TextAreaField
        label={questions.styleExamples ?? 'Paste 2–3 posts you liked.'}
        name="styleExamples"
        rows={6}
        defaultValue={v.styleExamples}
        error={f['settings.styleExamples']}
        hint="Put a line with --- between posts. They show the style to aim for and are never copied."
      />
      <TextAreaField
        label={questions.neverPost ?? 'Anything you never post about?'}
        name="neverPost"
        rows={2}
        defaultValue={v.neverPost}
        error={f['settings.neverPost']}
      />
      <TextField
        label={questions.cadence ?? 'How often per network?'}
        name="cadence"
        inputMode="numeric"
        defaultValue={v.cadence ?? '3'}
        error={f['settings.cadence']}
        hint="Posts per week, for each account."
      />
      <p className="text-sm text-muted">
        Every post waits in your inbox for approval until you decide to let them publish on their own.
      </p>
      <SubmitButton pendingLabel="Hiring…">Hire</SubmitButton>
    </form>
  );
}
