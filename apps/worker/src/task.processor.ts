import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { TaskEngine } from '@ai-staff/core';
import type { Job } from 'bullmq';
import { TASKS_QUEUE, type TaskJob } from './queues.js';

/** Executes task runs. Everything that matters (claim, lease, retries, effects) happens in the engine, in Postgres. */
@Processor(TASKS_QUEUE, { concurrency: 5 })
export class TaskProcessor extends WorkerHost {
  constructor(@Inject(TaskEngine) private readonly engine: TaskEngine) {
    super();
  }

  async process(job: Job<TaskJob>) {
    return this.engine.run(job.data.workspaceId, job.data.runId);
  }
}
