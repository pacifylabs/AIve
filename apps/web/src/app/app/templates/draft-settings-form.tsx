'use client';

import { useActionState } from 'react';
import { saveDraftSettingsAction } from '@/app/actions/social';
import type { Tag } from '@/components/app/tag';
import { FormMessages, SubmitButton } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

/** How the staff member's own drafts are tagged, and whether it writes a thread. */
export function DraftSettingsForm({
  tags,
  draftTagId,
  chainReplies,
}: {
  tags: Tag[];
  draftTagId: string | null;
  chainReplies: number;
}) {
  const [state, action] = useActionState(saveDraftSettingsAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <label className="block space-y-1 text-sm font-medium">
        Tag put on every post the staff member drafts
        <select name="draftTagId" className="field font-normal" defaultValue={draftTagId ?? ''}>
          <option value="">No tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Follow-up replies per draft (X, Threads, Telegram, Facebook, Instagram)
        <select name="chainReplies" className="field font-normal" defaultValue={String(chainReplies)}>
          <option value="0">None</option>
          <option value="1">One</option>
          <option value="2">Two</option>
          <option value="3">Three</option>
        </select>
      </label>
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
