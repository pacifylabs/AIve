import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { resolvePostRequest, selectAccountsRequest } from '@ai-staff/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { AppError } from '../common/app-error.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { RateLimiter } from '../redis/rate-limiter.service.js';
import { CurrentWorkspace, RequireRole, type WorkspaceContext, WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { isNetwork, SocialAccountsService } from './social-accounts.service.js';
import { SocialPostsService } from './social-posts.service.js';

const network = (value: string) => {
  if (!isNetwork(value)) throw AppError.notFound('There is no such network.');
  return value;
};

const date = (value?: string) => {
  const parsed = value ? new Date(value) : undefined;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
};

/** Connected accounts and the posts waiting to go to them. Connecting touches the company's accounts, so it is for admins. */
@Controller('social')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class SocialController {
  constructor(
    @Inject(SocialAccountsService) private readonly accounts: SocialAccountsService,
    @Inject(SocialPostsService) private readonly posts: SocialPostsService,
  ) {}

  @Get('networks')
  networks() {
    return this.accounts.catalogue();
  }

  @Get('accounts')
  list(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.accounts.list(ctx);
  }

  @Post('accounts/connect/:network')
  @HttpCode(200)
  @RequireRole('admin')
  connect(@CurrentWorkspace() ctx: WorkspaceContext, @Param('network') name: string) {
    return this.accounts.start(ctx, network(name));
  }

  @Get('pending/:id')
  pending(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id') id: string) {
    return this.accounts.pending(ctx, id.slice(0, 100));
  }

  @Post('pending/:id/select')
  @HttpCode(200)
  @RequireRole('admin')
  select(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id') id: string,
    @Body(new ZodPipe(selectAccountsRequest)) body: z.output<typeof selectAccountsRequest>,
  ) {
    return this.accounts.select(ctx, id.slice(0, 100), body.externalIds);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @RequireRole('admin')
  async disconnect(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    await this.accounts.disconnect(ctx, id);
  }

  @Get('posts')
  postsList(@CurrentWorkspace() ctx: WorkspaceContext, @Query('from') from?: string, @Query('to') to?: string) {
    return this.posts.list(ctx, { from: date(from), to: date(to) });
  }

  @Post('posts/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.posts.cancel(ctx, id);
  }

  @Post('posts/:id/resolve')
  @HttpCode(200)
  @RequireRole('admin')
  resolve(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(resolvePostRequest)) body: z.output<typeof resolvePostRequest>,
  ) {
    return this.posts.resolve(ctx, id, body.outcome, body.permalink);
  }
}

/** The network sends the browser here after sign-in. No session: the one-time state in the URL says who it is for. */
@Controller('social')
export class SocialCallbackController {
  constructor(
    @Inject(SocialAccountsService) private readonly accounts: SocialAccountsService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Get('callback/:network')
  async callback(
    @Param('network') name: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.limiter.consume({ key: `social-callback:ip:${request.ip ?? 'unknown'}`, max: 30, windowSec: 60 });
    const where = await this.accounts.callback(network(name), {
      code: code?.slice(0, 2000),
      state: state?.slice(0, 200),
      error: error?.slice(0, 200),
    });
    response.redirect(302, where);
  }
}
