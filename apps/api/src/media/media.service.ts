import { Inject, Injectable } from '@nestjs/common';
import { AuditEntry, DataSource, type EntityManager, MediaAsset, withTenant } from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';
import { CloudinaryClient } from './cloudinary.client.js';

/** Each workspace uploads into its own folder, and only files in that folder can be recorded as its own. */
const folderOf = (workspaceId: string) => `ai-staff/${workspaceId}`;

@Injectable()
export class MediaService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(CloudinaryClient) private readonly cloudinary: CloudinaryClient,
  ) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  ticket(ctx: WorkspaceContext) {
    return this.cloudinary.uploadTicket(folderOf(ctx.workspaceId));
  }

  async list(ctx: WorkspaceContext) {
    const assets = await this.tx(ctx, (m) =>
      m.find(MediaAsset, { where: { workspaceId: ctx.workspaceId }, order: { createdAt: 'DESC' }, take: 200 }),
    );
    return {
      configured: this.cloudinary.configured,
      items: assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        width: asset.width,
        height: asset.height,
        bytes: asset.bytes,
        // A picture can be used as it is or cut to a shape; a video only as it is.
        urls:
          asset.kind === 'image' && this.cloudinary.configured
            ? {
                original: asset.url,
                square: this.cloudinary.variant(asset.publicId, 'square'),
                portrait: this.cloudinary.variant(asset.publicId, 'portrait'),
                landscape: this.cloudinary.variant(asset.publicId, 'landscape'),
              }
            : { original: asset.url },
      })),
    };
  }

  async register(ctx: WorkspaceContext, input: { publicId: string; type: 'image' | 'video'; name: string }) {
    if (!input.publicId.startsWith(`${folderOf(ctx.workspaceId)}/`)) {
      throw new AppError(400, 'validation_failed', 'That file was not uploaded for this workspace.', {
        errors: [{ path: 'publicId', message: 'That file was not uploaded for this workspace.' }],
      });
    }
    const stored = await this.cloudinary.describe(input.publicId, input.type);
    return this.tx(ctx, async (m) => {
      if (await m.existsBy(MediaAsset, { publicId: stored.public_id })) {
        throw AppError.conflict('That file is already in the library.');
      }
      const asset = await m.save(
        m.create(MediaAsset, {
          workspaceId: ctx.workspaceId,
          kind: input.type,
          publicId: stored.public_id,
          url: stored.secure_url,
          name: input.name,
          width: stored.width ?? null,
          height: stored.height ?? null,
          bytes: stored.bytes ?? null,
          createdBy: ctx.userId,
        }),
      );
      return { id: asset.id };
    });
  }

  /** A file a scheduled post still points at is not removed, since the post would go out without it. */
  async remove(ctx: WorkspaceContext, id: string) {
    const asset = await this.tx(ctx, async (m) => {
      const found = await m.findOneBy(MediaAsset, { workspaceId: ctx.workspaceId, id });
      if (!found) throw AppError.notFound('File not found.');
      const used = (await m.query(
        `SELECT 1 FROM social_posts WHERE workspace_id = $1 AND state = 'scheduled' AND media::text LIKE $2 LIMIT 1`,
        [ctx.workspaceId, `%${found.publicId}%`],
      )) as unknown[];
      if (used.length) throw AppError.conflict('A scheduled post uses this file. Change or cancel that post first.');
      await m.delete(MediaAsset, { id });
      await m.save(
        m.create(AuditEntry, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'social.media_deleted',
          target: id,
          detail: { name: found.name },
        }),
      );
      return found;
    });
    // Best effort: the record is gone either way, and a file left behind is only wasted space.
    await this.cloudinary.destroy(asset.publicId, asset.kind).catch(() => undefined);
  }
}
