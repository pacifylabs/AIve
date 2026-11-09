'use client';

import { useActionState, useState } from 'react';
import { composePostAction } from '@/app/actions/social';
import type { Tag } from '@/components/app/tag';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ComposeStart {
  followUps: string[];
  body: string;
  firstComment: string;
  linkUrl: string;
  mediaUrls: string;
  accountIds: string[];
  tagId: string;
}

export function ComposeForm({
  requestId,
  accounts,
  tags,
  start,
}: {
  requestId: string;
  accounts: { id: string; name: string; network: string }[];
  tags: Tag[];
  /** What a template fills in. Everything stays editable. */
  start: ComposeStart;
}) {
  const [state, action] = useActionState(composePostAction, initialFormState);
  // The follow-up boxes: what a refused post sent back, or what a template or an unfinished chain starts with.
  const echoed = Object.keys(state.values ?? {})
    .filter((key) => key.startsWith('followUp.'))
    .sort((a, b) => Number(a.slice(9)) - Number(b.slice(9)))
    .map((key) => state.values![key]!);
  const [repeatKind, setRepeatKind] = useState('');
  const [parts, setParts] = useState<string[]>(echoed.length ? echoed : start.followUps);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Post to</legend>
        {accounts.map((account) => (
          <label key={account.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="accountId"
              value={account.id}
              defaultChecked={start.accountIds.length ? start.accountIds.includes(account.id) : accounts.length === 1}
            />
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
        defaultValue={state.values?.body ?? start.body}
        error={state.fields?.body}
        hint="Checked against each network's length limit when you post. Sign-offs are not added to posts you write yourself."
        required
      />
      {parts.map((part, index) => (
        <div key={index} className="space-y-1">
          <TextAreaField
            label={`Reply ${index + 1}, posted under the one before it`}
            name="followUp"
            rows={3}
            value={part}
            onChange={(event) => setParts(parts.map((p, i) => (i === index ? event.target.value : p)))}
            error={index === 0 ? state.fields?.followUps : undefined}
          />
          <button
            type="button"
            className="text-xs text-danger hover:underline"
            onClick={() => setParts(parts.filter((_, i) => i !== index))}
          >
            Remove this reply
          </button>
        </div>
      ))}
      {parts.length < 9 ? (
        <button type="button" className="btn" onClick={() => setParts([...parts, ''])}>
          Add another post
        </button>
      ) : null}
      <TextAreaField
        label="Pictures or a video (optional)"
        name="mediaUrls"
        rows={2}
        defaultValue={state.values?.mediaUrls ?? start.mediaUrls}
        error={state.fields?.mediaUrls}
        hint="One public https address per line. Instagram needs a picture or video; TikTok needs a video."
      />
      <TextField
        label="Link (optional)"
        name="linkUrl"
        type="url"
        inputMode="url"
        placeholder="https://yourcompany.com/offer"
        defaultValue={state.values?.linkUrl ?? start.linkUrl}
        error={state.fields?.linkUrl}
      />
      <TextField
        label="First comment (optional)"
        name="firstComment"
        defaultValue={state.values?.firstComment ?? start.firstComment}
        error={state.fields?.firstComment}
      />
      <label className="block space-y-1 text-sm font-medium">
        Tag (optional)
        <select name="tagId" className="field font-normal" defaultValue={start.tagId}>
          <option value="">No tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-3 rounded-xl border border-line-soft p-4">
        <legend className="px-1 text-sm font-medium">Repeat</legend>
        <select
          name="repeatKind"
          className="field"
          value={repeatKind}
          onChange={(event) => setRepeatKind(event.target.value)}
          aria-label="How often to repeat this post"
        >
          <option value="">Does not repeat</option>
          <option value="weekly">Every week, on chosen days</option>
          <option value="monthly_day">Every month, on a day of the month</option>
          <option value="monthly_weekday">Every month, on the first, second… weekday</option>
        </select>
        {repeatKind === 'weekly' ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((name, index) => (
                <label key={name} className="flex items-center gap-1">
                  <input type="checkbox" name="weekday" value={index} defaultChecked={index === 1} /> {name}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2">
              Every
              <input name="everyWeeks" type="number" min={1} max={8} defaultValue={1} className="field w-20" />
              week(s)
            </label>
          </div>
        ) : null}
        {repeatKind === 'monthly_day' ? (
          <label className="flex items-center gap-2 text-sm">
            On day
            <input name="dayOfMonth" type="number" min={1} max={31} defaultValue={1} className="field w-20" />
            of the month (the last day, in a shorter month)
          </label>
        ) : null}
        {repeatKind === 'monthly_weekday' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            On the
            <select name="nth" className="field w-auto" defaultValue="1">
              <option value="1">first</option>
              <option value="2">second</option>
              <option value="3">third</option>
              <option value="4">fourth</option>
              <option value="5">last</option>
            </select>
            <select name="monthWeekday" className="field w-auto" defaultValue="1">
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            of the month
          </div>
        ) : null}
        {repeatKind ? (
          <TextField
            label="Stop repeating on (optional)"
            name="repeatEndsOn"
            type="date"
            defaultValue={state.values?.repeatEndsOn ?? ''}
            error={state.fields?.repeatEndsOn}
            hint='The first post is the "Send at" date and time below. Posts are made four weeks ahead and appear on the Calendar.'
          />
        ) : null}
      </fieldset>
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
