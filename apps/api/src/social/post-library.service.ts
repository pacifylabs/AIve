import { Inject, Injectable } from '@nestjs/common';
import {
  AuditEntry,
  ConnectedAccount,
  DataSource,
  type EntityManager,
  In,
  PostTag,
  PostTemplate,
  SocialPost,
  type TagColour,
  withTenant,
} from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

interface TemplateInput {
  name: string;
  body: string;
  firstComment?: string | undefined;
  mediaUrls: string[];
  linkUrl?: string | undefined;
  accountIds: string[];
  tagId?: string | null | undefined;
}

const duplicate = (error: unknown) => (error as { code?: string }).code === '23505';

/** Colour tags and saved post templates. Any member may keep them, as any member may write a post. */
@Injectable()
export class PostLibraryService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  // ---- Tags ----------------------------------------------------------------------------------------------------

  listTags(ctx: WorkspaceContext) {
    return this.tx(ctx, async (m) => {
      const tags = await m.find(PostTag, { where: { workspaceId: ctx.workspaceId }, order: { name: 'ASC' } });
      const counts = (await m.query(
        `SELECT tag_id, count(*)::int AS posts FROM social_posts
          WHERE workspace_id = $1 AND tag_id IS NOT NULL GROUP BY tag_id`,
        [ctx.workspaceId],
      )) as { tag_id: string; posts: number }[];
      return tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        colour: tag.colour,
        posts: counts.find((row) => row.tag_id === tag.id)?.posts ?? 0,
      }));
    });
  }

  createTag(ctx: WorkspaceContext, input: { name: string; colour: TagColour }) {
    return this.tx(ctx, async (m) => {
      try {
        const tag = await m.save(m.create(PostTag, { workspaceId: ctx.workspaceId, ...input }));
        return { id: tag.id, name: tag.name, colour: tag.colour };
      } catch (error) {
        if (duplicate(error)) throw AppError.conflict('There is already a tag with that name.');
        throw error;
      }
    });
  }

  updateTag(ctx: WorkspaceContext, id: string, input: { name: string; colour: TagColour }) {
    return this.tx(ctx, async (m) => {
      const tag = await m.findOneBy(PostTag, { workspaceId: ctx.workspaceId, id });
      if (!tag) throw AppError.notFound('Tag not found.');
      try {
        await m.save(Object.assign(tag, input));
      } catch (error) {
        if (duplicate(error)) throw AppError.conflict('There is already a tag with that name.');
        throw error;
      }
      return { id: tag.id, name: tag.name, colour: tag.colour };
    });
  }

  /** Posts and templates that carried the tag keep existing, without it. */
  deleteTag(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const tag = await m.findOneBy(PostTag, { workspaceId: ctx.workspaceId, id });
      if (!tag) throw AppError.notFound('Tag not found.');
      await m.delete(PostTag, { workspaceId: ctx.workspaceId, id });
      await m.save(
        m.create(AuditEntry, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'social.tag_deleted',
          target: id,
          detail: { name: tag.name },
        }),
      );
    });
  }

  /** Puts a tag on a post, or takes it off. Works for posts a staff member drafted as well as hand-written ones. */
  setPostTag(ctx: WorkspaceContext, postId: string, tagId: string | null) {
    return this.tx(ctx, async (m) => {
      const post = await m.findOneBy(SocialPost, { workspaceId: ctx.workspaceId, id: postId });
      if (!post) throw AppError.notFound('Post not found.');
      await this.assertTag(m, ctx, tagId);
      await m.update(SocialPost, { id: postId }, { tagId });
      return { id: postId, tagId };
    });
  }

  // ---- Templates -----------------------------------------------------------------------------------------------

  listTemplates(ctx: WorkspaceContext) {
    return this.tx(ctx, (m) =>
      m.find(PostTemplate, { where: { workspaceId: ctx.workspaceId }, order: { name: 'ASC' } }),
    );
  }

  createTemplate(ctx: WorkspaceContext, input: TemplateInput) {
    return this.tx(ctx, async (m) => {
      await this.assertRefs(m, ctx, input);
      try {
        return await m.save(
          m.create(PostTemplate, {
            workspaceId: ctx.workspaceId,
            name: input.name,
            body: input.body,
            firstComment: input.firstComment || null,
            linkUrl: input.linkUrl ?? null,
            media: input.mediaUrls,
            accountIds: input.accountIds,
            tagId: input.tagId ?? null,
            createdBy: ctx.userId,
          }),
        );
      } catch (error) {
        if (duplicate(error)) throw AppError.conflict('There is already a template with that name.');
        throw error;
      }
    });
  }

  updateTemplate(ctx: WorkspaceContext, id: string, input: TemplateInput) {
    return this.tx(ctx, async (m) => {
      const template = await m.findOneBy(PostTemplate, { workspaceId: ctx.workspaceId, id });
      if (!template) throw AppError.notFound('Template not found.');
      await this.assertRefs(m, ctx, input);
      try {
        return await m.save(
          Object.assign(template, {
            name: input.name,
            body: input.body,
            firstComment: input.firstComment || null,
            linkUrl: input.linkUrl ?? null,
            media: input.mediaUrls,
            accountIds: input.accountIds,
            tagId: input.tagId ?? null,
          }),
        );
      } catch (error) {
        if (duplicate(error)) throw AppError.conflict('There is already a template with that name.');
        throw error;
      }
    });
  }

  deleteTemplate(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const result = await m.delete(PostTemplate, { workspaceId: ctx.workspaceId, id });
      if (!result.affected) throw AppError.notFound('Template not found.');
    });
  }

  // ---- Checks --------------------------------------------------------------------------------------------------

  private async assertTag(m: EntityManager, ctx: WorkspaceContext, tagId: string | null | undefined) {
    if (!tagId) return;
    if (!(await m.existsBy(PostTag, { workspaceId: ctx.workspaceId, id: tagId }))) {
      throw new AppError(400, 'validation_failed', 'That tag does not exist.', {
        errors: [{ path: 'tagId', message: 'That tag does not exist.' }],
      });
    }
  }

  private async assertRefs(m: EntityManager, ctx: WorkspaceContext, input: TemplateInput) {
    await this.assertTag(m, ctx, input.tagId);
    if (input.accountIds.length) {
      const found = await m.count(ConnectedAccount, {
        where: { workspaceId: ctx.workspaceId, id: In(input.accountIds) },
      });
      if (found !== new Set(input.accountIds).size) {
        throw new AppError(400, 'validation_failed', 'One of those accounts is not connected.', {
          errors: [{ path: 'accountIds', message: 'One of those accounts is not connected.' }],
        });
      }
    }
  }
}

/** Used by the composer to confirm a tag belongs to the workspace before a post is tagged with it. */
export async function tagExists(m: EntityManager, workspaceId: string, tagId: string): Promise<boolean> {
  return m.existsBy(PostTag, { workspaceId, id: tagId });
}
