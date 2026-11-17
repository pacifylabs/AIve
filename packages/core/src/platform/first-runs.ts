import type { RoleDefinition } from '../roles/types.js';
import type { NewRun } from './triggers.js';

/**
 * The runs a role queues the moment a staff member is hired, so new staff start working that day instead of waiting
 * for their first scheduled slot. One per staff member and task: hiring twice in a race cannot queue two.
 */
export function firstRunsFor(role: RoleDefinition, staff: { id: string; workspaceId: string }, now: Date): NewRun[] {
  return (role.firstRun ?? []).map((taskType) => {
    const task = role.tasks.find((candidate) => candidate.type === taskType);
    if (!task) throw new Error(`Role ${role.key} lists "${taskType}" as a first run, but has no such task.`);
    return {
      workspaceId: staff.workspaceId,
      staffId: staff.id,
      taskType,
      trigger: 'person' as const,
      idempotencyKey: `hire:${staff.id}:${taskType}`,
      input: {},
      runAt: now,
      maxAttempts: task.maxAttempts,
    };
  });
}

/** Whether a person may start this task by hand ("plan the week now"). */
export function canRunNow(role: RoleDefinition, taskType: string): boolean {
  const task = role.tasks.find((candidate) => candidate.type === taskType);
  return Boolean(task?.triggers.some((trigger) => 'person' in trigger));
}
