import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { type AppConfig } from '@ai-staff/config';
import { MailDispatcher, PostPublisher, ReplySender, Triggers } from '@ai-staff/core';
import type { Queue } from 'bullmq';
import { APP_CONFIG } from './tokens.js';
import {
  MAIL_QUEUE,
  type MailJob,
  PLATFORM_QUEUE,
  type PlatformJob,
  PUBLISH_QUEUE,
  type PublishJob,
  TASKS_QUEUE,
  type TaskJob,
} from './queues.js';

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
    @Inject(MailDispatcher) private readonly dispatcher: MailDispatcher,
    @Inject(PostPublisher) private readonly publisher: PostPublisher,
    @Inject(ReplySender) private readonly replies: ReplySender,
    @InjectQueue(MAIL_QUEUE) private readonly mail: Queue<MailJob>,
    @InjectQueue(PUBLISH_QUEUE) private readonly publish: Queue<PublishJob>,
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
    await this.platform.upsertJobScheduler(
      'recheck-dns',
      { pattern: '30 3 * * *', tz: 'UTC' },
      { name: 'recheck_dns', data: { kind: 'recheck_dns' } },
    );
    await this.platform.upsertJobScheduler(
      'sync-comments',
      { pattern: '*/5 * * * *', tz: 'UTC' },
      { name: 'sync_comments', data: { kind: 'sync_comments' } },
    );
    // Which feeds are due is decided in Postgres, so a short interval here costs one cheap query.
    await this.platform.upsertJobScheduler(
      'poll-feeds',
      { pattern: '*/10 * * * *', tz: 'UTC' },
      { name: 'poll_feeds', data: { kind: 'poll_feeds' } },
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
      const stuck = await this.dispatcher.reapStuck();
      const sends = await this.dispatcher.due();
      if (sends.length) {
        await this.mail.addBulk(
          sends.map((send) => ({
            name: 'send',
            data: { workspaceId: send.workspaceId, intentId: send.id },
            // One job per intent, attempt and due time, like task runs: a held send that comes due again is a new job.
            opts: { jobId: `send-${send.id}-${send.attempts}-${send.notBefore.getTime()}` },
          })),
        );
      }
      const stuckPosts = await this.publisher.reapStuck();
      const posts = await this.publisher.due();
      if (posts.length) {
        await this.publish.addBulk(
          posts.map((post) => ({
            name: 'publish',
            data: { kind: 'publish' as const, workspaceId: post.workspaceId, intentId: post.id },
            opts: { jobId: `publish-${post.id}-${post.attempts}-${post.notBefore.getTime()}` },
          })),
        );
      }
      // A post the network is still processing (a video) is looked at again when its time comes.
      const looks = await this.publisher.dueChecks();
      if (looks.length) {
        await this.publish.addBulk(
          looks.map((look) => ({
            name: 'check',
            data: { kind: 'check' as const, workspaceId: look.workspaceId, intentId: look.id },
            opts: { jobId: `check-${look.id}-${look.checks}` },
          })),
        );
      }
      const stuckReplies = await this.replies.reapStuck();
      const replies = await this.replies.due();
      if (replies.length) {
        await this.publish.addBulk(
          replies.map((reply) => ({
            name: 'reply',
            data: { kind: 'reply' as const, workspaceId: reply.workspaceId, intentId: reply.id },
            opts: { jobId: `reply-${reply.id}-${reply.attempts}-${reply.notBefore.getTime()}` },
          })),
        );
      }
      // An unclear publish is checked against the network about once a minute until it settles.
      const unclear = await this.publisher.uncertain();
      if (unclear.length) {
        const minute = Math.floor(Date.now() / 60_000);
        await this.publish.addBulk(
          unclear.map((post) => ({
            name: 'reconcile',
            data: { kind: 'reconcile' as const, workspaceId: post.workspaceId, intentId: post.id },
            opts: { jobId: `reconcile-${post.id}-${minute}` },
          })),
        );
      }
      if (
        reaped ||
        scheduled ||
        delivered ||
        due.length ||
        stuck ||
        sends.length ||
        stuckPosts ||
        posts.length ||
        looks.length ||
        unclear.length ||
        stuckReplies ||
        replies.length
      ) {
        this.logger.log(
          {
            reaped,
            scheduled,
            delivered,
            queued: due.length,
            stuck,
            sends: sends.length,
            posts: posts.length,
            unclear: unclear.length,
            stuckPosts,
            replies: replies.length,
            stuckReplies,
          },
          'tick',
        );
      }
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'tick failed');
    } finally {
      this.running = false;
    }
  }
}
