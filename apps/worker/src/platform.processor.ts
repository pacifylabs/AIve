import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ApprovalService, WebsitePrefill } from '@ai-staff/core';
import type { Job } from 'bullmq';
import { PLATFORM_QUEUE, type PlatformJob } from './queues.js';

/** Website prefill on request, and the nightly promotion evaluation. */
@Processor(PLATFORM_QUEUE)
export class PlatformProcessor extends WorkerHost {
  private readonly logger = new Logger(PlatformProcessor.name);

  constructor(
    @Inject(WebsitePrefill) private readonly prefill: WebsitePrefill,
    @Inject(ApprovalService) private readonly approvals: ApprovalService,
  ) {
    super();
  }

  async process(job: Job<PlatformJob>) {
    switch (job.data.kind) {
      case 'prefill': {
        const result = await this.prefill.run(job.data.workspaceId);
        this.logger.log({ workspaceId: job.data.workspaceId, ...result }, 'website prefill finished');
        return result;
      }
      case 'evaluate_promotions': {
        const offered = await this.approvals.evaluatePromotions();
        this.logger.log({ offered }, 'promotion evaluation finished');
        return { offered };
      }
    }
  }
}
