import { ActivityEvent, AuditEntry, type DataSource, StaffTaskSetting } from '@ai-staff/db';
import { FakeModelProvider } from '@ai-staff/llm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApprovalService,
  AutopilotNotAllowedError,
  AutopilotService,
  CompanyBrain,
  dummyRole,
  hireStaff,
  type RoleDefinition,
  RoleRegistry,
  TaskEngine,
  type TaskDefinition,
  Triggers,
} from '../src/index.js';
import { clock, connect, inWorkspace, runs, seedWorkspace, workItems } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

/** A task that acts alone at `act` (an alert stands in for a post) and asks a person otherwise. */
const post: TaskDefinition<Record<string, never>, Record<string, never>> = {
  type: 'cap.post',
  name: 'Write a post',
  risk: 'acts_external',
  defaultAutonomy: 'draft',
  triggers: [{ person: true }],
  inputSchema: z.object({}),
  execute: async () => ({}),
  toEffects: (ctx) =>
    ctx.autonomy === 'act'
      ? [{ type: 'alert', summary: 'posted without review' }]
      : [{ type: 'createWorkItem', kind: 'post_draft', title: 'A post', payload: { body: 'Hello' }, onApprove: [] }],
  promotion: { approvals: 3, maxMedianEditRatio: 0.15, windowDays: 30 },
};
const capRole: RoleDefinition = {
  ...dummyRole,
  key: 'cap',
  name: 'Cap Staff',
  tasks: [post],
  subscribes: [],
  emits: [],
};

function platform() {
  const time = clock('2026-11-03T09:30:00Z');
  const registry = new RoleRegistry().register(dummyRole).register(capRole);
  const approvals = new ApprovalService(db, registry, time.now);
  return {
    time,
    registry,
    approvals,
    autopilot: new AutopilotService(db, registry, approvals, time.now),
    engine: new TaskEngine(
      db,
      registry,
      new FakeModelProvider(() => ({
        output: { title: 'Our Starter plan', body: 'The Starter plan is $1,200 a year.' },
      })),
      { now: time.now },
    ),
    triggers: new Triggers(db, registry, time.now),
    brain: new CompanyBrain(db, time.now),
  };
}

async function hire(p: ReturnType<typeof platform>, roleKey: 'dummy' | 'cap') {
  const ws = await seedWorkspace(db);
  const actor = { workspaceId: ws.workspaceId, userId: ws.userId };
  await p.brain.addFact(actor, 'price', 'Starter plan: $1,200 a year');
  const staff = await hireStaff(db, p.registry, actor, { roleKey, displayName: 'Dee', settings: {} });
  // Tests share one database, and the engine tests count every due schedule in it. These staff run only when asked.
  await inWorkspace(db, ws.workspaceId, (m) =>
    m.query(`UPDATE staff_task_settings SET schedule = NULL WHERE workspace_id = $1`, [ws.workspaceId]),
  );
  return { ...ws, actor, staff };
}

const setting = (workspaceId: string, staffId: string, taskType: string) =>
  inWorkspace(db, workspaceId, (m) => m.findOneByOrFail(StaffTaskSetting, { staffId, taskType }));

/** Runs the task `count` times and approves what lands in the inbox, so the record has that many approvals. */
async function approveRuns(
  p: ReturnType<typeof platform>,
  who: Awaited<ReturnType<typeof hire>>,
  taskType: string,
  count: number,
) {
  for (let i = 0; i < count; i += 1) {
    await p.triggers.runNow({ ...who.actor, staffId: who.staff.id, taskType, requestId: `r${i}`, taskInput: {} });
  }
  for (const due of await p.triggers.dueRuns()) {
    if (due.workspaceId === who.workspaceId) await p.engine.run(due.workspaceId, due.id);
  }
  for (const item of await workItems(db, who.workspaceId)) {
    if (item.state === 'pending') await p.approvals.approve(who.actor, item.id);
  }
  // Approving emits events, and the engine tests expect to be the only ones with events waiting in the shared database.
  await p.triggers.dispatchEvents();
}

describe('autopilot rules', () => {
  it('lists only tasks that publish or send, with progress toward the rules', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    await approveRuns(p, who, 'dummy.draft_note', 2);
    const views = await p.autopilot.overview(who.workspaceId, who.userId);
    expect(views.map((view) => view.taskType)).toEqual(['dummy.draft_note']);
    expect(views[0]).toMatchObject({
      autonomy: 'draft',
      mode: 'ask',
      rules: { approvals: 3 },
      progress: { approvals: 2, met: false, missing: ['1 more approval needed'] },
    });
  });

  it('switches a task on by itself once the record meets the rules, and records why', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    await approveRuns(p, who, 'dummy.draft_note', 3);

    const view = await p.autopilot.configure(who.actor, who.staff.id, 'dummy.draft_note', { mode: 'auto', rules: {} });

    expect(view.autonomy).toBe('act');
    const log = await inWorkspace(db, who.workspaceId, async (m) => ({
      audit: await m.findBy(AuditEntry, { workspaceId: who.workspaceId, action: 'autonomy.promoted_auto' }),
      events: await m.findBy(ActivityEvent, { workspaceId: who.workspaceId, type: 'autonomy.promoted_auto' }),
    }));
    expect(log.audit).toHaveLength(1);
    expect(log.events[0]!.summary).toContain('on autopilot');
  });

  it('only offers promotion in "ask" mode, and does nothing in "off" mode', async () => {
    const p = platform();
    const asked = await hire(p, 'dummy');
    await approveRuns(p, asked, 'dummy.draft_note', 3);
    const offered = await p.autopilot.configure(asked.actor, asked.staff.id, 'dummy.draft_note', {
      mode: 'ask',
      rules: {},
    });
    expect(offered.autonomy).toBe('draft');
    expect(offered.offerId).not.toBeNull();

    const off = await hire(p, 'dummy');
    await approveRuns(p, off, 'dummy.draft_note', 3);
    const never = await p.autopilot.configure(off.actor, off.staff.id, 'dummy.draft_note', { mode: 'off', rules: {} });
    expect(never).toMatchObject({ autonomy: 'draft', offerId: null });
    await p.approvals.evaluatePromotions();
    expect((await setting(off.workspaceId, off.staff.id, 'dummy.draft_note')).autonomy).toBe('draft');
  });

  it('waits while the record does not meet the rules', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    await approveRuns(p, who, 'dummy.draft_note', 3);
    // The owner asks for more evidence than the role does.
    const view = await p.autopilot.configure(who.actor, who.staff.id, 'dummy.draft_note', {
      mode: 'auto',
      rules: { approvals: 10 },
    });
    expect(view).toMatchObject({ autonomy: 'draft', rules: { approvals: 10 } });
    expect(view.progress.missing).toEqual(['7 more approvals needed']);
  });

  it('is blocked by a rejection inside the window', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    await approveRuns(p, who, 'dummy.draft_note', 3);
    await p.triggers.runNow({
      ...who.actor,
      staffId: who.staff.id,
      taskType: 'dummy.draft_note',
      requestId: 'bad',
      taskInput: {},
    });
    for (const due of await p.triggers.dueRuns()) {
      if (due.workspaceId === who.workspaceId) await p.engine.run(due.workspaceId, due.id);
    }
    const [pending] = (await workItems(db, who.workspaceId)).filter((item) => item.state === 'pending');
    await p.approvals.reject(who.actor, pending!.id, 'Not our tone');

    const view = await p.autopilot.configure(who.actor, who.staff.id, 'dummy.draft_note', { mode: 'auto', rules: {} });
    expect(view.autonomy).toBe('draft');
    expect(view.progress.rejections).toBe(1);
  });

  it('keeps what the owner types inside the platform limits', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    const view = await p.autopilot.configure(who.actor, who.staff.id, 'dummy.draft_note', {
      mode: 'ask',
      rules: { approvals: 1, windowDays: 1, maxMedianEditRatio: 0.9, maxPerDay: 500 },
    });
    expect(view.rules).toEqual({ approvals: 5, windowDays: 7, maxMedianEditRatio: 0.3, maxPerDay: 50 });
    const stored = (await setting(who.workspaceId, who.staff.id, 'dummy.draft_note')).autopilotRules;
    expect(stored).toEqual({ approvals: 5, windowDays: 7, maxMedianEditRatio: 0.3, maxPerDay: 50 });
  });

  it('refuses tasks that do not publish or send', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    await expect(
      p.autopilot.configure(who.actor, who.staff.id, 'dummy.record_approval', { mode: 'auto', rules: {} }),
    ).rejects.toBeInstanceOf(AutopilotNotAllowedError);
  });
});

describe('turning autopilot on and off by hand', () => {
  it('lets the owner switch it on now, and stop it, with a record of both', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    const on = await p.autopilot.enableNow(who.actor, who.staff.id, 'dummy.draft_note');
    expect(on.autonomy).toBe('act');

    const off = await p.autopilot.stop(who.actor, who.staff.id, 'dummy.draft_note');
    expect(off).toMatchObject({ autonomy: 'draft', mode: 'ask' });
    const actions = await inWorkspace(db, who.workspaceId, async (m) =>
      (await m.findBy(AuditEntry, { workspaceId: who.workspaceId })).map((entry) => entry.action),
    );
    expect(actions).toEqual(expect.arrayContaining(['autonomy.enabled_now', 'autonomy.stopped']));
  });

  it('goes back to "ask" after a demotion, so it is never switched on again without a person', async () => {
    const p = platform();
    const who = await hire(p, 'dummy');
    await p.autopilot.configure(who.actor, who.staff.id, 'dummy.draft_note', { mode: 'auto', rules: {} });
    await p.autopilot.enableNow(who.actor, who.staff.id, 'dummy.draft_note');
    await inWorkspace(db, who.workspaceId, async (m) => {
      for (let i = 0; i < 3; i += 1) {
        await p.approvals.recordRejection(m, who.workspaceId, who.staff.id, 'dummy.draft_note');
      }
    });
    expect(await setting(who.workspaceId, who.staff.id, 'dummy.draft_note')).toMatchObject({
      autonomy: 'draft',
      autopilotMode: 'ask',
    });
  });
});

describe('the daily limit', () => {
  it('sends posts past the limit to the inbox, and does not count tomorrow against today', async () => {
    const p = platform();
    const who = await hire(p, 'cap');
    await p.autopilot.configure(who.actor, who.staff.id, 'cap.post', { mode: 'off', rules: { maxPerDay: 2 } });
    await p.autopilot.enableNow(who.actor, who.staff.id, 'cap.post');

    const runOne = async (id: string) => {
      await p.triggers.runNow({
        ...who.actor,
        staffId: who.staff.id,
        taskType: 'cap.post',
        requestId: id,
        taskInput: {},
      });
      for (const due of await p.triggers.dueRuns()) {
        if (due.workspaceId === who.workspaceId) await p.engine.run(due.workspaceId, due.id);
      }
    };
    for (const id of ['a', 'b', 'c']) await runOne(id);

    const outcomes = (await runs(db, who.workspaceId)).map((run) => run.outcome);
    expect(outcomes).toEqual(['completed', 'completed', '1 item(s) for approval']);
    expect((await workItems(db, who.workspaceId)).filter((item) => item.state === 'pending')).toHaveLength(1);

    p.time.advance(25 * 3_600_000);
    await runOne('d');
    expect((await runs(db, who.workspaceId)).at(-1)!.outcome).toBe('completed');
  });
});
