import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import {
  AccountHealth,
  AccountStats,
  ApprovalService,
  FeedPoller,
  SocialGateway,
  WebsitePrefill,
} from '@ai-staff/core';
import { ActivityEvent, asSystem, DataSource, Mailbox } from '@ai-staff/db';
import { checkSendingDns, domainOf } from '@ai-staff/mail';
import type { Job } from 'bullmq';
import { PLATFORM_QUEUE, type PlatformJob } from './queues.js';

/** Website prefill on request, the nightly promotion evaluation, comment sync and feed checks. */
@Processor(PLATFORM_QUEUE)
export class PlatformProcessor extends WorkerHost {
  private readonly logger = new Logger(PlatformProcessor.name);

  constructor(
    @Inject(WebsitePrefill) private readonly prefill: WebsitePrefill,
    @Inject(ApprovalService) private readonly approvals: ApprovalService,
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SocialGateway) private readonly social: SocialGateway,
    @Inject(FeedPoller) private readonly feeds: FeedPoller,
    @Inject(AccountHealth) private readonly health: AccountHealth,
    @Inject(AccountStats) private readonly stats: AccountStats,
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
      case 'sync_comments': {
        const result = await this.social.syncComments();
        if (result.filed) this.logger.log(result, 'social comments filed');
        return result;
      }
      case 'poll_feeds':
        return this.pollFeeds();
      case 'capture_stats': {
        const result = await this.stats.capture();
        this.logger.log(result, 'follower counts captured');
        return result;
      }
      case 'check_accounts': {
        const result = await this.health.sweep();
        if (result.renewed || result.warned || result.broken) this.logger.log(result, 'account logins checked');
        return result;
      }
    }
  }

  /** Reads every feed whose time has come, one at a time so a slow site cannot starve the others of the worker. */
  private async pollFeeds() {
    const due = await this.feeds.due();
    let queued = 0;
    for (const feed of due) {
      try {
        const result = await this.feeds.poll(feed.workspaceId, feed.id);
        if (result !== 'skipped') queued += result.queued;
      } catch (error) {
        this.logger.error(
          { feedId: feed.id, error: error instanceof Error ? error.message : String(error) },
          'feed check failed',
        );
      }
    }
    if (due.length) this.logger.log({ feeds: due.length, queued }, 'feeds checked');
    return { feeds: due.length, queued };
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
