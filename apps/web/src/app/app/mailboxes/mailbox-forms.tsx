'use client';

import { useActionState, useState } from 'react';
import { connectMailboxAction, testMailboxAction } from '@/app/actions/sales';
import { FormMessages, PasswordField, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function ConnectMailboxForm() {
  const [state, action] = useActionState(connectMailboxAction, initialFormState);
  const [imap, setImap] = useState(false);
  const v = state.values ?? {};
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField
        label="Email address"
        name="address"
        type="email"
        defaultValue={v.address}
        error={f.address}
        hint="A dedicated address works best, for example sales@yourcompany.com."
      />
      <TextField label="Name people see" name="displayName" defaultValue={v.displayName} error={f.displayName} />
      <fieldset className="space-y-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-medium">Sending (SMTP)</legend>
        <TextField
          label="Server"
          name="smtpHost"
          defaultValue={v.smtpHost}
          error={f['smtp.host']}
          placeholder="smtp.yourcompany.com"
        />
        <TextField
          label="Port"
          name="smtpPort"
          inputMode="numeric"
          defaultValue={v.smtpPort ?? '587'}
          error={f['smtp.port']}
        />
        <TextField
          label="Username"
          name="smtpUser"
          autoComplete="off"
          defaultValue={v.smtpUser}
          error={f['smtp.user']}
        />
        <PasswordField label="Password" name="smtpPass" autoComplete="new-password" error={f['smtp.pass']} />
      </fieldset>
      <fieldset className="space-y-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-medium">How replies reach us</legend>
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
              defaultValue={v.imapHost}
              error={f['imap.host']}
              placeholder="imap.yourcompany.com"
            />
            <TextField
              label="Port"
              name="imapPort"
              inputMode="numeric"
              defaultValue={v.imapPort ?? '993'}
              error={f['imap.port']}
            />
            <TextField
              label="Username"
              name="imapUser"
              autoComplete="off"
              defaultValue={v.imapUser}
              error={f['imap.user']}
            />
            <PasswordField label="Password" name="imapPass" autoComplete="new-password" error={f['imap.pass']} />
          </div>
        ) : null}
      </fieldset>
      <SubmitButton pendingLabel="Checking the login…">Connect mailbox</SubmitButton>
    </form>
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
