'use client';

import { useActionState } from 'react';
import { saveTemplateAction } from '@/app/actions/social';
import type { Tag } from '@/components/app/tag';
import { SelectField, SubmitButton, TextAreaField, TextField } from '@/components/form';
import { WithDraft } from '@/components/form-draft';
import { StepForm } from '@/components/step-form';
import { type Draft, firstValue } from '@/lib/form-draft';
import { initialFormState } from '@/lib/form-state';

export interface Template {
  id: string;
  name: string;
  body: string;
  firstComment: string | null;
  linkUrl: string | null;
  media: string[];
  accountIds: string[];
  tagId: string | null;
}

interface Props {
  template?: Template;
  accounts: { id: string; name: string; network: string }[];
  tags: Tag[];
}

/** Saves a post to start from later, or edits one that is saved, in steps. */
export function TemplateForm(props: Props) {
  return (
    <WithDraft name={`template:${props.template?.id ?? 'new'}`}>
      {(draft) => <TemplateSteps {...props} draft={draft} />}
    </WithDraft>
  );
}

function TemplateSteps({ template, accounts, tags, draft }: Props & { draft: Draft | null }) {
  const [state, action] = useActionState(saveTemplateAction, initialFormState);
  const pick = (name: string, fallback: string) => state.values?.[name] ?? firstValue(draft?.values, name) ?? fallback;
  const chosen = draft ? (draft.values.accountId ?? []) : (template?.accountIds ?? []);
  return (
    <StepForm
      action={action}
      state={state}
      hidden={template ? <input type="hidden" name="id" value={template.id} /> : null}
      submit={<SubmitButton pendingLabel="Saving…">{template ? 'Save template' : 'Add template'}</SubmitButton>}
      steps={[
        {
          title: 'Name and text',
          content: (
            <>
              <TextField
                label="Template name"
                name="name"
                maxLength={80}
                placeholder="Friday tip"
                defaultValue={pick('name', template?.name ?? '')}
                error={state.fields?.name}
                required
              />
              <TextAreaField
                label="Text"
                name="body"
                rows={5}
                defaultValue={pick('body', template?.body ?? '')}
                error={state.fields?.body}
                hint="You can change every word when you start a post from it."
                required
              />
            </>
          ),
        },
        {
          title: 'Extras',
          content: (
            <>
              <TextAreaField
                label="Pictures or a video (optional)"
                name="mediaUrls"
                rows={2}
                defaultValue={pick('mediaUrls', template?.media.join('\n') ?? '')}
                error={state.fields?.mediaUrls}
                hint="One public https address per line."
              />
              <TextField
                label="Link (optional)"
                name="linkUrl"
                type="url"
                inputMode="url"
                defaultValue={pick('linkUrl', template?.linkUrl ?? '')}
                error={state.fields?.linkUrl}
              />
              <TextField
                label="First comment (optional)"
                name="firstComment"
                defaultValue={pick('firstComment', template?.firstComment ?? '')}
                error={state.fields?.firstComment}
              />
            </>
          ),
        },
        {
          title: 'Where',
          content: (
            <>
              {accounts.length ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Usually posted to</legend>
                  {accounts.map((account) => (
                    <label key={account.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="accountId"
                        value={account.id}
                        defaultChecked={chosen.includes(account.id)}
                      />
                      <span>
                        {account.name} <span className="text-muted">· {account.network}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <SelectField label="Tag" name="tagId" defaultValue={pick('tagId', template?.tagId ?? '')}>
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
