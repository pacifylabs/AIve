import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { registerMediaRequest } from '@ai-staff/contracts';
import type { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { MediaService } from './media.service.js';

/** The workspace's pictures and videos. Any member may add and use them, as any member may write a post. */
@Controller('social/media')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Get()
  list(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.media.list(ctx);
  }

  /** What the browser needs to upload one file straight to Cloudinary, into this workspace's folder. */
  @Post('ticket')
  @HttpCode(200)
  ticket(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.media.ticket(ctx);
  }

  @Post()
  @HttpCode(201)
  register(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(registerMediaRequest)) body: z.output<typeof registerMediaRequest>,
  ) {
    return this.media.register(ctx, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    await this.media.remove(ctx, id);
  }
}
