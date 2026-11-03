import { Inject, Injectable } from '@nestjs/common';
import {
  AuditEntry,
  ConnectedAccount,
  DataSource,
  type EntityManager,
  In,
  PublishIntent,
  SocialPost,
  withTenant,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

@Injectable()
export class SocialPostsService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  /** Posts for the calendar, oldest first, each with its account's name and what the publisher last said. */
  list(ctx: WorkspaceContext, filter: { from?: Date; to?: Date } = {}) {
    return this.tx(ctx, async (m) => {
      const query = m
        .getRepository(SocialPost)
        .createQueryBuilder('post')
        .where('post.workspaceId = :workspaceId', { workspaceId: ctx.workspaceId })
        .orderBy('post.scheduledFor', 'ASC')
        .limit(200);
      if (filter.from) query.andWhere('post.scheduledFor >= :from', { from: filter.from });
      if (filter.to) query.andWhere('post.scheduledFor < :to', { to: filter.to });
      const posts = await query.getMany();
      const [accounts, intents] = await Promise.all([
        m.find(ConnectedAccount, {
          where: { workspaceId: ctx.workspaceId, id: In([...new Set(posts.map((p) => p.accountId))]) },
        }),
        m.find(PublishIntent, { where: { workspaceId: ctx.workspaceId, postId: In(posts.map((p) => p.id)) } }),
      ]);
      return posts.map((post) => {
        const intent = intents
          .filter((i) => i.postId === post.id)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const account = accounts.find((a) => a.id === post.accountId);
        return {
          ...post,
          account: account
            ? { id: account.id, name: account.name, network: account.network, health: account.health }
            : null,
          publish: intent
            ? { id: intent.id, state: intent.state, error: intent.error, notBefore: intent.notBefore }
            : null,
        };
      });
    });
  }

  /** Stops a post that has not gone out. One that is being sent, or went up, cannot be cancelled from here. */
  cancel(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const post = await m.findOne(SocialPost, {
        where: { workspaceId: ctx.workspaceId, id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!post) throw AppError.notFound('Post not found.');
      if (post.state !== 'scheduled') throw AppError.conflict('That post is not waiting to go out.');
      const result = await m.update(
        PublishIntent,
        { workspaceId: ctx.workspaceId, postId: id, state: 'pending' },
        { state: 'cancelled', error: 'Cancelled by a person.' },
      );
      // An intent already being sent cannot be stopped: the publisher owns it now.
      if (!result.affected) throw AppError.conflict('That post is being sent right now.');
      await m.update(SocialPost, { id }, { state: 'cancelled' });
      await this.audit(m, ctx, 'social.post_cancelled', id);
      return { ok: true };
    });
  }

  /**
   * Settles a post whose outcome could not be confirmed. `published`: the person saw it on the network. `retry`: it
   * is queued again as a new publish. Neither happens automatically, because posting twice is worse than not posting.
   */
  resolve(ctx: WorkspaceContext, id: string, outcome: 'published' | 'retry', permalink?: string) {
    return this.tx(ctx, async (m) => {
      const post = await m.findOne(SocialPost, {
        where: { workspaceId: ctx.workspaceId, id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!post) throw AppError.notFound('Post not found.');
      const intent = await m.findOne(PublishIntent, {
        where: { workspaceId: ctx.workspaceId, postId: id },
        order: { createdAt: 'DESC' },
      });
      if (post.state !== 'failed' || !intent || !['failed', 'uncertain'].includes(intent.state)) {
        throw AppError.conflict('That post is not waiting for you to settle it.');
      }
      if (outcome === 'published') {
        await m.update(PublishIntent, { id: intent.id }, { state: 'sent', error: null });
        await m.update(
          SocialPost,
          { id },
          { state: 'published', publishedAt: new Date(), permalink: permalink ?? null },
        );
      } else {
        await m.update(SocialPost, { id }, { state: 'scheduled', scheduledFor: new Date() });
        await m.save(
          m.create(PublishIntent, {
            workspaceId: ctx.workspaceId,
            staffId: post.staffId,
            accountId: post.accountId,
            postId: id,
            idempotencyKey: `retry:${id}:${uuidv7()}`,
            state: 'pending',
            notBefore: new Date(),
            claimedAt: null,
            attempts: 0,
            error: null,
            externalPostId: null,
          }),
        );
      }
      await this.audit(m, ctx, `social.post_resolved_${outcome}`, id);
      return { ok: true };
    });
  }

  private audit(m: EntityManager, ctx: WorkspaceContext, action: string, target: string) {
    return m.save(
      m.create(AuditEntry, { workspaceId: ctx.workspaceId, userId: ctx.userId, action, target, detail: {} }),
    );
  }
}
