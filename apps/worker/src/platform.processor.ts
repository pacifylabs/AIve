import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ApprovalService, WebsitePrefill } from '@ai-staff/core';
import { ActivityEvent, asSystem, DataSource, Mailbox } from '@ai-staff/db';
import { checkSendingDns, domainOf } from '@ai-staff/mail';
import type { Job } from 'bullmq';
import { PLATFORM_QUEUE, type PlatformJob } from './queues.js';

/** Website prefill on request, and the nightly promotion evaluation. */
@Processor(PLATFORM_QUEUE)
export class PlatformProcessor extends WorkerHost {
  private readonly logger = new Logger(PlatformProcessor.name);

  constructor(
    @Inject(WebsitePrefill) private readonly prefill: WebsitePrefill,
    @Inject(ApprovalService) private readonly approvals: ApprovalService,
    @Inject(DataSource) private readonly db: DataSource,
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
      case 'recheck_dns':
        return this.recheckDns();
    }
  }

  /** A verified mailbox whose SPF or DMARC record has gone is paused: mail from it would be spoofable or blocked. */
  private async recheckDns() {
    return asSystem(this.db, 'daily DNS re-check of verified sending domains', async (m) => {
      const mailboxes = await m.find(Mailbox, { where: { provider: 'smtp' } });
      let paused = 0;
      for (const mailbox of mailboxes) {
        const report = await checkSendingDns(domainOf(mailbox.address));
        const broken = !report.spf || !report.dmarc;
        await m.update(
          Mailbox,
          { id: mailbox.id },
          {
            spfOk: report.spf,
            dkimOk: report.dkim,
            dmarcOk: report.dmarc,
            dnsCheckedAt: new Date(),
            ...(broken && mailbox.status === 'verified'
              ? {
                  status: 'paused' as const,
                  lastError: 'SPF or DMARC is missing for this domain, so sending is paused.',
                }
              : {}),
          },
        );
        if (broken && mailbox.status === 'verified') {
          paused += 1;
          await m.save(
            m.create(ActivityEvent, {
              workspaceId: mailbox.workspaceId,
              staffId: null,
              actor: 'system',
              type: 'mailbox.paused',
              summary: `${mailbox.address} is paused: its SPF or DMARC record is missing.`,
              detail: { spf: report.spf, dmarc: report.dmarc },
              costUsd: null,
            }),
          );
        }
      }
      return { checked: mailboxes.length, paused };
    });
  }
}
