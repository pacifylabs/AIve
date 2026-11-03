import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { PostPublisher } from '@ai-staff/core';
import type { Job } from 'bullmq';
import { PUBLISH_QUEUE, type PublishJob } from './queues.js';

/** Publishes one promised post, or checks whether an unclear one went up. All the rules live in the publisher. */
@Processor(PUBLISH_QUEUE, { concurrency: 3 })
export class PublishProcessor extends WorkerHost {
  constructor(@Inject(PostPublisher) private readonly publisher: PostPublisher) {
    super();
  }

  process(job: Job<PublishJob>) {
    return job.data.kind === 'publish'
      ? this.publisher.dispatch(job.data.workspaceId, job.data.intentId)
      : this.publisher.reconcile(job.data.workspaceId, job.data.intentId);
  }
}
