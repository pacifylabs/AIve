'use client';

import { useActionState } from 'react';
import { acceptInvitationAction } from '@/app/actions/workspaces';
import { FormMessages, SubmitButton } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <FormMessages state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Joining…">Accept invitation</SubmitButton>
    </form>
  );
}
