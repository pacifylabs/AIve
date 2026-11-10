'use client';

import { useActionState, useState } from 'react';
import { composePostAction } from '@/app/actions/social';
import type { Tag } from '@/components/app/tag';
import { SelectField, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { SetupLink, WithDraft } from '@/components/form-draft';
import { StepForm } from '@/components/step-form';
import { type Draft, firstValue } from '@/lib/form-draft';
import { initialFormState } from '@/lib/form-state';
import { type LibraryItem, MediaPicker } from './media-picker';

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

interface Props {
  requestId: string;
  accounts: { id: string; name: string; network: string }[];
  tags: Tag[];
  library: LibraryItem[];
  /** What a template fills in. Everything stays editable. */
  start: ComposeStart;
  /** One saved draft per starting point, so a template's draft never fills a blank post. */
  draftName: string;
}

export function ComposeForm(props: Props) {
  return <WithDraft name={props.draftName}>{(draft) => <ComposeSteps {...props} draft={draft} />}</WithDraft>;
}

const pickedAccount = (form: HTMLFormElement) =>
  form.querySelector('input[name="accountId"]:checked') ? null : 'Pick at least one account to post to.';

function ComposeSteps({ requestId, accounts, tags, library, start, draft }: Props & { draft: Draft | null }) {
  const [state, action] = useActionState(composePostAction, initialFormState);
  const d = draft?.values;
  /** What was sent and refused comes first, then what this tab saved, then the template or a blank post. */
  const pick = (name: string, fallback: string) => state.values?.[name] ?? firstValue(d, name) ?? fallback;
  const echoed = Object.keys(state.values ?? {})
    .filter((key) => key.startsWith('followUp.'))
    .sort((a, b) => Number(a.slice(9)) - Number(b.slice(9)))
    .map((key) => state.values![key]!);
  const [repeatKind, setRepeatKind] = useState(firstValue(d, 'repeatKind') ?? '');
  const [media, setMedia] = useState(pick('mediaUrls', start.mediaUrls));
  const [parts, setParts] = useState<string[]>(echoed.length ? echoed : (d?.followUp ?? start.followUps));
  const chosen = d ? (d.accountId ?? []) : start.accountIds;
  const weekdays = d?.weekday ?? ['1'];

  return (
    <StepForm
      action={action}
      state={state}
      hidden={<input type="hidden" name="requestId" value={requestId} />}
      submit={<SubmitButton pendingLabel="Posting…">Post</SubmitButton>}
      steps={[
        {
          title: 'Where',
          check: pickedAccount,
          content: (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Post to</legend>
              {accounts.map((account) => (
                <label key={account.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="accountId"
                    value={account.id}
                    defaultChecked={chosen.length ? chosen.includes(account.id) : accounts.length === 1}
                  />
                  <span>
                    {account.name} <span className="text-muted">· {account.network}</span>
                  </span>
                </label>
              ))}
              <p className="pt-1 text-xs text-muted">
                Missing one?{' '}
                <SetupLink href="/app/accounts" label="New post">
                  Connect another account
                </SetupLink>
                . What you write here is kept until you come back.
              </p>
            </fieldset>
          ),
        },
        {
          title: 'Write',
          content: (
            <>
              <TextAreaField
                label="What do you want to say?"
                name="body"
                rows={6}
                defaultValue={pick('body', start.body)}
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
                <button type="button" className="btn btn-sm" onClick={() => setParts([...parts, ''])}>
                  Add another post
                </button>
              ) : null}
              <TextField
                label="Link (optional)"
                name="linkUrl"
                type="url"
                inputMode="url"
                placeholder="https://yourcompany.com/offer"
                defaultValue={pick('linkUrl', start.linkUrl)}
                error={state.fields?.linkUrl}
              />
              <TextField
                label="First comment (optional)"
                name="firstComment"
                defaultValue={pick('firstComment', start.firstComment)}
                error={state.fields?.firstComment}
              />
            </>
          ),
        },
        {
          title: 'Media',
          content: (
            <>
              <TextAreaField
                label="Pictures or a video (optional)"
                name="mediaUrls"
                rows={3}
                value={media}
                onChange={(event) => setMedia(event.target.value)}
                error={state.fields?.mediaUrls}
                hint="One public https address per line. Instagram needs a picture or video; TikTok needs a video."
              />
              <MediaPicker
                items={library}
                onPick={(url) => setMedia((current) => (current.trim() ? `${current.trim()}\n${url}` : url))}
              />
              <p className="text-xs text-muted">
                {library.length ? 'Need something new? ' : 'Your media library is empty. '}
                <SetupLink href="/app/media" label="New post">
                  Upload to the media library
                </SetupLink>
                , then come back.
              </p>
            </>
          ),
        },
        {
          title: 'When',
          content: (
            <>
              <TextField
                label="Send at (optional)"
                name="scheduledLocal"
                type="datetime-local"
                defaultValue={pick('scheduledLocal', '')}
                error={state.fields?.scheduledLocal}
                hint="In your workspace's time zone. Leave empty to post right away."
              />
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
                          <input
                            type="checkbox"
                            name="weekday"
                            value={index}
                            defaultChecked={weekdays.includes(String(index))}
                          />{' '}
                          {name}
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-2">
                      Every
                      <input
                        name="everyWeeks"
                        type="number"
                        min={1}
                        max={8}
                        defaultValue={firstValue(d, 'everyWeeks') ?? 1}
                        className="field w-20"
                      />
                      week(s)
                    </label>
                  </div>
                ) : null}
                {repeatKind === 'monthly_day' ? (
                  <label className="flex items-center gap-2 text-sm">
                    On day
                    <input
                      name="dayOfMonth"
                      type="number"
                      min={1}
                      max={31}
                      defaultValue={firstValue(d, 'dayOfMonth') ?? 1}
                      className="field w-20"
                    />
                    of the month (the last day, in a shorter month)
                  </label>
                ) : null}
                {repeatKind === 'monthly_weekday' ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    On the
                    <select
                      name="nth"
                      className="field w-auto"
                      defaultValue={firstValue(d, 'nth') ?? '1'}
                      aria-label="Which week"
                    >
                      <option value="1">first</option>
                      <option value="2">second</option>
                      <option value="3">third</option>
                      <option value="4">fourth</option>
                      <option value="5">last</option>
                    </select>
                    <select
                      name="monthWeekday"
                      className="field w-auto"
                      defaultValue={firstValue(d, 'monthWeekday') ?? '1'}
                      aria-label="Which day"
                    >
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
                    defaultValue={pick('repeatEndsOn', '')}
                    error={state.fields?.repeatEndsOn}
                    hint="The first post goes out at the send time above. Posts are made four weeks ahead and appear on the Calendar."
                  />
                ) : null}
              </fieldset>
              <SelectField label="Tag (optional)" name="tagId" defaultValue={pick('tagId', start.tagId)}>
                <option value="">No tag</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </SelectField>
            </>
          ),
        },
      ]}
    />
  );
}
