'use client';

import { useActionState } from 'react';
import { planWeekNowAction } from '@/app/actions/platform';
import { FormMessages, SubmitButton } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

/** Starts a social staff member's weekly plan now, for anyone who does not want to wait for Friday. */
export function PlanWeekButton({ staffId }: { staffId: string }) {
  const [state, action] = useActionState(planWeekNowAction, initialFormState);
  return (
    <form action={action} className="space-y-2" noValidate>
      <input type="hidden" name="staffId" value={staffId} />
      <FormMessages state={state} />
      {state.notice ? null : (
        <SubmitButton variant="secondary" pendingLabel="Starting…">
          Plan next week now
        </SubmitButton>
      )}
    </form>
  );
}
