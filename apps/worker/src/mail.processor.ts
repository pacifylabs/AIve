import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { MailDispatcher } from '@ai-staff/core';
import type { Job } from 'bullmq';
import { MAIL_QUEUE, type MailJob } from './queues.js';

/** Sends one promised email. Claiming, policy checks and uncertain handling all live in the dispatcher. */
@Processor(MAIL_QUEUE, { concurrency: 5 })
export class MailProcessor extends WorkerHost {
  constructor(@Inject(MailDispatcher) private readonly dispatcher: MailDispatcher) {
    super();
  }

  process(job: Job<MailJob>) {
    return this.dispatcher.dispatch(job.data.workspaceId, job.data.intentId);
  }
}
