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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  addSuppressionRequest,
  connectMailboxRequest,
  createLeadRequest,
  hireStaffRequest,
  humanReplyRequest,
  importLeadsRequest,
  resolveSendRequest,
  sendTestRequest,
  updateLeadRequest,
  updateStaffSettingsRequest,
} from '@ai-staff/contracts';
import { InboundNotFoundError, MailInbox } from '@ai-staff/core';
import type { InboundMail } from '@ai-staff/mail';
import type { Request } from 'express';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { AppError } from '../common/app-error.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { RateLimiter } from '../redis/rate-limiter.service.js';
import { CurrentWorkspace, RequireRole, type WorkspaceContext, WorkspaceGuard } from '../workspaces/workspace.guard.js';
import { ConversationsService } from './conversations.service.js';
import { LeadsService } from './leads.service.js';
import { MailboxService } from './mailbox.service.js';
import { StaffAdminService } from './staff.service.js';

const LEAD_STATES = [
  'new',
  'researching',
  'queued',
  'contacting',
  'replied',
  'needs_human',
  'won',
  'lost',
  'stopped',
] as const;
const CONVERSATION_STATES = ['active', 'waiting', 'needs_human', 'closed'] as const;
const pick = <T extends string>(values: readonly T[], value?: string): T | undefined =>
  values.find((candidate) => candidate === value);

/** Connecting and checking mailboxes. Connecting one touches the company's mail, so it is for admins. */
@Controller('mailboxes')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class MailboxesController {
  constructor(@Inject(MailboxService) private readonly mailboxes: MailboxService) {}

  @Get()
  list(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.mailboxes.list(ctx);
  }

  @Post()
  @RequireRole('admin')
  connect(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(connectMailboxRequest)) body: z.output<typeof connectMailboxRequest>,
  ) {
    return this.mailboxes.connect(ctx, body);
  }

  @Post(':id/test')
  @HttpCode(200)
  @RequireRole('admin')
  test(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(sendTestRequest)) body: z.output<typeof sendTestRequest>,
  ) {
    return this.mailboxes.sendTest(ctx, id, body.to);
  }

  @Post(':id/check-dns')
  @HttpCode(200)
  @RequireRole('admin')
  checkDns(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.mailboxes.checkDns(ctx, id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @RequireRole('admin')
  resume(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.mailboxes.resume(ctx, id);
  }
}

@Controller('leads')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

  @Get()
  list(@CurrentWorkspace() ctx: WorkspaceContext, @Query('state') state?: string) {
    return this.leads.list(ctx, pick(LEAD_STATES, state));
  }

  @Post()
  create(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(createLeadRequest)) body: z.output<typeof createLeadRequest>,
  ) {
    return this.leads.create(ctx, body);
  }

  /** `commit: false` previews the file; nothing is saved until it is sent again with `commit: true`. */
  @Post('import')
  @HttpCode(200)
  import(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(importLeadsRequest)) body: z.output<typeof importLeadsRequest>,
  ) {
    return this.leads.import(ctx, body.csv, body.commit);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateLeadRequest)) body: z.output<typeof updateLeadRequest>,
  ) {
    return this.leads.update(ctx, id, body);
  }
}

@Controller()
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Get('conversations')
  list(@CurrentWorkspace() ctx: WorkspaceContext, @Query('state') state?: string) {
    return this.conversations.list(ctx, pick(CONVERSATION_STATES, state));
  }

  @Get('conversations/:id')
  get(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.conversations.get(ctx, id);
  }

  @Post('conversations/:id/take-over')
  @HttpCode(200)
  takeOver(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.conversations.takeOver(ctx, id);
  }

  @Post('conversations/:id/give-back')
  @HttpCode(200)
  giveBack(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    return this.conversations.giveBack(ctx, id);
  }

  @Post('conversations/:id/reply')
  reply(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(humanReplyRequest)) body: z.output<typeof humanReplyRequest>,
  ) {
    return this.conversations.reply(ctx, id, body);
  }

  @Post('send-intents/:id/resolve')
  @HttpCode(200)
  resolve(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(resolveSendRequest)) body: z.output<typeof resolveSendRequest>,
  ) {
    return this.conversations.resolveSend(ctx, id, body.outcome);
  }

  @Get('suppressions')
  suppressions(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.conversations.suppressions(ctx);
  }

  @Post('suppressions')
  addSuppression(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(addSuppressionRequest)) body: z.output<typeof addSuppressionRequest>,
  ) {
    return this.conversations.addSuppression(ctx, body);
  }

  @Delete('suppressions/:id')
  @HttpCode(204)
  @RequireRole('admin')
  async removeSuppression(@CurrentWorkspace() ctx: WorkspaceContext, @Param('id', UuidPipe) id: string) {
    await this.conversations.removeSuppression(ctx, id);
  }
}

/** Hiring and role settings. */
@Controller()
@UseGuards(AccessTokenGuard, WorkspaceGuard)
export class HiringController {
  constructor(@Inject(StaffAdminService) private readonly staff: StaffAdminService) {}

  @Get('roles')
  roles() {
    return this.staff.roles();
  }

  @Post('staff')
  @RequireRole('admin')
  hire(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body(new ZodPipe(hireStaffRequest)) body: z.output<typeof hireStaffRequest>,
  ) {
    return this.staff.hire(ctx, body);
  }

  @Patch('staff/:id/settings')
  @RequireRole('admin')
  settings(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateStaffSettingsRequest)) body: z.output<typeof updateStaffSettingsRequest>,
  ) {
    return this.staff.updateSettings(ctx, id, body.settings);
  }
}

/** A message as a forwarding rule or inbound-parse provider posts it. Strict about size: it is a public URL. */
const inboundMail = z.object({
  event: z.enum(['message', 'bounce', 'complaint']).default('message'),
  messageId: z.string().min(1).max(300),
  inReplyTo: z.string().max(300).nullish(),
  references: z.array(z.string().max(300)).max(50).optional(),
  from: z.object({ email: z.string().max(320), name: z.string().max(200).optional() }),
  subject: z.string().max(500).optional(),
  text: z.string().max(100_000).optional(),
  receivedAt: z.iso.datetime().optional(),
  recipient: z.string().max(320).optional(),
});

/** Public endpoints: the forwarding webhook and the unsubscribe link. Neither has a session; both are rate limited. */
@Controller()
export class PublicMailController {
  constructor(
    @Inject(MailInbox) private readonly inbox: MailInbox,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Post('inbound/mail/:mailboxId/:secret')
  @HttpCode(202)
  async receive(
    @Param('mailboxId', UuidPipe) mailboxId: string,
    @Param('secret') secret: string,
    @Body(new ZodPipe(inboundMail)) body: z.output<typeof inboundMail>,
    @Req() request: Request,
  ) {
    await this.limiter.consume(
      { key: `inbound:ip:${request.ip ?? 'unknown'}`, max: 600, windowSec: 60 },
      { key: `inbound:mailbox:${mailboxId}`, max: 300, windowSec: 60 },
    );
    try {
      const outcome = await this.inbox.receiveForwarded(mailboxId, secret.slice(0, 200), body as InboundMail);
      return { outcome };
    } catch (error) {
      if (error instanceof InboundNotFoundError) throw AppError.notFound();
      throw error;
    }
  }

  /** RFC 8058 one-click unsubscribe: a POST with no body to the link in the email header. */
  @Post('unsubscribe/:token')
  @HttpCode(200)
  async unsubscribe(@Param('token') token: string, @Req() request: Request) {
    await this.limiter.consume({ key: `unsubscribe:ip:${request.ip ?? 'unknown'}`, max: 60, windowSec: 60 });
    if (!(await this.inbox.unsubscribe(token.slice(0, 500)))) throw AppError.notFound('That link is not valid.');
    return { ok: true };
  }
}
