import type { Problem } from '@ai-staff/contracts';

/** What every form action returns to its form: a top-level message and/or per-field messages. */
export interface FormState {
  error?: string;
  fields?: Record<string, string>;
  notice?: string;
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
