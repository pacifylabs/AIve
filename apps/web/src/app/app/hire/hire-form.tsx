'use client';

import { useActionState } from 'react';
import { hireSalesManagerAction } from '@/app/actions/sales';
import { SelectField, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { SetupLink, WithDraft } from '@/components/form-draft';
import { StepForm } from '@/components/step-form';
import { type Draft, firstValue } from '@/lib/form-draft';
import { initialFormState } from '@/lib/form-state';

export interface MailboxOption {
  id: string;
  address: string;
  status: string;
}

interface Props {
  mailboxes: MailboxOption[];
  questions: Record<string, string>;
}

/** The hiring interview from docs/roles/SALES-MANAGER-STAFF.md: five questions, plus a name and a mailbox, in steps. */
export function HireForm(props: Props) {
  return <WithDraft name="hire:sales_manager">{(draft) => <HireSteps {...props} draft={draft} />}</WithDraft>;
}

function HireSteps({ mailboxes, questions, draft }: Props & { draft: Draft | null }) {
  const [state, action] = useActionState(hireSalesManagerAction, initialFormState);
  const f = state.fields ?? {};
  const pick = (name: string, fallback = '') => state.values?.[name] ?? firstValue(draft?.values, name) ?? fallback;

  return (
    <StepForm
      action={action}
      state={state}
      submit={<SubmitButton pendingLabel="Hiring…">Hire</SubmitButton>}
      steps={[
        {
          title: 'Name and mailbox',
          content: (
            <>
              <TextField
                label="Their name"
                name="displayName"
                defaultValue={pick('displayName', 'Dee')}
                error={f.displayName}
                hint="They tell people they are an AI assistant. This is the name they use."
                required
              />
              <TextAreaField
                label="Signature"
                name="signature"
                rows={2}
                defaultValue={pick('signature')}
                error={f.signature}
                hint="Added under every email, for example: Dee, AI sales assistant at Your Company."
              />
              <SelectField
                label="Send from"
                name="mailboxId"
                defaultValue={pick('mailboxId')}
                error={f['settings.mailboxId']}
                required
              >
                <option value="">Choose a mailbox…</option>
                {mailboxes.map((mailbox) => (
                  <option key={mailbox.id} value={mailbox.id}>
                    {mailbox.address} ({mailbox.status})
                  </option>
                ))}
              </SelectField>
              <p className={mailboxes.length ? 'text-xs text-muted' : 'card-flat px-3 py-2 text-sm'}>
                {mailboxes.length ? 'Want another address? ' : 'No mailbox is connected yet. '}
                <SetupLink href="/app/mailboxes" label="Hire form">
                  Connect a mailbox
                </SetupLink>
                . Your answers here are kept until you come back.
              </p>
            </>
          ),
        },
        {
          title: 'Customer',
          content: (
            <>
              <TextAreaField
                label={questions.idealCustomer ?? 'Who is your ideal customer?'}
                name="idealCustomer"
                rows={3}
                defaultValue={pick('idealCustomer')}
                error={f['settings.idealCustomer']}
              />
              <TextAreaField
                label={questions.problem ?? 'What problem do you solve for them?'}
                name="problem"
                rows={3}
                defaultValue={pick('problem')}
                error={f['settings.problem']}
              />
            </>
          ),
        },
        {
          title: 'Limits',
          content: (
            <>
              <TextAreaField
                label={questions.offer ?? 'What may this staff member offer without asking you?'}
                name="offer"
                rows={2}
                defaultValue={pick('offer')}
                error={f.text}
                hint="Leave empty to offer nothing. Whatever you write is saved as a company offer they may quote."
              />
              <TextAreaField
                label={questions.escalateWhen ?? 'What must always come to you?'}
                name="escalateWhen"
                rows={2}
                defaultValue={pick('escalateWhen')}
                error={f['settings.escalateWhen']}
                hint="Discounts, contracts, legal questions, upset people and anyone who asks for a person always come to you."
              />
              <TextField
                label={questions.ctaUrl ?? 'Where should interested people go?'}
                name="ctaUrl"
                inputMode="url"
                defaultValue={pick('ctaUrl')}
                error={f['settings.cta.url']}
                placeholder="https://cal.com/you"
                hint="A booking link or a page on your own website. Leave empty to ask them to reply."
              />
              <p className="text-sm text-muted">
                Every email they write waits in your inbox for approval until you decide to let them send on their own.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
