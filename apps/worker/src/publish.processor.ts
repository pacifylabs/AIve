import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { PostPublisher, ReplySender } from '@ai-staff/core';
import type { Job } from 'bullmq';
import { PUBLISH_QUEUE, type PublishJob } from './queues.js';

/** Publishes one promised post, sends one approved reply, looks again at a post the network is still processing, or checks whether an unclear post went up. All the rules live in the publisher. */
@Processor(PUBLISH_QUEUE, { concurrency: 3 })
export class PublishProcessor extends WorkerHost {
  constructor(
    @Inject(PostPublisher) private readonly publisher: PostPublisher,
    @Inject(ReplySender) private readonly replies: ReplySender,
  ) {
    super();
  }

  process(job: Job<PublishJob>) {
    switch (job.data.kind) {
      case 'publish':
        return this.publisher.dispatch(job.data.workspaceId, job.data.intentId);
      case 'check':
        return this.publisher.check(job.data.workspaceId, job.data.intentId);
      case 'reconcile':
        return this.publisher.reconcile(job.data.workspaceId, job.data.intentId);
      case 'reply':
        return this.replies.dispatch(job.data.workspaceId, job.data.intentId);
    }
  }
}
