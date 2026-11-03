import type { Problem } from '@ai-staff/contracts';

/**
 * What every form action returns to its form: a top-level message and/or per-field messages. `values` echoes what
 * was sent on failure, because React resets the form after the action and nobody should have to retype it.
 */
export interface FormState {
  error?: string;
  fields?: Record<string, string>;
  notice?: string;
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

export function fromProblem(problem: Problem): FormState {
  const fields = Object.fromEntries((problem.errors ?? []).map((error) => [error.path, error.message]));
  return { error: problem.errors?.length ? undefined : problem.title, fields };
}

export const field = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};

/** The submitted text fields whose names pass `keep`, for `FormState.values`. */
export function echo(data: FormData, keep: (name: string) => boolean): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of data.entries()) if (typeof value === 'string' && keep(name)) values[name] = value;
  return values;
}
