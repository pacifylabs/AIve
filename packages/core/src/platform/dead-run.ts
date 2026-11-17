/** The activity line for a run that used up its attempts, in the task's own name rather than its code. */
export function deadRunSummary(taskName: string | null, attempts: number): string {
  const what = taskName ? `“${taskName}”` : 'A task';
  return `${what} failed ${attempts} times and stopped. Try it again from the dashboard.`;
}
