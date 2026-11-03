import {
  CompanyProfile,
  type DataSource,
  SpendCap,
  StaffMember,
  StaffTaskSetting,
  UsageReservation,
  WorkItem,
} from '@ai-staff/db';
import { type FakeReply, FakeModelProvider, type GenerateRequest, ModelRefusalError } from '@ai-staff/llm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  ApprovalService,
  CompanyBrain,
  dummyRole,
  hireStaff,
  OPT_OUT_LINE,
  type RoleDefinition,
  RoleRegistry,
  TaskEngine,
  Triggers,
} from '../src/index.js';
import { activity, clock, connect, events, inWorkspace, runs, seedWorkspace, workItems } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

/** Fake model that writes a note citing the confirmed price, unless a test scripts something else. */
const goodNote = (title = 'Our Starter plan'): FakeReply => ({
  output: { title, body: 'The Starter plan is $1,200 a year.' },
});

function platform(
  reply: (request: GenerateRequest<z.ZodType>) => FakeReply = () => goodNote(),
  at = '2026-11-03T09:30:00Z',
) {
  const time = clock(at);
  const registry = new RoleRegistry().register(dummyRole);
  const model = new FakeModelProvider(reply);
  return {
    time,
    registry,
    model,
    engine: new TaskEngine(db, registry, model, { now: time.now, leaseMs: 60_000 }),
    triggers: new Triggers(db, registry, time.now),
    approvals: new ApprovalService(db, registry, time.now),
    brain: new CompanyBrain(db, time.now),
  };
}

async function setup(p: ReturnType<typeof platform>) {
  const ws = await seedWorkspace(db);
  const actor = { workspaceId: ws.workspaceId, userId: ws.userId };
  await p.brain.addFact(actor, 'price', 'Starter plan: $1,200 a year');
  const staff = await inWorkspace(db, ws.workspaceId, async (m) => {
    const created = await hireStaffIn(p, actor);
    // Hired yesterday, so this morning's 09:00 slot is due.
    await m.query(`UPDATE staff_task_settings SET created_at = $2 WHERE staff_id = $1`, [
      created.id,
      new Date('2026-11-02T10:00:00Z'),
    ]);
    return created;
  });
  return { ...ws, actor, staff };
}

const hireStaffIn = (p: ReturnType<typeof platform>, actor: { workspaceId: string; userId: string }) =>
  hireStaff(db, p.registry, actor, { roleKey: 'dummy', displayName: 'Dee', settings: {} });

/** Runs the due work of one workspace. Tests share a database, so other tests' runs are left alone. */
async function runAllDue(p: ReturnType<typeof platform>, workspaceId: string) {
  const outcomes = [];
  for (const due of await p.triggers.dueRuns()) {
    if (due.workspaceId === workspaceId) outcomes.push(await p.engine.run(due.workspaceId, due.id));
  }
  return outcomes;
}

describe('milestone 2 exit: a role runs end to end', () => {
  it('runs on schedule, reserves budget, calls the model, lands a work item, and approval creates an effect', async () => {
    const p = platform();
    const { workspaceId, userId, staff } = await setup(p);

    expect(await p.triggers.schedule()).toBe(1);
    expect(await p.triggers.schedule()).toBe(0); // the same slot is never scheduled twice

    const [outcome] = await runAllDue(p, workspaceId);
    expect(outcome).toMatchObject({ state: 'done' });
    const [item] = await workItems(db, workspaceId);
    expect(item).toMatchObject({ state: 'pending', kind: 'note_draft', staffId: staff.id });
    // The guardrail appended a way to stop; the model only saw confirmed facts.
    expect(String(item!.payload.body).endsWith(OPT_OUT_LINE)).toBe(true);
    expect(p.model.calls[0]!.user).toContain('$1,200');

    const reservations = await inWorkspace(db, workspaceId, (m) =>
      m.find(UsageReservation, { where: { workspaceId } }),
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.state).toBe('settled');

    const approved = await p.approvals.approve({ workspaceId, userId }, item!.id, {
      ...item!.payload,
      title: 'Our Starter plan, explained',
    });
    expect(approved.state).toBe('edited');
    expect(approved.editRatio).toBeGreaterThan(0);

    const event = (await events(db, workspaceId)).find((candidate) => candidate.type === 'dummy.note_approved');
    expect(event).toMatchObject({ type: 'dummy.note_approved', payload: { title: 'Our Starter plan, explained' } });

    // The subscribed task picks the event up and runs.
    expect(await p.triggers.dispatchEvents()).toBe(1);
    const [recorded] = await runAllDue(p, workspaceId);
    expect(recorded).toMatchObject({ state: 'done' });
    const log = await activity(db, workspaceId);
    expect(log.some((entry) => entry.summary.includes('Our Starter plan, explained'))).toBe(true);
  });

  it('recovers when a worker dies mid-run, without duplicating the work', async () => {
    let release: () => void = () => {};
    let call = 0;
    const p = platform();
    const slow = new FakeModelProvider(() => goodNote());
    // The first worker hangs inside the model call, as if its process were killed.
    const hangingModel = {
      generate: async <T extends z.ZodType>(request: GenerateRequest<T>) => {
        call += 1;
        if (call === 1) await new Promise<void>((resolve) => (release = resolve));
        return slow.generate(request);
      },
    };
    const deadWorker = new TaskEngine(db, p.registry, hangingModel, { now: p.time.now, leaseMs: 60_000 });
    const { workspaceId } = await setup(p);
    await p.triggers.schedule();
    const due = (await p.triggers.dueRuns()).find((candidate) => candidate.workspaceId === workspaceId);

    const firstAttempt = deadWorker.run(due!.workspaceId, due!.id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await runs(db, workspaceId))[0]!.state).toBe('running');

    // The lease runs out; the reaper puts the run back, and a healthy worker finishes it.
    p.time.advance(61_000);
    expect(await p.triggers.reapExpiredLeases()).toBe(1);
    const [second] = await runAllDue(p, workspaceId);
    expect(second).toMatchObject({ state: 'done' });

    // The original worker wakes up late: its result is discarded.
    release();
    expect(await firstAttempt).toEqual({ state: 'skipped' });
    expect(await workItems(db, workspaceId)).toHaveLength(1);
    expect((await runs(db, workspaceId))[0]).toMatchObject({ state: 'done', attempts: 2 });
  });
});

describe('task outcomes', () => {
  it('retries failures with back-off, then marks the run dead with an alert', async () => {
    const p = platform(() => ({ error: new Error('model timeout') }));
    const { workspaceId, actor } = await setup(p);
    const request = {
      ...actor,
      staffId: (await hireStaffIn(p, actor)).id,
      taskType: 'dummy.draft_note',
      requestId: 'req-1',
      taskInput: {},
    };
    const runId = await p.triggers.runNow(request);
    // A double click with the same request id does not create a second run.
    expect(await p.triggers.runNow(request)).toBeNull();

    const first = await p.engine.run(workspaceId, runId!);
    expect(first).toMatchObject({ state: 'retrying', error: 'model timeout' });
    expect(await p.engine.run(workspaceId, runId!)).toEqual({ state: 'skipped' }); // not due yet
    p.time.advance(31_000);
    expect(await p.engine.run(workspaceId, runId!)).toMatchObject({ state: 'retrying' });
    p.time.advance(61_000);
    expect(await p.engine.run(workspaceId, runId!)).toMatchObject({ state: 'dead' });

    const log = await activity(db, workspaceId);
    expect(log.some((entry) => entry.type === 'task.dead')).toBe(true);
    // Each failed call released its money.
    const reservations = await inWorkspace(db, workspaceId, (m) =>
      m.find(UsageReservation, { where: { workspaceId } }),
    );
    expect(reservations.every((r) => r.state === 'released')).toBe(true);
  });

  it('cancels a queued run when its staff member is paused before it executes', async () => {
    const p = platform();
    const { workspaceId, staff } = await setup(p);
    await p.triggers.schedule();
    await inWorkspace(db, workspaceId, (m) => m.update(StaffMember, { id: staff.id }, { state: 'paused' }));
    const [outcome] = await runAllDue(p, workspaceId);
    expect(outcome).toMatchObject({ state: 'cancelled' });
    expect(await workItems(db, workspaceId)).toHaveLength(0);
  });

  it('schedules nothing for a paused staff member', async () => {
    const p = platform();
    const { workspaceId, staff } = await setup(p);
    await inWorkspace(db, workspaceId, (m) => m.update(StaffMember, { id: staff.id }, { state: 'paused' }));
    await p.triggers.schedule();
    expect(await runs(db, workspaceId)).toHaveLength(0);
  });

  it('turns a guardrail failure into a flagged item instead of acting or dropping it', async () => {
    const p = platform(() => ({ output: { title: 'Sale', body: 'Get 20% off this week only.' } }));
    const { workspaceId } = await setup(p);
    await p.triggers.schedule();
    await runAllDue(p, workspaceId);
    const [item] = await workItems(db, workspaceId);
    expect(item).toMatchObject({ kind: 'escalation', onApprove: [] });
    expect(item!.flaggedReason).toMatch(/factsOnly.*20%/);
  });

  it('hands a model refusal to a person', async () => {
    const p = platform(() => ({ error: new ModelRefusalError('cyber') }));
    const { workspaceId } = await setup(p);
    await p.triggers.schedule();
    const [outcome] = await runAllDue(p, workspaceId);
    expect(outcome).toMatchObject({ state: 'done' });
    expect((await workItems(db, workspaceId))[0]).toMatchObject({ kind: 'escalation' });
  });

  it('defers instead of spending past the monthly cap, without counting a failed attempt', async () => {
    const p = platform();
    // A variant of the dummy task on a priced model, so the reservation is above zero.
    const priced: RoleDefinition = {
      ...dummyRole,
      key: 'priced',
      tasks: dummyRole.tasks
        .filter((task) => task.type === 'dummy.draft_note')
        .map((task) => ({ ...task, type: 'priced.draft_note', model: { name: 'claude-haiku-5-5', maxTokens: 500 } })),
      subscribes: [],
    };
    const registry = new RoleRegistry().register(priced);
    const engine = new TaskEngine(db, registry, p.model, { now: p.time.now });
    const triggers = new Triggers(db, registry, p.time.now);
    const { workspaceId, userId } = await seedWorkspace(db);
    const staff = await hireStaff(
      db,
      registry,
      { workspaceId, userId },
      { roleKey: 'priced', displayName: 'P', settings: {} },
    );
    await inWorkspace(db, workspaceId, (m) =>
      m.save(m.create(SpendCap, { workspaceId, monthlyCapUsd: 0.0001, alertAtPct: 80 })),
    );
    const runId = await triggers.runNow({
      workspaceId,
      staffId: staff.id,
      taskType: 'priced.draft_note',
      requestId: 'r',
      taskInput: {},
    });
    const outcome = await engine.run(workspaceId, runId!);
    expect(outcome).toMatchObject({ state: 'deferred' });
    if (outcome.state === 'deferred') expect(outcome.until.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect((await runs(db, workspaceId))[0]).toMatchObject({ state: 'deferred', attempts: 0 });
  });
});

describe('company brain', () => {
  it('withdraws pending drafts that used a fact when the fact changes, and moves the version on', async () => {
    const p = platform();
    const { workspaceId, actor } = await setup(p);
    await p.triggers.schedule();
    await runAllDue(p, workspaceId);
    const before = await inWorkspace(db, workspaceId, (m) => m.findOneByOrFail(CompanyProfile, { workspaceId }));
    const { facts } = await p.brain.profile(workspaceId, actor.userId);

    await p.brain.updateFact(actor, facts[0]!.id, 'Starter plan: $1,500 a year');

    const [item] = await workItems(db, workspaceId);
    expect(item!.state).toBe('superseded');
    const after = await inWorkspace(db, workspaceId, (m) => m.findOneByOrFail(CompanyProfile, { workspaceId }));
    expect(after.version).toBe(before.version + 1);
    expect((await events(db, workspaceId)).some((event) => event.type === 'company.facts_changed')).toBe(true);
  });

  it('keeps website suggestions away from staff until a person confirms them', async () => {
    const p = platform();
    const { workspaceId, actor } = await setup(p);
    await inWorkspace(db, workspaceId, (m) =>
      m.query(
        `INSERT INTO company_facts (id, workspace_id, profile_version, kind, text, source)
         VALUES (gen_random_uuid(), $1, 1, 'claim', 'Unconfirmed: 99 awards', 'website')`,
        [workspaceId],
      ),
    );
    await p.triggers.runNow({
      ...actor,
      staffId: (await hireStaffIn(p, actor)).id,
      taskType: 'dummy.draft_note',
      requestId: 'b',
      taskInput: {},
    });
    await runAllDue(p, workspaceId);
    expect(p.model.calls.at(-1)!.user).not.toContain('99 awards');
  });
});

describe('autonomy', () => {
  it('offers promotion after a clean record and lets only a person accept it', async () => {
    const p = platform();
    const { workspaceId, userId, actor, staff } = await setup(p);
    for (const id of ['a', 'b', 'c']) {
      await p.triggers.runNow({
        ...actor,
        staffId: staff.id,
        taskType: 'dummy.draft_note',
        requestId: id,
        taskInput: {},
      });
    }
    await runAllDue(p, workspaceId);
    for (const item of await workItems(db, workspaceId)) await p.approvals.approve({ workspaceId, userId }, item.id);

    expect(await p.approvals.evaluatePromotions()).toBeGreaterThanOrEqual(1);
    const setting = () =>
      inWorkspace(db, workspaceId, (m) =>
        m.findOneByOrFail(StaffTaskSetting, { staffId: staff.id, taskType: 'dummy.draft_note' }),
      );
    expect((await setting()).autonomy).toBe('draft'); // offered, not applied

    const [offer] = (await inWorkspace(db, workspaceId, (m) =>
      m.query(`SELECT id FROM promotion_offers WHERE staff_id = $1 AND state = 'offered'`, [staff.id]),
    )) as { id: string }[];
    await p.approvals.decidePromotion({ workspaceId, userId }, offer!.id, true);
    expect((await setting()).autonomy).toBe('act');

    // Three rejections in a row while acting alone send it back to drafts.
    await inWorkspace(db, workspaceId, async (m) => {
      for (let i = 0; i < 3; i += 1) await p.approvals.recordRejection(m, workspaceId, staff.id, 'dummy.draft_note');
    });
    expect(await setting()).toMatchObject({ autonomy: 'draft' });
  });

  it('only lets approval happen once', async () => {
    const p = platform();
    const { workspaceId, userId } = await setup(p);
    await p.triggers.schedule();
    await runAllDue(p, workspaceId);
    const [item] = await workItems(db, workspaceId);
    await p.approvals.approve({ workspaceId, userId }, item!.id);
    await expect(p.approvals.reject({ workspaceId, userId }, item!.id, 'late')).rejects.toThrow(/already been decided/);
  });
});

describe('tenancy', () => {
  it("never shows one workspace the other workspace's work", async () => {
    const p = platform();
    const a = await setup(p);
    const b = await seedWorkspace(db);
    await p.triggers.schedule();
    await runAllDue(p, a.workspaceId);
    expect((await workItems(db, a.workspaceId)).length).toBeGreaterThan(0);
    const leaked = await inWorkspace(db, b.workspaceId, (m) => m.find(WorkItem, {}));
    expect(leaked).toHaveLength(0);
  });
});
