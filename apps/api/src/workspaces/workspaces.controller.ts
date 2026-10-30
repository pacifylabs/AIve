import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  acceptInvitationRequest,
  changeRoleRequest,
  createWorkspaceRequest,
  inviteRequest,
  updateWorkspaceRequest,
} from '@ai-staff/contracts';
import type { z } from 'zod';
import { AccessTokenGuard, type AuthUser, CurrentUser } from '../auth/access-token.guard.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { InvitationsService } from './invitations.service.js';
import { CurrentWorkspace, RequireRole, type WorkspaceContext, WorkspaceGuard } from './workspace.guard.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(AccessTokenGuard)
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly workspaces: WorkspacesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createWorkspaceRequest)) body: z.output<typeof createWorkspaceRequest>,
  ) {
    return this.workspaces.create(user.id, body);
  }
}

/** Routes acting on the workspace named by the `X-Workspace-Id` header. */
@Controller('workspace')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class CurrentWorkspaceController {
  constructor(
    @Inject(WorkspacesService) private readonly workspaces: WorkspacesService,
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
  ) {}

  @Get()
  get(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.workspaces.get(ctx);
  }

  @Patch()
  @RequireRole('admin')
  update(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(updateWorkspaceRequest)) body: z.output<typeof updateWorkspaceRequest>,
  ) {
    return this.workspaces.update(ctx, body);
  }

  @Get('members')
  members(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.workspaces.members(ctx);
  }

  @Patch('members/:userId')
  @RequireRole('owner')
  @HttpCode(204)
  async changeRole(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('userId', UuidPipe) userId: string,
    @Body(new ZodPipe(changeRoleRequest)) body: z.output<typeof changeRoleRequest>,
  ) {
    await this.workspaces.changeRole(ctx, userId, body.role);
  }

  @Delete('members/:userId')
  @RequireRole('owner')
  @HttpCode(204)
  async remove(@CurrentWorkspace() ctx: WorkspaceContext, @Param('userId', UuidPipe) userId: string) {
    await this.workspaces.remove(ctx, userId);
  }

  @Post('invitations')
  @RequireRole('admin')
  invite(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(inviteRequest)) body: z.output<typeof inviteRequest>,
  ) {
    return this.invitations.invite(ctx, user, body.email, body.role);
  }

  @Get('invitations')
  @RequireRole('admin')
  pending(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.invitations.pending(ctx);
  }

  @Delete('invitations/:id')
  @RequireRole('admin')
  @HttpCode(204)
  async revoke(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    await this.invitations.revoke(ctx, id);
  }
}

@Controller('invitations')
@UseGuards(AccessTokenGuard)
export class InvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Post('accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(acceptInvitationRequest)) body: z.output<typeof acceptInvitationRequest>,
  ) {
    return this.invitations.accept(user, body.token);
  }
}
