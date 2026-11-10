'use client';

import { useActionState, useState } from 'react';
import { connectMailboxAction, testMailboxAction } from '@/app/actions/sales';
import { FormMessages, PasswordField, SubmitButton, TextField } from '@/components/form';
import { WithDraft } from '@/components/form-draft';
import { StepForm } from '@/components/step-form';
import { type Draft, firstValue } from '@/lib/form-draft';
import { initialFormState } from '@/lib/form-state';

export function ConnectMailboxForm() {
  return <WithDraft name="mailbox:new">{(draft) => <ConnectMailboxSteps draft={draft} />}</WithDraft>;
}

/** Address, then sending, then replies. Passwords are never kept in the saved draft, so they are typed again. */
function ConnectMailboxSteps({ draft }: { draft: Draft | null }) {
  const [state, action] = useActionState(connectMailboxAction, initialFormState);
  const [imap, setImap] = useState(firstValue(draft?.values, 'inboundMode') === 'imap');
  const f = state.fields ?? {};
  const pick = (name: string, fallback = '') => state.values?.[name] ?? firstValue(draft?.values, name) ?? fallback;
  return (
    <StepForm
      action={action}
      state={state}
      submit={<SubmitButton pendingLabel="Checking the login…">Connect mailbox</SubmitButton>}
      steps={[
        {
          title: 'Address',
          content: (
            <>
              <TextField
                label="Email address"
                name="address"
                type="email"
                defaultValue={pick('address')}
                error={f.address}
                hint="A dedicated address works best, for example sales@yourcompany.com."
                required
              />
              <TextField
                label="Name people see"
                name="displayName"
                defaultValue={pick('displayName')}
                error={f.displayName}
                required
              />
            </>
          ),
        },
        {
          title: 'Sending',
          content: (
            <>
              <TextField
                label="SMTP server"
                name="smtpHost"
                defaultValue={pick('smtpHost')}
                error={f['smtp.host']}
                placeholder="smtp.yourcompany.com"
                required
              />
              <TextField
                label="Port"
                name="smtpPort"
                inputMode="numeric"
                defaultValue={pick('smtpPort', '587')}
                error={f['smtp.port']}
              />
              <TextField
                label="Username"
                name="smtpUser"
                autoComplete="off"
                defaultValue={pick('smtpUser')}
                error={f['smtp.user']}
              />
              <PasswordField label="Password" name="smtpPass" autoComplete="new-password" error={f['smtp.pass']} />
            </>
          ),
        },
        {
          title: 'Replies',
          content: (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">How replies reach us</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="inboundMode"
                  value="forward"
                  checked={!imap}
                  onChange={() => setImap(false)}
                  className="mt-1"
                />
                <span>Forward replies to an address we give you (simplest)</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="inboundMode"
                  value="imap"
                  checked={imap}
                  onChange={() => setImap(true)}
                  className="mt-1"
                />
                <span>Read the inbox over IMAP</span>
              </label>
              {imap ? (
                <div className="space-y-3">
                  <TextField
                    label="IMAP server"
                    name="imapHost"
                    defaultValue={pick('imapHost')}
                    error={f['imap.host']}
                    placeholder="imap.yourcompany.com"
                  />
                  <TextField
                    label="Port"
                    name="imapPort"
                    inputMode="numeric"
                    defaultValue={pick('imapPort', '993')}
                    error={f['imap.port']}
                  />
                  <TextField
                    label="Username"
                    name="imapUser"
                    autoComplete="off"
                    defaultValue={pick('imapUser')}
                    error={f['imap.user']}
                  />
                  <PasswordField label="Password" name="imapPass" autoComplete="new-password" error={f['imap.pass']} />
                </div>
              ) : null}
            </fieldset>
          ),
        },
      ]}
    />
  );
}

export function TestMailboxForm({ id }: { id: string }) {
  const [state, action] = useActionState(testMailboxAction, initialFormState);
  return (
    <form action={action} className="space-y-2" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="id" value={id} />
      <TextField
        label="Send a test message to"
        name="to"
        type="email"
        defaultValue={state.values?.to}
        error={state.fields?.to}
        hint="Use an address you can reply from. Your reply verifies this mailbox."
      />
      <SubmitButton pendingLabel="Sending…">Send test</SubmitButton>
    </form>
  );
}
