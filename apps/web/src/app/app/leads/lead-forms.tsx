'use client';

import { useActionState } from 'react';
import { addLeadAction, importLeadsAction, type ImportState } from '@/app/actions/sales';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function AddLeadForm() {
  const [state, action] = useActionState(addLeadAction, initialFormState);
  const v = state.values ?? {};
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <TextField label="Email" name="email" type="email" defaultValue={v.email} error={f.email} />
      <TextField label="Name" name="name" defaultValue={v.name} error={f.name} />
      <TextField label="Company" name="company" defaultValue={v.company} error={f.company} />
      <TextField
        label="Website"
        name="website"
        inputMode="url"
        defaultValue={v.website}
        error={f.website}
        hint="Used to read about them before writing. Without it, a company email address is used."
      />
      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={v.notes} error={f.notes} />
      <SubmitButton pendingLabel="Adding…">Add lead</SubmitButton>
    </form>
  );
}

const STATUS_TEXT: Record<string, string> = {
  ok: 'Will be added',
  invalid: 'Not a valid email',
  duplicate: 'Already a lead',
  repeated: 'Repeated in this file',
  suppressed: 'Asked not to be contacted',
};

/** Previews a CSV first. The file is only saved when the person confirms what the preview showed. */
export function ImportLeadsForm() {
  const [state, action] = useActionState<ImportState, FormData>(importLeadsAction, initialFormState);
  const preview = state.preview;
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      {state.csv ? <input type="hidden" name="csv" value={state.csv} /> : null}
      {!preview || preview.committed ? (
        <>
          <div className="space-y-1">
            <label htmlFor="lead-file" className="block text-sm font-medium">
              CSV file
            </label>
            <input id="lead-file" type="file" name="file" accept=".csv,text/csv" className="block w-full text-sm" />
            <p className="text-xs text-muted">
              First row: column names. Needs an email column; name, company, website and timezone are optional.
            </p>
          </div>
          <SubmitButton pendingLabel="Reading the file…">Preview import</SubmitButton>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            {preview.ready} ready to add, {preview.skipped} skipped.
            {preview.withoutResearch
              ? ` ${preview.withoutResearch} use a personal email and have no website, so their first email is written from the record alone.`
              : ''}
          </p>
          <ul className="max-h-60 divide-y divide-border overflow-auto rounded-md border border-border text-sm">
            {preview.rows.map((row) => (
              <li key={row.line} className="flex justify-between gap-3 px-3 py-1.5">
                <span className="truncate">{row.email || '(empty)'}</span>
                <span className={row.status === 'ok' ? 'text-accent' : 'text-muted'}>
                  {STATUS_TEXT[row.status] ?? row.status}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="submit"
            name="commit"
            value="yes"
            disabled={preview.ready === 0}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            Add {preview.ready} leads
          </button>
        </div>
      )}
    </form>
  );
}
