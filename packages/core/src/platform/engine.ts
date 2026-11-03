import {
  ActivityEvent,
  CompanyFact,
  CompanyProfile,
  type DataSource,
  type EntityManager,
  IsNull,
  Not,
  StaffMember,
  StaffTaskSetting,
  TaskRun,
  withTenant,
} from '@ai-staff/db';
import { costUsd, ModelRefusalError, type ModelProvider, worstCaseUsd } from '@ai-staff/llm';
import { Cancel, Defer } from '../errors.js';
import { applyGuardrails } from '../guardrails/index.js';
import type { RoleRegistry } from '../roles/registry.js';
import type { AutonomyLevel, Effect, TaskContext, TaskDefinition } from '../roles/types.js';
import { BudgetService } from './budget.js';
import { assertAllowedAtAutonomy, EffectExecutor } from './effects.js';

export interface EngineLogger {
  info(detail: Record<string, unknown>, message: string): void;
  error(detail: Record<string, unknown>, message: string): void;
}

export interface EngineOptions {
  /** How long a claimed run is ours. A worker that dies mid-run loses it after this, and the reaper requeues it. */
  leaseMs?: number;
  now?: () => Date;
  logger?: EngineLogger;
}

export type RunOutcome =
  | { state: 'skipped' }
  | { state: 'done'; workItemIds: string[]; costUsd: number }
  | { state: 'deferred'; until: Date; reason: string }
  | { state: 'cancelled'; reason: string }
  | { state: 'retrying'; at: Date; error: string }
  | { state: 'dead'; error: string };

const silent: EngineLogger = { info: () => {}, error: () => {} };

/** Exponential back-off: 30 s, 1 min, 2 min … capped at an hour. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 60 * 60_000);
}

/**
 * Runs one task run end to end: claim with a lease, load context, check, reserve budget, call the model, apply
 * guardrails, turn the output into effects, and commit the effects with the run's completion in one transaction.
 *
 * Postgres is the source of truth for runs; BullMQ only executes them (see the worker). That is what makes a killed
 * worker safe: its run's lease expires, the reaper requeues it, and because nothing was committed, it runs again cleanly.
 */
export class TaskEngine {
  private readonly leaseMs: number;
  private readonly now: () => Date;
  private readonly logger: EngineLogger;
  private readonly budget: BudgetService;
  private readonly effects = new EffectExecutor();

  constructor(
    private readonly db: DataSource,
    private readonly registry: RoleRegistry,
    private readonly model: ModelProvider,
    options: EngineOptions = {},
  ) {
    this.leaseMs = options.leaseMs ?? 5 * 60_000;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? silent;
    this.budget = new BudgetService(this.now);
  }

  async run(workspaceId: string, runId: string): Promise<RunOutcome> {
    const claimed = await this.claim(workspaceId, runId);
    if (!claimed) return { state: 'skipped' };

    let reservationId: string | null = null;
    try {
      const { task, ctx } = await this.load(claimed);
      const input = task.inputSchema.safeParse(claimed.input);
      if (!input.success) throw new Cancel(`The input no longer fits this task: ${input.error.message.slice(0, 200)}`);

      let output: unknown;
      let spent = 0;
      let factIds = ctx.facts.map((fact) => fact.id);

      if (task.execute) {
        output = await task.execute(ctx, input.data);
      } else {
        const prompt = await task.buildPrompt!(ctx, input.data);
        factIds = prompt.factIds;
        const choice = task.model!;
        const estimate = worstCaseUsd(choice.name, prompt.system.length + prompt.user.length, choice.maxTokens);

        const reserved = await withTenant(this.db, { workspaceId, userId: null }, (m) =>
          this.budget.reserve(m, {
            workspaceId,
            staffId: ctx.staff.id,
            taskRunId: claimed.id,
            kind: 'model',
            model: choice.name,
            usd: estimate,
            staffDailyCapUsd: ctx.staff.dailyCapUsd,
          }),
        );
        if (!reserved.ok) {
          const which =
            reserved.limit === 'workspace_month' ? "this month's spending cap" : "today's limit for this staff member";
          throw new Defer(reserved.retryAt, `Waiting for budget: ${which} is reached.`);
        }
        reservationId = reserved.reservation.id;

        try {
          const result = await this.model.generate({
            model: choice.name,
            system: prompt.system,
            user: prompt.user,
            schema: task.outputSchema!,
            maxTokens: choice.maxTokens,
            effort: choice.effort,
          });
          output = result.output;
          spent = costUsd(result.model, result.usage);
          await withTenant(this.db, { workspaceId, userId: null }, (m) =>
            this.budget.settle(m, workspaceId, reservationId!, {
              usd: spent,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              model: result.model,
            }),
          );
          reservationId = null;
        } catch (error) {
          if (error instanceof ModelRefusalError) {
            await this.releaseReservation(workspaceId, reservationId!);
            reservationId = null;
            return this.complete(claimed, ctx, task, factIds, 0, [
              {
                type: 'escalate',
                title: `${task.name}: needs you`,
                reason: error.message,
                payload: { input: input.data },
              },
            ]);
          }
          throw error;
        }
      }

      const guarded = applyGuardrails(task.guardrails ?? [], output, ctx);
      const effects: Effect[] = guarded.ok
        ? await task.toEffects(ctx, guarded.output, input.data)
        : [
            {
              type: 'escalate',
              title: `${task.name}: check before it goes anywhere`,
              reason: `${guarded.guardrail}: ${guarded.reason}`,
              payload: { output: guarded.output as Record<string, unknown>, input: input.data },
            },
          ];
      assertAllowedAtAutonomy(effects, ctx.autonomy);
      return await this.complete(claimed, ctx, task, factIds, spent, effects);
    } catch (error) {
      if (reservationId) await this.releaseReservation(workspaceId, reservationId);
      return this.fail(claimed, error);
    }
  }

  /** Takes a due run for this worker: queued or deferred, due now, and not leased by anyone else. */
  private async claim(workspaceId: string, runId: string): Promise<TaskRun | null> {
    return withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const now = this.now();
      const rows = (await m.query(
        `UPDATE task_runs
            SET state = 'running', attempts = attempts + 1, lease_until = $3, updated_at = $2
          WHERE id = $1 AND state IN ('queued', 'deferred') AND run_at <= $2
          RETURNING id`,
        [runId, now, new Date(now.getTime() + this.leaseMs)],
      )) as [{ id: string }[], number] | { id: string }[];
      const updated = Array.isArray(rows[0]) ? (rows[0] as { id: string }[]) : (rows as { id: string }[]);
      if (!updated.length) return null;
      return m.findOneByOrFail(TaskRun, { id: runId });
    });
  }

  private async load(run: TaskRun) {
    const { task } = this.registry.task(run.taskType);
    const workspaceId = run.workspaceId;
    const loaded = await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const staff = await m.findOneBy(StaffMember, { id: run.staffId, workspaceId });
      if (!staff) throw new Cancel('The staff member no longer exists.');
      const setting = await m.findOneBy(StaffTaskSetting, { staffId: staff.id, taskType: run.taskType, workspaceId });
      const profile = await m.findOneBy(CompanyProfile, { workspaceId });
      const facts = await m.find(CompanyFact, {
        where: { workspaceId, supersededAt: IsNull(), confirmedAt: Not(IsNull()) },
        order: { createdAt: 'ASC' },
      });
      return { staff, autonomy: (setting?.autonomy ?? task.defaultAutonomy) as AutonomyLevel, profile, facts };
    });

    if (loaded.staff.state !== 'active') {
      throw new Cancel(`${loaded.staff.displayName} is ${loaded.staff.state}.`);
    }
    if (loaded.autonomy === 'off') throw new Cancel(`${task.name} is turned off for ${loaded.staff.displayName}.`);

    const ctx: TaskContext = {
      workspaceId,
      staff: loaded.staff,
      run,
      facts: loaded.facts,
      profile: loaded.profile,
      autonomy: loaded.autonomy,
      now: this.now(),
      read: (work) => withTenant(this.db, { workspaceId, userId: null }, work),
    };
    return { task: task as TaskDefinition<unknown, unknown>, ctx };
  }

  /** Commits the effects and the run's completion together, only if this worker still holds the run's lease. */
  private async complete(
    run: TaskRun,
    ctx: TaskContext,
    task: TaskDefinition<unknown, unknown>,
    factIds: string[],
    spent: number,
    effects: Effect[],
  ): Promise<RunOutcome> {
    return withTenant(this.db, { workspaceId: run.workspaceId, userId: null }, async (m) => {
      const still = (await m.query(
        `SELECT id FROM task_runs WHERE id = $1 AND state = 'running' AND attempts = $2 FOR UPDATE`,
        [run.id, run.attempts],
      )) as { id: string }[];
      // The lease expired and another worker took over; its result wins, ours is discarded.
      if (!still.length) return { state: 'skipped' } as const;

      const { workItemIds } = await this.effects.execute(
        m,
        {
          workspaceId: run.workspaceId,
          staffId: run.staffId,
          taskType: run.taskType,
          taskRunId: run.id,
          profileVersion: ctx.profile?.version ?? null,
          factIds,
          actor: 'staff',
        },
        effects,
      );
      await m.update(
        TaskRun,
        { id: run.id, workspaceId: run.workspaceId },
        {
          state: 'done',
          leaseUntil: null,
          finishedAt: this.now(),
          profileVersion: ctx.profile?.version ?? null,
          outcome: workItemIds.length ? `${workItemIds.length} item(s) for approval` : 'completed',
          error: null,
        },
      );
      await this.activity(m, run, 'task.completed', `${task.name} finished.`, spent);
      this.logger.info({ runId: run.id, taskType: run.taskType, costUsd: spent }, 'task run done');
      return { state: 'done', workItemIds, costUsd: spent };
    });
  }

  private async fail(run: TaskRun, error: unknown): Promise<RunOutcome> {
    const now = this.now();
    const message = error instanceof Error ? error.message : String(error);
    return withTenant(this.db, { workspaceId: run.workspaceId, userId: null }, async (m) => {
      const owned = { id: run.id, workspaceId: run.workspaceId, state: 'running' as const, attempts: run.attempts };

      if (error instanceof Defer) {
        // A deferral is not a failed attempt: give the attempt back.
        await m.update(TaskRun, owned, {
          state: 'deferred',
          runAt: error.until,
          leaseUntil: null,
          attempts: run.attempts - 1,
          outcome: error.message.slice(0, 300),
        });
        return { state: 'deferred', until: error.until, reason: error.message };
      }
      if (error instanceof Cancel) {
        await m.update(TaskRun, owned, {
          state: 'cancelled',
          leaseUntil: null,
          finishedAt: now,
          outcome: error.message.slice(0, 300),
        });
        return { state: 'cancelled', reason: error.message };
      }
      if (run.attempts >= run.maxAttempts) {
        await m.update(TaskRun, owned, {
          state: 'dead',
          leaseUntil: null,
          finishedAt: now,
          error: message.slice(0, 1000),
        });
        await this.activity(
          m,
          run,
          'task.dead',
          `A ${run.taskType} run failed ${run.attempts} times and stopped.`,
          null,
        );
        this.logger.error({ runId: run.id, taskType: run.taskType, error: message }, 'task run dead');
        return { state: 'dead', error: message };
      }
      const at = new Date(now.getTime() + backoffMs(run.attempts));
      await m.update(TaskRun, owned, {
        state: 'queued',
        runAt: at,
        leaseUntil: null,
        error: message.slice(0, 1000),
      });
      this.logger.info({ runId: run.id, attempt: run.attempts, retryAt: at, error: message }, 'task run will retry');
      return { state: 'retrying', at, error: message };
    });
  }

  private async releaseReservation(workspaceId: string, reservationId: string): Promise<void> {
    await withTenant(this.db, { workspaceId, userId: null }, (m) => this.budget.release(m, workspaceId, reservationId));
  }

  private async activity(m: EntityManager, run: TaskRun, type: string, summary: string, cost: number | null) {
    await m.save(
      m.create(ActivityEvent, {
        workspaceId: run.workspaceId,
        staffId: run.staffId,
        actor: 'staff',
        type,
        summary: summary.slice(0, 300),
        detail: { taskType: run.taskType, taskRunId: run.id },
        costUsd: cost,
      }),
    );
  }
}
