'use client';

import { useActionState, useState } from 'react';
import { approveAction, rejectAction } from '@/app/actions/platform';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';
import { postLength, X_LIMIT } from '@/lib/post-length';
import { EDITABLE, kindLabel, planIdeas, toLocalInput } from '@/lib/review';
import { NETWORK_LABEL } from '@/lib/staff';

export interface ReviewItem {
  id: string;
  staffId: string;
  staffName: string;
  taskType: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  flaggedReason: string | null;
  createdAt: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A time in words, in the workspace's zone: "Monday 23 November, 10:00". */
function when(iso: string, timeZone: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

/** Labelled facts about a draft, shown beside the preview. */
function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The post as it will appear: who posts it, the words, the link and how many pictures. */
function PostPreview({ payload }: { payload: Record<string, unknown> }) {
  const network = text(payload.network);
  const account = text(payload.accountName) || 'Your account';
  const body = text(payload.body);
  const media = text(payload.mediaUrls)
    .split('\n')
    .filter((line) => line.trim());
  const length = postLength(body);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">How it will look on {NETWORK_LABEL[network] ?? 'the network'}</p>
      <div className="card space-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-subtle text-sm font-semibold"
          >
            {account.replace(/^[@#]/, '').trim()[0]?.toUpperCase() ?? '?'}
          </span>
          <span className="text-sm font-semibold">{account}</span>
        </div>
        <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{body}</p>
        {media.length ? (
          <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-text-2">
            {media.length} {media.length === 1 ? 'picture or video' : 'pictures or videos'} attached
          </p>
        ) : null}
        {text(payload.link) ? (
          <p className="truncate rounded-lg border border-border px-3 py-2 text-sm text-accent">{text(payload.link)}</p>
        ) : null}
        {text(payload.firstComment) ? (
          <p className="border-t border-line-soft pt-3 text-sm text-text-2">
            <span className="text-muted">First comment: </span>
            {text(payload.firstComment)}
          </p>
        ) : null}
      </div>
      <p className={`text-xs ${network === 'x' && length > X_LIMIT ? 'text-danger' : 'text-muted'}`}>
        {length.toLocaleString('en-GB')} characters{network === 'x' ? ` of ${X_LIMIT}` : ''}
      </p>
    </div>
  );
}

function EmailPreview({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="card divide-y divide-line-soft">
      <div className="space-y-1 px-5 py-3 text-sm">
        <p>
          <span className="text-muted">To </span>
          {text(payload.to) || 'not set'}
        </p>
        <p className="font-medium">{text(payload.subject) || '(no subject)'}</p>
      </div>
      <p className="px-5 py-4 text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{text(payload.body)}</p>
    </div>
  );
}

const REPORT_LABEL: Record<string, string> = {
  contacted: 'People contacted',
  followUps: 'Follow-ups sent',
  replies: 'Replies',
  interested: 'Interested',
  escalations: 'Handed to you',
  optOuts: 'Opted out',
  bounces: 'Bounced',
  posts: 'Posts',
  published: 'Posts out',
};

/** A report's figures, labelled. Unlabelled keys and anything that is not a number are left out. */
function ReportFigures({ payload }: { payload: Record<string, unknown> }) {
  const figures = Object.entries(payload).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[0] in REPORT_LABEL,
  );
  if (!figures.length) return <p className="text-sm text-muted">This report has no figures.</p>;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {figures.map(([key, value]) => (
        <div key={key} className="card space-y-1 p-4">
          <dt className="text-xs text-muted">{REPORT_LABEL[key]}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One piece of work to decide on: what it is, how it will look, and approve, edit or reject. */
export function ReviewDetail({ item, timeZone }: { item: ReviewItem; timeZone: string }) {
  const [approveState, approve] = useActionState(approveAction, initialFormState);
  const [rejectState, reject] = useActionState(rejectAction, initialFormState);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(Boolean(rejectState.error));
  const { payload, kind } = item;
  const ideas = kind === 'plan' ? planIdeas(payload) : [];
  const escalation = kind === 'escalation';
  const scheduled = text(payload.scheduledFor);
  const editable = Object.keys(EDITABLE).filter((key) => typeof payload[key] === 'string');
  const network = text(payload.network);

  const facts: [string, string][] = [];
  if (network) facts.push(['Posts to', `${NETWORK_LABEL[network] ?? network} · ${text(payload.accountName)}`]);
  if (scheduled) facts.push(['When', `${when(scheduled, timeZone)}, your time`]);
  facts.push(['From', item.staffName]);

  return (
    <article aria-labelledby="review-title" className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium text-muted">
          {kindLabel(kind)} · from {item.staffName}
        </p>
        <h2 id="review-title" className="text-xl font-semibold tracking-tight">
          {item.title}
        </h2>
        {item.flaggedReason ? (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="note">
            Stopped for you: {item.flaggedReason}
          </p>
        ) : !['post_draft', 'email_draft', 'reply_draft'].includes(kind) ? null : (
          <p className="text-sm text-ok">
            Passed your guardrails: confirmed facts only, allowed links, the network&apos;s limits.
          </p>
        )}
      </header>

      <form action={approve} className="space-y-6" noValidate>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="original" value={JSON.stringify(payload)} />
        <input type="hidden" name="timeZone" value={timeZone} />
        <FormMessages state={approveState} />

        {kind === 'plan' ? (
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm text-text-2">
              Untick anything you don&apos;t want. {item.staffName} writes each idea you keep as its own draft, for you
              to approve.
            </legend>
            <input type="hidden" name="planShown" value="1" />
            <ul className="card divide-y divide-line-soft">
              {ideas.map((idea) => (
                <li key={idea.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-5 py-3.5">
                    <input type="checkbox" name="keep" value={idea.id} defaultChecked className="mt-1 size-4" />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-sm font-medium">{idea.angle}</span>
                      <span className="block text-xs text-muted">
                        {when(idea.scheduledFor, timeZone)} · {NETWORK_LABEL[idea.network] ?? idea.network} ·{' '}
                        {idea.pillar}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {approveState.fields?.keep ? <p className="text-sm text-danger">{approveState.fields.keep}</p> : null}
          </fieldset>
        ) : kind === 'report' ? (
          <ReportFigures payload={payload} />
        ) : escalation ? (
          <Facts
            rows={Object.entries(payload)
              .filter((entry): entry is [string, string | number] => ['string', 'number'].includes(typeof entry[1]))
              .filter(([key]) => !/id$/i.test(key))
              .map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').toLowerCase(), String(value)])}
          />
        ) : editing ? (
          <div className="space-y-4">
            {editable.map((key) => (
              <TextAreaField
                key={key}
                label={EDITABLE[key]!}
                name={`payload.${key}`}
                defaultValue={approveState.values?.[`payload.${key}`] ?? text(payload[key])}
                rows={key === 'body' ? 9 : key === 'subject' ? 1 : 3}
              />
            ))}
            {scheduled ? (
              <TextField
                type="datetime-local"
                label="When it goes out (your time)"
                name="scheduledLocal"
                defaultValue={approveState.values?.scheduledLocal ?? toLocalInput(scheduled, timeZone)}
                error={approveState.fields?.scheduledLocal}
              />
            ) : null}
          </div>
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(16rem,1fr)]">
            {kind === 'post_draft' ? (
              <PostPreview payload={payload} />
            ) : kind === 'email_draft' || kind === 'reply_draft' ? (
              <EmailPreview payload={payload} />
            ) : (
              <div className="card space-y-3 p-5">
                {editable.map((key) => (
                  <p key={key} className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
                    {text(payload[key])}
                  </p>
                ))}
              </div>
            )}
            <div className="card p-5">
              <Facts rows={facts} />
            </div>
          </div>
        )}
        {rejecting ? null : (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
            {escalation ? null : (
              <SubmitButton pendingLabel="Approving…" full={false}>
                {kind === 'plan'
                  ? 'Approve the ideas I kept'
                  : kind === 'report'
                    ? 'Mark as read'
                    : scheduled
                      ? editing
                        ? 'Approve with my changes'
                        : 'Approve and schedule'
                      : 'Approve'}
              </SubmitButton>
            )}
            {editable.length && !['plan', 'report'].includes(kind) && !escalation ? (
              <button type="button" className="btn" onClick={() => setEditing((on) => !on)}>
                {editing ? 'Stop editing' : 'Edit'}
              </button>
            ) : null}
            <button
              type="button"
              className={escalation ? 'btn btn-primary' : 'btn text-danger'}
              onClick={() => setRejecting(true)}
            >
              {escalation ? 'Close it…' : 'Reject…'}
            </button>
            {kind === 'plan' || escalation ? null : (
              <p className="ml-auto text-xs text-muted">Each approval adds to {item.staffName}&apos;s record.</p>
            )}
          </div>
        )}
      </form>

      {rejecting ? (
        <form action={reject} className="max-w-2xl space-y-3 border-t border-border pt-5" noValidate>
          <FormMessages state={rejectState} />
          <input type="hidden" name="id" value={item.id} />
          {escalation ? <input type="hidden" name="closing" value="1" /> : null}
          <TextField
            label={
              escalation ? 'What did you do about it?' : `Why are you rejecting it? ${item.staffName} learns from this.`
            }
            name="reason"
            placeholder={escalation ? 'Called them back and sorted it' : 'Too salesy, wrong offer, not now'}
            defaultValue={rejectState.values?.reason}
            error={rejectState.fields?.reason}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel="Saving…" variant={escalation ? 'primary' : 'danger'} full={false}>
              {escalation ? 'Close it' : 'Reject'}
            </SubmitButton>
            <button type="button" className="btn" onClick={() => setRejecting(false)}>
              Keep it
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
