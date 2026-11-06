import { Inject, Injectable } from '@nestjs/common';
import { FeedError, FeedPoller } from '@ai-staff/core';
import {
  ConnectedAccount,
  ContentFeed,
  DataSource,
  type EntityManager,
  FeedItem,
  In,
  StaffMember,
  StaffTaskSetting,
  withTenant,
} from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

const TASK = 'social_media.draft_from_article';
const SHOWN_ARTICLES = 5;

@Injectable()
export class SocialFeedsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(FeedPoller) private readonly poller: FeedPoller,
  ) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  list(ctx: WorkspaceContext) {
    return this.tx(ctx, async (m) => {
      const feeds = await m.find(ContentFeed, { where: { workspaceId: ctx.workspaceId }, order: { createdAt: 'ASC' } });
      return Promise.all(
        feeds.map(async (feed) => ({
          ...feed,
          articles: await m.find(FeedItem, {
            where: { workspaceId: ctx.workspaceId, feedId: feed.id },
            order: { createdAt: 'DESC' },
            take: SHOWN_ARTICLES,
            select: { id: true, title: true, link: true, publishedAt: true, state: true, createdAt: true },
          }),
        })),
      );
    });
  }

  /** Reads the address first, so a page that is not a feed is refused with a reason instead of saved and left failing. */
  async add(ctx: WorkspaceContext, body: { url: string; accountIds: string[]; note?: string }) {
    try {
      await this.poller.preview(body.url);
    } catch (error) {
      if (error instanceof FeedError) {
        throw new AppError(400, 'validation_failed', error.message, {
          errors: [{ path: 'url', message: error.message }],
        });
      }
      throw error;
    }
    const feed = await this.tx(ctx, async (m) => {
      const staff = await m.findOne(StaffMember, {
        where: { workspaceId: ctx.workspaceId, roleKey: 'social_media', state: 'active' },
        order: { createdAt: 'ASC' },
      });
      if (!staff) throw AppError.conflict('Hire a Social Media Staff member first.');
      await this.assertAccounts(m, ctx, body.accountIds);
      if (await m.existsBy(ContentFeed, { workspaceId: ctx.workspaceId, url: body.url })) {
        throw AppError.conflict('That feed is already added.');
      }
      // Staff hired before feeds existed have no setting for the new task; the engine falls back to the default.
      if (!(await m.existsBy(StaffTaskSetting, { staffId: staff.id, taskType: TASK }))) {
        await m.save(
          m.create(StaffTaskSetting, {
            workspaceId: ctx.workspaceId,
            staffId: staff.id,
            taskType: TASK,
            autonomy: 'draft',
            schedule: null,
            limits: {},
            lastSlotAt: null,
          }),
        );
      }
      return m.save(
        m.create(ContentFeed, {
          workspaceId: ctx.workspaceId,
          staffId: staff.id,
          url: body.url,
          title: null,
          accountIds: body.accountIds,
          note: body.note || null,
          state: 'active',
          lastCheckedAt: null,
          nextCheckAt: new Date(),
          failures: 0,
          lastError: null,
          createdBy: ctx.userId,
        }),
      );
    });
    // The first read happens now, so the person sees the newest article drafted without waiting for the worker.
    const result = await this.poller.poll(ctx.workspaceId, feed.id);
    return { id: feed.id, queued: result === 'skipped' ? 0 : result.queued };
  }

  update(
    ctx: WorkspaceContext,
    id: string,
    body: { accountIds?: string[]; note?: string | null; paused?: boolean },
  ) {
    return this.tx(ctx, async (m) => {
      const feed = await this.find(m, ctx, id);
      if (body.accountIds) {
        await this.assertAccounts(m, ctx, body.accountIds);
        feed.accountIds = body.accountIds;
      }
      if (body.note !== undefined) feed.note = body.note || null;
      if (body.paused !== undefined) {
        feed.state = body.paused ? 'paused' : 'active';
        if (!body.paused) Object.assign(feed, { failures: 0, lastError: null, nextCheckAt: new Date() });
      }
      await m.save(feed);
      return { id: feed.id, state: feed.state };
    });
  }

  /** Reads the feed now. A feed that stopped after repeated failures is switched back on by a person asking. */
  async checkNow(ctx: WorkspaceContext, id: string) {
    await this.tx(ctx, async (m) => {
      const feed = await this.find(m, ctx, id);
      if (feed.state === 'paused') throw AppError.conflict('That feed is paused. Resume it first.');
      if (feed.state === 'error') await m.save(Object.assign(feed, { state: 'active' as const, failures: 0 }));
    });
    const result = await this.poller.poll(ctx.workspaceId, id);
    const after = await this.tx(ctx, (m) => this.find(m, ctx, id));
    return {
      queued: result === 'skipped' ? 0 : result.queued,
      state: after.state,
      lastError: after.lastError,
    };
  }

  remove(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const feed = await this.find(m, ctx, id);
      await m.delete(FeedItem, { workspaceId: ctx.workspaceId, feedId: feed.id });
      await m.delete(ContentFeed, { workspaceId: ctx.workspaceId, id: feed.id });
    });
  }

  private async find(m: EntityManager, ctx: WorkspaceContext, id: string) {
    const feed = await m.findOneBy(ContentFeed, { workspaceId: ctx.workspaceId, id });
    if (!feed) throw AppError.notFound('Feed not found.');
    return feed;
  }

  private async assertAccounts(m: EntityManager, ctx: WorkspaceContext, ids: string[]) {
    const found = await m.find(ConnectedAccount, { where: { workspaceId: ctx.workspaceId, id: In(ids) } });
    if (found.length !== new Set(ids).size) {
      throw new AppError(400, 'validation_failed', 'One of those accounts is not connected.', {
        errors: [{ path: 'accountIds', message: 'One of those accounts is not connected.' }],
      });
    }
  }
}
