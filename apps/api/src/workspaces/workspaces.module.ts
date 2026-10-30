import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service.js';
import { WorkspaceGuard } from './workspace.guard.js';
import { CurrentWorkspaceController, InvitationsController, WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  controllers: [WorkspacesController, CurrentWorkspaceController, InvitationsController],
  providers: [WorkspacesService, InvitationsService, WorkspaceGuard],
  exports: [WorkspaceGuard],
})
export class WorkspacesModule {}
