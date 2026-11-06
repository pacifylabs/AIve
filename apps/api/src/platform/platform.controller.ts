import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  addFactRequest,
  approveWorkItemRequest,
  configureAutopilotRequest,
  decidePromotionRequest,
  enableAutopilotRequest,
  rejectWorkItemRequest,
  spendCapRequest,
  updateCompanyProfileRequest,
  updateFactRequest,
  updateStaffRequest,
} from '@ai-staff/contracts';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentWorkspace, RequireRole, type WorkspaceContext, WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { PlatformService } from './platform.service.js';

const taskTypeParam = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'Not a task type.');

/** The approval inbox. Any member may approve or reject. */
@Controller('inbox')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class InboxController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  list(@CurrentWorkspace() ctx: WorkspaceContext, @Query('view') view?: string) {
    return this.platform.inbox(ctx, view === 'decided' ? 'decided' : 'pending');
  }

  @Post(':id/approve')
  approve(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(approveWorkItemRequest)) body: z.output<typeof approveWorkItemRequest>,
  ) {
    return this.platform.approve(ctx, id, body.payload);
  }

  @Post(':id/reject')
  reject(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(rejectWorkItemRequest)) body: z.output<typeof rejectWorkItemRequest>,
  ) {
    return this.platform.reject(ctx, id, body.reason);
  }
}

/** The company brain. Everyone may read it; admins change it, since every staff member works from it. */
@Controller('company')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class CompanyController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  get(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.platform.company(ctx);
  }

  @Patch()
  @RequireRole('admin')
  update(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(updateCompanyProfileRequest)) body: z.output<typeof updateCompanyProfileRequest>,
  ) {
    return this.platform.updateCompany(ctx, body);
  }

  @Post('prefill')
  @RequireRole('admin')
  @HttpCode(202)
  prefill(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.platform.startPrefill(ctx);
  }

  @Post('facts')
  @RequireRole('admin')
  addFact(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(addFactRequest)) body: z.output<typeof addFactRequest>,
  ) {
    return this.platform.addFact(ctx, body.kind, body.text);
  }

  @Patch('facts/:id')
  @RequireRole('admin')
  updateFact(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateFactRequest)) body: z.output<typeof updateFactRequest>,
  ) {
    return this.platform.updateFact(ctx, id, body.text);
  }

  @Post('facts/:id/confirm')
  @RequireRole('admin')
  confirmFact(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.platform.confirmFact(ctx, id);
  }

  @Delete('facts/:id')
  @RequireRole('admin')
  @HttpCode(204)
  removeFact(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.platform.removeFact(ctx, id);
  }
}

/** Staff state, promotions, activity and the spend cap. */
@Controller()
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class StaffController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get('staff')
  staff(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.platform.staff(ctx);
  }

  @Patch('staff/:id')
  @RequireRole('admin')
  updateStaff(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateStaffRequest)) body: z.output<typeof updateStaffRequest>,
  ) {
    return this.platform.updateStaff(ctx, id, body.state, body.pausedReason);
  }

  @Get('promotions')
  promotions(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.platform.promotions(ctx);
  }

  @Post('promotions/:id')
  @RequireRole('admin')
  decidePromotion(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(decidePromotionRequest)) body: z.output<typeof decidePromotionRequest>,
  ) {
    return this.platform.decidePromotion(ctx, id, body.accept);
  }

  /** Every task that publishes or sends, with its autopilot mode, rules and progress. */
  @Get('autopilot')
  autopilot(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.platform.autopilotOverview(ctx);
  }

  @Put('staff/:id/autopilot/:taskType')
  @RequireRole('admin')
  configureAutopilot(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Param('taskType', new ZodPipe(taskTypeParam)) taskType: string,
    @Body(new ZodPipe(configureAutopilotRequest)) body: z.output<typeof configureAutopilotRequest>,
  ) {
    return this.platform.configureAutopilot(ctx, id, taskType, body);
  }

  /** Skips the record: the owner trusts the task now. Owners only, and only with an explicit confirmation. */
  @Post('staff/:id/autopilot/:taskType/enable')
  @RequireRole('owner')
  enableAutopilot(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Param('taskType', new ZodPipe(taskTypeParam)) taskType: string,
    @Body(new ZodPipe(enableAutopilotRequest)) _body: z.output<typeof enableAutopilotRequest>,
  ) {
    return this.platform.enableAutopilot(ctx, id, taskType);
  }

  @Post('staff/:id/autopilot/:taskType/stop')
  @RequireRole('admin')
  stopAutopilot(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Param('taskType', new ZodPipe(taskTypeParam)) taskType: string,
  ) {
    return this.platform.stopAutopilot(ctx, id, taskType);
  }

  @Get('activity')
  activity(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.platform.activity(ctx);
  }

  @Get('spend-cap')
  spendCap(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.platform.spendCap(ctx);
  }

  @Put('spend-cap')
  @RequireRole('owner')
  setSpendCap(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(spendCapRequest)) body: z.output<typeof spendCapRequest>,
  ) {
    return this.platform.setSpendCap(ctx, body.monthlyCapUsd, body.alertAtPct);
  }
}
