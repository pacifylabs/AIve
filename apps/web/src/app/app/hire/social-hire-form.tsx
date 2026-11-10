'use client';

import { useActionState } from 'react';
import { hireSocialAction } from '@/app/actions/social';
import { SubmitButton, TextAreaField, TextField } from '@/components/form';
import { SetupLink, WithDraft } from '@/components/form-draft';
import { StepForm } from '@/components/step-form';
import { type Draft, firstValue } from '@/lib/form-draft';
import { initialFormState } from '@/lib/form-state';

export interface AccountOption {
  id: string;
  name: string;
  network: string;
  health: string;
}

interface Props {
  accounts: AccountOption[];
  questions: Record<string, string>;
}

/** The hiring interview from docs/roles/SOCIAL-MEDIA-STAFF.md, plus a name and the accounts to post to, in steps. */
export function SocialHireForm(props: Props) {
  return <WithDraft name="hire:social_media">{(draft) => <SocialHireSteps {...props} draft={draft} />}</WithDraft>;
}

function SocialHireSteps({ accounts, questions, draft }: Props & { draft: Draft | null }) {
  const [state, action] = useActionState(hireSocialAction, initialFormState);
  const f = state.fields ?? {};
  const pick = (name: string, fallback = '') => state.values?.[name] ?? firstValue(draft?.values, name) ?? fallback;
  const chosen = draft?.values.accountId ?? [];
  const usable = accounts.filter((account) => account.health === 'ok');

  return (
    <StepForm
      action={action}
      state={state}
      submit={<SubmitButton pendingLabel="Hiring…">Hire</SubmitButton>}
      steps={[
        {
          title: 'Name and accounts',
          check: (form) =>
            form.querySelector('input[name="accountId"]:checked') ? null : 'Pick at least one account they post to.',
          content: (
            <>
              <TextField
                label="Their name"
                name="displayName"
                defaultValue={pick('displayName', 'Sam')}
                error={f.displayName}
                required
              />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Post to</legend>
                {accounts.map((account) => (
                  <label key={account.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="accountId"
                      value={account.id}
                      disabled={account.health !== 'ok'}
                      defaultChecked={
                        chosen.includes(account.id) || (!draft && usable.length === 1 && account === usable[0])
                      }
                    />
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
                <p className={usable.length ? 'pt-1 text-xs text-muted' : 'card-flat px-3 py-2 text-sm'}>
                  {usable.length ? 'Missing one? ' : 'No account is connected yet. '}
                  <SetupLink href="/app/accounts" label="Hire form">
                    Connect an account
                  </SetupLink>
                  . Your answers here are kept until you come back.
                </p>
              </fieldset>
            </>
          ),
        },
        {
          title: 'Goal and topics',
          content: (
            <>
              <TextAreaField
                label={questions.goal ?? 'What should people do after seeing your posts?'}
                name="goal"
                rows={2}
                defaultValue={pick('goal')}
                error={f['settings.goal']}
              />
              <TextAreaField
                label={questions.pillars ?? 'Pick 3–5 topics you want to be known for.'}
                name="pillars"
                rows={4}
                defaultValue={pick('pillars')}
                error={f['settings.pillars']}
                hint="One topic per line."
              />
            </>
          ),
        },
        {
          title: 'Style',
          content: (
            <>
              <TextAreaField
                label={questions.styleExamples ?? 'Paste 2–3 posts you liked.'}
                name="styleExamples"
                rows={8}
                defaultValue={pick('styleExamples')}
                error={f['settings.styleExamples']}
                hint="Put a line with --- between posts. They show the style to aim for and are never copied."
              />
              <TextAreaField
                label={questions.neverPost ?? 'Anything you never post about?'}
                name="neverPost"
                rows={2}
                defaultValue={pick('neverPost')}
                error={f['settings.neverPost']}
              />
            </>
          ),
        },
        {
          title: 'How often',
          content: (
            <>
              <TextField
                label={questions.cadence ?? 'How often per network?'}
                name="cadence"
                type="number"
                min={1}
                max={14}
                inputMode="numeric"
                defaultValue={pick('cadence', '3')}
                error={f['settings.cadence']}
                hint="Posts per week, for each account."
              />
              <p className="text-sm text-muted">
                Every post waits in your inbox for approval until you decide to let them publish on their own.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
