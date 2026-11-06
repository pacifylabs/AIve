'use client';

import { useActionState } from 'react';
import { hireSalesManagerAction } from '@/app/actions/sales';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export interface MailboxOption {
  id: string;
  address: string;
  status: string;
}

/** The hiring interview from docs/roles/SALES-MANAGER-STAFF.md: five questions, plus a name and a mailbox. */
export function HireForm({ mailboxes, questions }: { mailboxes: MailboxOption[]; questions: Record<string, string> }) {
  const [state, action] = useActionState(hireSalesManagerAction, initialFormState);
  const v = state.values ?? {};
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField
        label="Their name"
        name="displayName"
        defaultValue={v.displayName ?? 'Dee'}
        error={f.displayName}
        hint="They tell people they are an AI assistant. This is the name they use."
      />
      <TextAreaField
        label="Signature"
        name="signature"
        rows={2}
        defaultValue={v.signature}
        error={f.signature}
        hint="Added under every email, for example: Dee, AI sales assistant at Your Company."
      />
      <div className="space-y-1">
        <label htmlFor="hire-mailbox" className="block text-sm font-medium">
          Send from
        </label>
        <select id="hire-mailbox" name="mailboxId" defaultValue={v.mailboxId ?? ''} className="field">
          <option value="">Choose a mailbox…</option>
          {mailboxes.map((mailbox) => (
            <option key={mailbox.id} value={mailbox.id}>
              {mailbox.address} ({mailbox.status})
            </option>
          ))}
        </select>
        {f['settings.mailboxId'] ? <p className="text-xs text-danger">{f['settings.mailboxId']}</p> : null}
      </div>
      <TextAreaField
        label={questions.idealCustomer ?? 'Who is your ideal customer?'}
        name="idealCustomer"
        rows={2}
        defaultValue={v.idealCustomer}
        error={f['settings.idealCustomer']}
      />
      <TextAreaField
        label={questions.problem ?? 'What problem do you solve for them?'}
        name="problem"
        rows={2}
        defaultValue={v.problem}
        error={f['settings.problem']}
      />
      <TextAreaField
        label={questions.offer ?? 'What may this staff member offer without asking you?'}
        name="offer"
        rows={2}
        defaultValue={v.offer}
        error={f.text}
        hint="Leave empty to offer nothing. Whatever you write is saved as a company offer they may quote."
      />
      <TextAreaField
        label={questions.escalateWhen ?? 'What must always come to you?'}
        name="escalateWhen"
        rows={2}
        defaultValue={v.escalateWhen}
        error={f['settings.escalateWhen']}
        hint="Discounts, contracts, legal questions, upset people and anyone who asks for a person always come to you."
      />
      <TextField
        label={questions.ctaUrl ?? 'Where should interested people go?'}
        name="ctaUrl"
        inputMode="url"
        defaultValue={v.ctaUrl}
        error={f['settings.cta.url']}
        placeholder="https://cal.com/you"
        hint="A booking link or a page on your own website. Leave empty to ask them to reply."
      />
      <p className="text-sm text-muted">
        Every email they write waits in your inbox for approval until you decide to let them send on their own.
      </p>
      <SubmitButton pendingLabel="Hiring…">Hire</SubmitButton>
    </form>
  );
}
