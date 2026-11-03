import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { type AppConfig } from '@ai-staff/config';
import { Triggers } from '@ai-staff/core';
import type { Queue } from 'bullmq';
import { APP_CONFIG } from './tokens.js';
import { PLATFORM_QUEUE, type PlatformJob, TASKS_QUEUE, type TaskJob } from './queues.js';

/**
 * The worker's heartbeat for the platform. Each tick reaps runs from dead workers, creates schedule-slot runs, delivers
 * events, and hands due runs to the tasks queue. Every step is idempotent, so several worker processes can tick at once.
 */
@Injectable()
export class Ticker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(Ticker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(Triggers) private readonly triggers: Triggers,
    @InjectQueue(TASKS_QUEUE) private readonly tasks: Queue<TaskJob>,
    @InjectQueue(PLATFORM_QUEUE) private readonly platform: Queue<PlatformJob>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Nightly at 03:00 UTC. upsertJobScheduler keeps one schedule however many workers start.
    await this.platform.upsertJobScheduler(
      'evaluate-promotions',
      { pattern: '0 3 * * *', tz: 'UTC' },
      { name: 'evaluate_promotions', data: { kind: 'evaluate_promotions' } },
    );
    this.timer = setInterval(() => void this.tick(), this.config.WORKER_TICK_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return; // a slow tick is never overlapped by the next one in the same process
    this.running = true;
    try {
      const reaped = await this.triggers.reapExpiredLeases();
      const scheduled = await this.triggers.schedule();
      const delivered = await this.triggers.dispatchEvents();
      const due = await this.triggers.dueRuns();
      if (due.length) {
        await this.tasks.addBulk(
          due.map((run) => ({
            name: 'run',
            data: { workspaceId: run.workspaceId, runId: run.id },
            // Unique per attempt and due time: a retried run gets a new job, while a run already queued is not duplicated.
            opts: { jobId: `${run.id}:${run.attempts}:${run.runAt.getTime()}` },
          })),
        );
      }
      if (reaped || scheduled || delivered || due.length) {
        this.logger.log({ reaped, scheduled, delivered, queued: due.length }, 'tick');
      }
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'tick failed');
    } finally {
      this.running = false;
    }
  }
}
