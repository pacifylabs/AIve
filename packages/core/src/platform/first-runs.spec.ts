import { describe, expect, it } from 'vitest';
import type { RoleDefinition } from '../roles/types.js';
import { dummyRole } from '../testing/dummy-role.js';
import { canRunNow, firstRunsFor } from './first-runs.js';

const staff = { id: '01a1e915-96ae-73f4-a17e-e914cbb443d5', workspaceId: '01a1d01b-1dda-7537-bf1b-1b22b4759dbd' };
const now = new Date('2026-11-17T10:37:48Z');

describe('firstRunsFor', () => {
  it('queues each first-run task straight away, once per staff member', () => {
    const role: RoleDefinition = { ...dummyRole, firstRun: ['dummy.draft_note'] };
    expect(firstRunsFor(role, staff, now)).toEqual([
      {
        workspaceId: staff.workspaceId,
        staffId: staff.id,
        taskType: 'dummy.draft_note',
        trigger: 'person',
        idempotencyKey: `hire:${staff.id}:dummy.draft_note`,
        input: {},
        runAt: now,
        maxAttempts: 3,
      },
    ]);
  });

  it('queues nothing for a role without first runs', () => {
    expect(firstRunsFor({ ...dummyRole, firstRun: undefined }, staff, now)).toEqual([]);
  });

  it('refuses a first run that is not one of the role’s tasks', () => {
    expect(() => firstRunsFor({ ...dummyRole, firstRun: ['other.task'] }, staff, now)).toThrow(/other\.task/);
  });
});

describe('canRunNow', () => {
  it('allows a task a person may start', () => {
    expect(canRunNow(dummyRole, 'dummy.draft_note')).toBe(true);
  });

  it('refuses a task only events or schedules start, or one the role does not have', () => {
    const eventOnly = dummyRole.tasks.find((task) => !task.triggers.some((trigger) => 'person' in trigger));
    if (eventOnly) expect(canRunNow(dummyRole, eventOnly.type)).toBe(false);
    expect(canRunNow(dummyRole, 'other.task')).toBe(false);
  });
});
