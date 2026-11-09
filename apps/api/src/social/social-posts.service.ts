import { Inject, Injectable } from '@nestjs/common';
import {
  createPublishIntent,
  lengthProblem,
  postProblem,
  type Recurrence,
  RecurringPosts,
  zonedTimeToUtc,
} from '@ai-staff/core';
import {
  AuditEntry,
  ConnectedAccount,
  DataSource,
  type EntityManager,
  In,
  PublishIntent,
  PostSchedule,
  PostTag,
  SocialPost,
  StaffMember,
  Workspace,
  withTenant,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import { SocialProviders } from '@ai-staff/social';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';
import { tagExists } from './post-library.service.js';

interface EditInput {
  /** The `updatedAt` of the post the person was looking at. */
  expectedUpdatedAt: string;
  body?: string | undefined;
  firstComment?: string | null | undefined;
  linkUrl?: string | null | undefined;
  mediaUrls?: string[] | undefined;
  followUps?: string[] | undefined;
  scheduledFor?: string | undefined;
  scheduledLocal?: string | undefined;
}

interface ComposeInput {
  requestId: string;
  accountIds: string[];
  body: string;
  firstComment?: string | undefined;
  mediaUrls: string[];
  followUps: string[];
  linkUrl?: string | undefined;
  tagId?: string | undefined;
  repeat?: Recurrence | undefined;
  repeatEndsOn?: string | undefined;
  scheduledLocal?: string | undefined;
}

@Injectable()
export class SocialPostsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SocialProviders) private readonly providers: SocialProviders,
    @Inject(RecurringPosts) private readonly recurring: RecurringPosts,
  ) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  /** Posts for the calendar, oldest first, each with its account's name and what the publisher last said. */
  list(ctx: WorkspaceContext, filter: { from?: Date; to?: Date; tagId?: string } = {}) {
    return this.tx(ctx, async (m) => {
      const query = m
        .getRepository(SocialPost)
        .createQueryBuilder('post')
        .where('post.workspaceId = :workspaceId', { workspaceId: ctx.workspaceId })
        .orderBy('post.scheduledFor', 'ASC')
        .limit(200);
      if (filter.from) query.andWhere('post.scheduledFor >= :from', { from: filter.from });
      if (filter.to) query.andWhere('post.scheduledFor < :to', { to: filter.to });
      if (filter.tagId) query.andWhere('post.tagId = :tagId', { tagId: filter.tagId });
      const posts = await query.getMany();
      const [accounts, intents, tags] = await Promise.all([
        m.find(ConnectedAccount, {
          where: { workspaceId: ctx.workspaceId, id: In([...new Set(posts.map((p) => p.accountId))]) },
        }),
        m.find(PublishIntent, { where: { workspaceId: ctx.workspaceId, postId: In(posts.map((p) => p.id)) } }),
        m.find(PostTag, { where: { workspaceId: ctx.workspaceId } }),
      ]);
      return posts.map((post) => {
        const intent = intents
          .filter((i) => i.postId === post.id)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const account = accounts.find((a) => a.id === post.accountId);
        const tag = tags.find((t) => t.id === post.tagId);
        return {
          ...post,
          tag: tag ? { id: tag.id, name: tag.name, colour: tag.colour } : null,
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

  /** Everything about the words and media of a post that a network would refuse, for one account. */
  private contentProblems(
    account: ConnectedAccount,
    input: { body: string; linkUrl?: string | undefined; mediaUrls: string[]; followUps: string[] },
  ) {
    const problems: { path: string; message: string }[] = [];
    const problem = postProblem({
      network: account.network,
      body: input.body,
      linkUrl: input.linkUrl,
      mediaUrls: input.mediaUrls,
    });
    if (problem) problems.push({ path: 'body', message: `${account.name}: ${problem}` });
    if (input.followUps.length) {
      if (!this.providers.get(account.network).addComment) {
        problems.push({
          path: 'followUps',
          message: `${account.name}: ${account.network} cannot post a chain of replies.`,
        });
      }
      input.followUps.forEach((part, index) => {
        const tooLong = lengthProblem({ network: account.network, body: part });
        if (tooLong) problems.push({ path: 'followUps', message: `${account.name}, part ${index + 2}: ${tooLong}` });
      });
    }
    return problems;
  }

  /**
   * Changes a post that has not gone out: its words, link, pictures, replies, comment or time. Refused once it is being sent,
   * and refused when the person's copy is older than the saved one (someone else changed it, or it was edited elsewhere),
   * so one edit never silently overwrites another. The same checks as writing it new run against its account.
   */
  edit(ctx: WorkspaceContext, id: string, input: EditInput) {
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
      if (post.state !== 'scheduled' || !intent || intent.state !== 'pending') {
        throw AppError.conflict('That post is already being sent or has gone out, so it can no longer be changed.');
      }
      if (new Date(input.expectedUpdatedAt).getTime() !== post.updatedAt.getTime()) {
        throw AppError.conflict('This post was changed after you opened it. Reload it and try again.');
      }
      const account = await m.findOneByOrFail(ConnectedAccount, { workspaceId: ctx.workspaceId, id: post.accountId });
      const next = {
        body: input.body ?? post.body,
        firstComment: input.firstComment === undefined ? post.firstComment : input.firstComment,
        linkUrl: input.linkUrl === undefined ? post.linkUrl : input.linkUrl,
        media: input.mediaUrls ?? post.media,
        followUps: input.followUps ?? post.followUps,
      };
      const problems = this.contentProblems(account, {
        body: next.body,
        linkUrl: next.linkUrl ?? undefined,
        mediaUrls: next.media,
        followUps: next.followUps,
      });
      let when = post.scheduledFor;
      if (input.scheduledFor || input.scheduledLocal) {
        if (input.scheduledFor) {
          when = new Date(input.scheduledFor);
        } else {
          const workspace = await m.findOneByOrFail(Workspace, { id: ctx.workspaceId });
          const [date, time] = input.scheduledLocal!.split('T') as [string, string];
          when = zonedTimeToUtc(date, time, workspace.timezone);
        }
        const now = Date.now();
        if (Number.isNaN(when.getTime()))
          problems.push({ path: 'scheduledLocal', message: 'That is not a real time.' });
        else if (when.getTime() < now - 5 * 60_000) {
          problems.push({ path: 'scheduledLocal', message: 'That time has passed.' });
        } else if (when.getTime() > now + 365 * 86_400_000) {
          problems.push({ path: 'scheduledLocal', message: 'Pick a time within the next year.' });
        }
      }
      if (problems.length) throw new AppError(400, 'validation_failed', problems[0]!.message, { errors: problems });

      await m.update(
        SocialPost,
        { id },
        {
          body: next.body,
          firstComment: next.firstComment,
          linkUrl: next.linkUrl,
          media: next.media,
          followUps: next.followUps,
          scheduledFor: when,
        },
      );
      await m.update(PublishIntent, { id: intent.id }, { notBefore: when });
      await this.audit(m, ctx, 'social.post_edited', id);
      const saved = await m.findOneByOrFail(SocialPost, { id });
      return { id, scheduledFor: saved.scheduledFor, updatedAt: saved.updatedAt };
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
      if (!result.affected) {
        const working = await m.findOneBy(PublishIntent, {
          workspaceId: ctx.workspaceId,
          postId: id,
          state: 'processing',
        });
        throw AppError.conflict(
          working
            ? 'The network is already processing that post, so it cannot be cancelled.'
            : 'That post is being sent right now.',
        );
      }
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

  /**
   * A post a person writes by hand. The person is the one approving it, so it is queued at once, for the time they chose
   * or now, under the workspace's Social Media Staff member, which is what the publisher needs to send it. Length and the
   * media a network needs are checked first, for every account, so nothing is half queued.
   */
  async compose(ctx: WorkspaceContext, input: ComposeInput) {
    const outcome = await this.composeInTx(ctx, input);
    if ('scheduleId' in outcome) {
      // The rule is saved and visible now, so the first four weeks of posts can be made from it.
      const made = await this.recurring.generate({ workspaceId: ctx.workspaceId, scheduleId: outcome.scheduleId });
      return { scheduleId: outcome.scheduleId, made };
    }
    return outcome;
  }

  private composeInTx(ctx: WorkspaceContext, input: ComposeInput) {
    return this.tx(ctx, async (m) => {
      const staff = await m.findOne(StaffMember, {
        where: { workspaceId: ctx.workspaceId, roleKey: 'social_media', state: 'active' },
        order: { createdAt: 'ASC' },
      });
      if (!staff) throw AppError.conflict('Hire a Social Media Staff member first: posts go out under theirs.');
      const wanted = [...new Set(input.accountIds)];
      const accounts = await m.find(ConnectedAccount, { where: { workspaceId: ctx.workspaceId, id: In(wanted) } });
      const problems: { path: string; message: string }[] = [];
      if (accounts.length !== wanted.length) {
        problems.push({ path: 'accountIds', message: 'One of those accounts is not connected.' });
      }
      for (const account of accounts) {
        if (account.health === 'broken') {
          problems.push({ path: 'accountIds', message: `${account.name} needs to be reconnected first.` });
          continue;
        }
        problems.push(...this.contentProblems(account, input));
      }

      if (input.tagId && !(await tagExists(m, ctx.workspaceId, input.tagId))) {
        problems.push({ path: 'tagId', message: 'That tag does not exist.' });
      }

      const now = new Date();
      let when = now;
      if (input.repeat && !input.scheduledLocal) {
        problems.push({ path: 'scheduledLocal', message: 'Pick the date and time of the first post.' });
      }
      if (input.scheduledLocal) {
        const workspace = await m.findOneByOrFail(Workspace, { id: ctx.workspaceId });
        const [date, time] = input.scheduledLocal.split('T') as [string, string];
        when = zonedTimeToUtc(date, time, workspace.timezone);
        if (Number.isNaN(when.getTime()))
          problems.push({ path: 'scheduledLocal', message: 'That is not a real time.' });
        else if (input.repeat) {
          // A repeating post may start today at a time that has passed; its first copy is then the next occurrence.
        } else if (when.getTime() < now.getTime() - 5 * 60_000) {
          problems.push({ path: 'scheduledLocal', message: 'That time has passed. Leave it empty to post now.' });
        } else if (when.getTime() > now.getTime() + 365 * 86_400_000) {
          problems.push({ path: 'scheduledLocal', message: 'Pick a time within the next year.' });
        }
      }
      if (problems.length) {
        throw new AppError(400, 'validation_failed', problems[0]!.message, { errors: problems });
      }

      if (input.repeat) {
        const [date, time] = input.scheduledLocal!.split('T') as [string, string];
        const rule = await m.save(
          m.create(PostSchedule, {
            workspaceId: ctx.workspaceId,
            createdBy: ctx.userId,
            accountIds: accounts.map((account) => account.id),
            body: input.body,
            firstComment: input.firstComment ?? null,
            linkUrl: input.linkUrl ?? null,
            media: input.mediaUrls,
            followUps: input.followUps,
            tagId: input.tagId ?? null,
            rule: input.repeat as unknown as Record<string, unknown>,
            atTime: time,
            startsOn: date,
            endsOn: input.repeatEndsOn ?? null,
            state: 'active',
          }),
        );
        await m.save(
          m.create(AuditEntry, {
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: 'social.schedule_created',
            target: rule.id,
            detail: { accounts: accounts.length, kind: input.repeat.kind },
          }),
        );
        return { scheduleId: rule.id };
      }

      const results: { accountId: string; postId: string | null; queued: boolean }[] = [];
      for (const account of accounts) {
        const made = await createPublishIntent(
          m,
          ctx.workspaceId,
          staff.id,
          {
            type: 'createPublishIntent',
            accountId: account.id,
            body: input.body,
            linkUrl: input.linkUrl ?? null,
            firstComment: input.firstComment ?? null,
            media: input.mediaUrls,
            scheduledFor: when.toISOString(),
            idempotencyKey: `compose:${input.requestId}:${account.id}`,
          },
          { createdBy: ctx.userId, tagId: input.tagId ?? null, followUps: input.followUps },
        );
        results.push({ accountId: account.id, postId: made.created ? made.postId : null, queued: made.created });
      }
      await m.save(
        m.create(AuditEntry, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'social.post_composed',
          target: staff.id,
          detail: { accounts: results.length, scheduledFor: when.toISOString() },
        }),
      );
      return results;
    });
  }
}
