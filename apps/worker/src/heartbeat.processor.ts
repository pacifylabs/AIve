import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { type HeartbeatJob, SYSTEM_QUEUE } from './queues.js';

/**
 * Proves the queue round-trip works end to end. Real task processors (milestone 2) follow the same shape:
 * one processor per queue, typed job data, and no work outside the job's own tenant context.
 */
@Processor(SYSTEM_QUEUE)
export class HeartbeatProcessor extends WorkerHost {
  private readonly logger = new Logger(HeartbeatProcessor.name);

  async process(job: Job<HeartbeatJob>): Promise<{ lagMs: number }> {
    if (job.name !== 'heartbeat') throw new Error(`Unknown job ${job.name} on ${SYSTEM_QUEUE}`);
    const lagMs = Date.now() - new Date(job.data.requestedAt).getTime();
    this.logger.log({ jobId: job.id, lagMs }, 'heartbeat processed');
    return { lagMs };
  }
}
