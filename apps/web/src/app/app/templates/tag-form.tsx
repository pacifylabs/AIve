'use client';

import { useActionState } from 'react';
import { saveTagAction } from '@/app/actions/social';
import { TAG_COLOURS, type Tag } from '@/components/app/tag';
import { FormMessages, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

/** Makes a tag, or edits one: a name and one of eight colours. */
export function TagForm({ tag }: { tag?: Tag }) {
  const [state, action] = useActionState(saveTagAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      {tag ? <input type="hidden" name="id" value={tag.id} /> : null}
      <TextField
        label="Tag name"
        name="name"
        maxLength={40}
        defaultValue={state.values?.name ?? tag?.name ?? ''}
        error={state.fields?.name}
        required
      />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {TAG_COLOURS.map((colour) => (
            <label key={colour} className="cursor-pointer">
              <input
                type="radio"
                name="colour"
                value={colour}
                defaultChecked={(tag?.colour ?? 'blue') === colour}
                className="peer sr-only"
              />
              <span
                className={`tag tag-${colour} capitalize ring-2 ring-transparent peer-checked:ring-current peer-focus-visible:outline-2`}
              >
                {colour}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton pendingLabel="Saving…">{tag ? 'Save tag' : 'Add tag'}</SubmitButton>
    </form>
  );
}
