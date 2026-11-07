'use client';

import { useActionState } from 'react';
import { saveTemplateAction } from '@/app/actions/social';
import type { Tag } from '@/components/app/tag';
import { FormMessages, SubmitButton, TextAreaField, TextField } from '@/components/form';
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

/** Saves a post to start from later, or edits one that is saved. */
export function TemplateForm({
  template,
  accounts,
  tags,
}: {
  template?: Template;
  accounts: { id: string; name: string; network: string }[];
  tags: Tag[];
}) {
  const [state, action] = useActionState(saveTemplateAction, initialFormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <TextField
        label="Template name"
        name="name"
        maxLength={80}
        placeholder="Friday tip"
        defaultValue={v.name ?? template?.name ?? ''}
        error={state.fields?.name}
        required
      />
      <TextAreaField
        label="Text"
        name="body"
        rows={5}
        defaultValue={v.body ?? template?.body ?? ''}
        error={state.fields?.body}
        hint="You can change every word when you start a post from it."
        required
      />
      <TextAreaField
        label="Pictures or a video (optional)"
        name="mediaUrls"
        rows={2}
        defaultValue={v.mediaUrls ?? template?.media.join('\n') ?? ''}
        error={state.fields?.mediaUrls}
        hint="One public https address per line."
      />
      <TextField
        label="Link (optional)"
        name="linkUrl"
        type="url"
        inputMode="url"
        defaultValue={v.linkUrl ?? template?.linkUrl ?? ''}
        error={state.fields?.linkUrl}
      />
      <TextField
        label="First comment (optional)"
        name="firstComment"
        defaultValue={v.firstComment ?? template?.firstComment ?? ''}
        error={state.fields?.firstComment}
      />
      {accounts.length ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Usually posted to</legend>
          {accounts.map((account) => (
            <label key={account.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="accountId"
                value={account.id}
                defaultChecked={template?.accountIds.includes(account.id) ?? false}
              />
              <span>
                {account.name} <span className="text-muted">· {account.network}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <label className="block space-y-1 text-sm font-medium">
        Tag
        <select name="tagId" className="field font-normal" defaultValue={template?.tagId ?? ''}>
          <option value="">No tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pendingLabel="Saving…">{template ? 'Save template' : 'Add template'}</SubmitButton>
    </form>
  );
}
