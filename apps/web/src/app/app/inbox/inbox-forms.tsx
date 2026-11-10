'use client';

import { useActionState } from 'react';
import { approveAction, rejectAction } from '@/app/actions/platform';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export interface InboxItem {
  id: string;
  staffName: string;
  taskType: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  flaggedReason: string | null;
  state: string;
  rejectReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Shown for context, not editable: changing them would not change what happens. */
const READ_ONLY = new Set([
  'overview',
  'network',
  'accountName',
  'replyTo',
  'weekStart',
  'staffId',
  'engagementId',
  'accountId',
  'to',
  'link',
]);

const label = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase());

/** A pending draft: its text fields are editable in place, and approving sends what the person left. */
export function PendingItem({ item }: { item: InboxItem }) {
  const [approveState, approve] = useActionState(approveAction, initialFormState);
  const [rejectState, reject] = useActionState(rejectAction, initialFormState);
  const textFields = Object.entries(item.payload).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  const escalation = item.kind === 'escalation';

  return (
    <article id={`item-${item.id}`} className="card scroll-mt-24 space-y-4 p-5">
      <header className="space-y-1">
        <p className="text-xs text-muted">
          {item.staffName} ·{' '}
          {/* Server and browser can sit in different time zones; a mismatch here must not re-render the editable form. */}
          <time dateTime={item.createdAt} suppressHydrationWarning>
            {new Date(item.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </p>
        <h2 className="font-medium">{item.title}</h2>
        {item.flaggedReason ? (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="note">
            Needs you: {item.flaggedReason}
          </p>
        ) : null}
      </header>

      {escalation ? (
        <pre className="max-h-64 overflow-auto rounded-lg bg-subtle p-3 text-xs">
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      ) : (
        <form action={approve} className="space-y-3" noValidate>
          <FormMessages state={approveState} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="original" value={JSON.stringify(item.payload)} />
          {textFields
            .filter(([key]) => READ_ONLY.has(key))
            .map(([key, value]) =>
              key === 'staffId' || key === 'engagementId' || key === 'accountId' ? null : (
                <div key={key} className="space-y-1">
                  <p className="text-sm font-medium">{label(key)}</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2 text-sm text-muted">{value}</p>
                </div>
              ),
            )}
          {textFields
            .filter(([key]) => !READ_ONLY.has(key))
            .map(([key, value]) => (
              <TextAreaField
                key={key}
                label={label(key)}
                name={`payload.${key}`}
                defaultValue={approveState.values?.[`payload.${key}`] ?? value}
                rows={key === 'body' ? 8 : 2}
              />
            ))}
          <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
        </form>
      )}

      <form action={reject} className="space-y-3 border-t border-border pt-4" noValidate>
        <FormMessages state={rejectState} />
        <input type="hidden" name="id" value={item.id} />
        <TextField
          label={escalation ? 'Close it' : 'Or reject it'}
          name="reason"
          placeholder={escalation ? 'What you did about it' : 'Wrong tone, wrong offer, not now'}
          defaultValue={rejectState.values?.reason}
          error={rejectState.fields?.reason}
          hint="Your reason is shown to this staff member next time."
        />
        <SubmitButton pendingLabel="Saving…" variant="secondary">
          {escalation ? 'Close' : 'Reject'}
        </SubmitButton>
      </form>
    </article>
  );
}
