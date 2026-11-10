'use server';

import { api } from '@/lib/api';
import { field, type FormState, fromProblem } from '@/lib/form-state';

export interface EarlyAccessValues {
  email: string;
  website: string;
  role: string;
  firstTask: string;
}

/** `values` echoes what was sent, because React resets the form after the action and the visitor should not retype it. */
export type EarlyAccessState = Omit<FormState, 'values'> & { done?: boolean; values?: EarlyAccessValues };

export async function joinEarlyAccessAction(_state: EarlyAccessState, data: FormData): Promise<EarlyAccessState> {
  const values: EarlyAccessValues = {
    email: field(data, 'email'),
    website: field(data, 'website'),
    role: field(data, 'role') || 'both',
    firstTask: field(data, 'firstTask'),
  };
  const result = await api('/early-access', { method: 'POST', body: values });
  if (!result.ok) return { ...fromProblem(result.problem), values };
  return { done: true };
}

export interface UpdatesState {
  done?: boolean;
  error?: string;
  fields?: Record<string, string>;
  email?: string;
}

/**
 * The footer's email-only sign-up. It sends no role, so an address already on the list keeps the answers it gave on
 * the full form; a new address joins with role "both".
 */
export async function joinUpdatesAction(_state: UpdatesState, data: FormData): Promise<UpdatesState> {
  const email = field(data, 'email');
  const result = await api('/early-access', { method: 'POST', body: { email } });
  if (!result.ok) return { ...fromProblem(result.problem), email };
  return { done: true };
}
