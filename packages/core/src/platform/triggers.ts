import { asSystem, type DataSource, type EntityManager, type TaskRun, withTenant } from '@ai-staff/db';
import { CronExpressionParser } from 'cron-parser';
import { v7 as uuidv7 } from 'uuid';
import type { RoleRegistry } from '../roles/registry.js';

export interface DueRun {
  id: string;
  workspaceId: string;
  attempts: number;
  runAt: Date;
}

export interface NewRun {
  workspaceId: string;
  staffId: string;
  taskType: string;
  trigger: TaskRun['trigger'];
  idempotencyKey: string;
  input: Record<string, unknown>;
  runAt: Date;
  maxAttempts?: number;
}

/** Inserts a run unless one with the same idempotency key exists. Returns the new run's id, or null if it existed. */
export async function insertRun(m: EntityManager, run: NewRun): Promise<string | null> {
  // Raw insert so ON CONFLICT can make triggers idempotent; ids stay time-ordered UUID v7 like every entity.
  const id = uuidv7();
  const rows = (await m.query(
    `INSERT INTO task_runs (id, workspace_id, staff_id, task_type, trigger, idempotency_key, input, run_at, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      id,
      run.workspaceId,
      run.staffId,
      run.taskType,
      run.trigger,
      run.idempotencyKey,
      JSON.stringify(run.input),
      run.runAt,
      run.maxAttempts ?? 5,
    ],
  )) as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * Everything that creates task runs, and the reaper that recovers runs from dead workers. The worker calls `tick` on
 * an interval; each step is idempotent (unique idempotency keys, conditional updates), so overlapping ticks or two
 * worker processes cannot create duplicate work.
 */
export class Triggers {
  constructor(
    private readonly db: DataSource,
    private readonly registry: RoleRegistry,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** A person asked for the task now ("suggest now"). `requestId` makes a double click harmless. */
  async runNow(input: {
    workspaceId: string;
    staffId: string;
    taskType: string;
    requestId: string;
    taskInput: Record<string, unknown>;
  }): Promise<string | null> {
    const { task } = this.registry.task(input.taskType);
    return withTenant(this.db, { workspaceId: input.workspaceId, userId: null }, (m) =>
      insertRun(m, {
        workspaceId: input.workspaceId,
        staffId: input.staffId,
        taskType: input.taskType,
        trigger: 'person',
        idempotencyKey: `person:${input.requestId}`,
        input: input.taskInput,
        runAt: this.now(),
        maxAttempts: task.maxAttempts,
      }),
    );
  }

  /**
   * Creates one run per schedule slot. Only the most recent slot is run: a worker that was down for a day does not
   * fire a backlog of 24 hourly reports at once.
   */
  async schedule(): Promise<number> {
    const now = this.now();
    return asSystem(this.db, 'scheduler: create runs for due schedule slots across workspaces', async (m) => {
      const due = (await m.query(
        `SELECT s.id, s.workspace_id, s.staff_id, s.task_type, s.schedule, s.last_slot_at, s.created_at, w.timezone
           FROM staff_task_settings s
           JOIN staff_members st ON st.id = s.staff_id AND st.state = 'active'
           JOIN workspaces w ON w.id = s.workspace_id AND w.state = 'active'
          WHERE s.schedule IS NOT NULL AND s.autonomy <> 'off'
          FOR UPDATE OF s SKIP LOCKED`,
      )) as {
        id: string;
        workspace_id: string;
        staff_id: string;
        task_type: string;
        schedule: string;
        last_slot_at: Date | null;
        created_at: Date;
        timezone: string;
      }[];

      let created = 0;
      for (const setting of due) {
        let slot: Date;
        try {
          slot = CronExpressionParser.parse(setting.schedule, { currentDate: now, tz: setting.timezone })
            .prev()
            .toDate();
        } catch {
          continue; // An invalid schedule is rejected when saved; an old bad row is skipped rather than crashing the tick.
        }
        const since = setting.last_slot_at ?? setting.created_at;
        if (slot <= since) continue;
        // A role switched off in this deployment keeps its rows; skip them rather than stop every workspace's schedule.
        if (!this.registry.hasTask(setting.task_type)) continue;

        const id = await insertRun(m, {
          workspaceId: setting.workspace_id,
          staffId: setting.staff_id,
          taskType: setting.task_type,
          trigger: 'schedule',
          idempotencyKey: `schedule:${setting.id}:${slot.toISOString()}`,
          input: { slot: slot.toISOString() },
          runAt: now,
          maxAttempts: this.registry.task(setting.task_type).task.maxAttempts,
        });
        await m.query(`UPDATE staff_task_settings SET last_slot_at = $2, updated_at = now() WHERE id = $1`, [
          setting.id,
          slot,
        ]);
        if (id) created += 1;
      }
      return created;
    });
  }

  /** Delivers outbox events to every active staff member whose role subscribes to them. */
  async dispatchEvents(limit = 200): Promise<number> {
    return asSystem(this.db, 'event dispatcher: fan out committed domain events to subscribed tasks', async (m) => {
      const events = (await m.query(
        `SELECT id, workspace_id, type, payload FROM domain_events
          WHERE dispatched_at IS NULL ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit],
      )) as { id: string; workspace_id: string; type: string; payload: Record<string, unknown> }[];

      let created = 0;
      for (const event of events) {
        for (const { role, subscription } of this.registry.subscribersOf(event.type)) {
          const input = subscription.input(event.payload);
          if (!input) continue;
          // An event that names a staff member (a reply in that member's conversation) goes to that member only.
          const target = typeof event.payload.staffId === 'string' ? event.payload.staffId : null;
          const staff = (await m.query(
            `SELECT id FROM staff_members
              WHERE workspace_id = $1 AND role_key = $2 AND state = 'active' AND ($3::uuid IS NULL OR id = $3::uuid)`,
            [event.workspace_id, role.key, target],
          )) as { id: string }[];
          for (const member of staff) {
            const id = await insertRun(m, {
              workspaceId: event.workspace_id,
              staffId: member.id,
              taskType: subscription.task,
              trigger: 'event',
              idempotencyKey: `event:${event.id}:${subscription.task}:${member.id}`,
              input,
              runAt: this.now(),
              maxAttempts: this.registry.task(subscription.task).task.maxAttempts,
            });
            if (id) created += 1;
          }
        }
        await m.query(`UPDATE domain_events SET dispatched_at = $2, updated_at = now() WHERE id = $1`, [
          event.id,
          this.now(),
        ]);
      }
      return created;
    });
  }

  /**
   * Puts runs whose worker died back in the queue. The attempt it used still counts, so a run that keeps killing its
   * worker eventually goes dead instead of looping forever.
   */
  async reapExpiredLeases(): Promise<number> {
    return asSystem(this.db, 'lease reaper: requeue runs whose worker stopped holding the lease', async (m) => {
      const rows = (await m.query(
        `UPDATE task_runs
            SET state = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
                lease_until = NULL,
                run_at = $1,
                error = 'The worker stopped before finishing (lease expired).',
                finished_at = CASE WHEN attempts >= max_attempts THEN $1 ELSE NULL END,
                updated_at = $1
          WHERE state = 'running' AND lease_until < $1
          RETURNING id`,
        [this.now()],
      )) as [unknown[], number] | unknown[];
      return Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : (rows as unknown[]).length;
    });
  }

  /** Runs ready to execute now, for the worker to hand to BullMQ (job id = run id, so a run is enqueued once). */
  async dueRuns(limit = 500): Promise<DueRun[]> {
    return asSystem(this.db, 'dispatcher: list task runs that are due to execute', async (m) => {
      const rows = (await m.query(
        `SELECT id, workspace_id, attempts, run_at FROM task_runs
          WHERE state IN ('queued', 'deferred') AND run_at <= $1
          ORDER BY run_at LIMIT $2`,
        [this.now(), limit],
      )) as { id: string; workspace_id: string; attempts: number; run_at: Date }[];
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        attempts: row.attempts,
        runAt: new Date(row.run_at),
      }));
    });
  }
}
