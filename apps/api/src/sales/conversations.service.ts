import { Inject, Injectable } from '@nestjs/common';
import type { addSuppressionRequest, humanReplyRequest } from '@ai-staff/contracts';
import { cancelPendingSends, createSendIntent, resolveUncertainSend, suppress } from '@ai-staff/core';
import {
  AuditEntry,
  Conversation,
  DataSource,
  type EntityManager,
  In,
  Lead,
  Message,
  SendIntent,
  StaffMember,
  Suppression,
  withTenant,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

@Injectable()
export class ConversationsService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  private async load(m: EntityManager, ctx: WorkspaceContext, id: string, lock = false) {
    const conversation = await m.findOne(Conversation, {
      where: { workspaceId: ctx.workspaceId, id },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!conversation) throw AppError.notFound('Conversation not found.');
    return conversation;
  }

  list(ctx: WorkspaceContext, state?: Conversation['state']) {
    return this.tx(ctx, async (m) => {
      const conversations = await m.find(Conversation, {
        where: { workspaceId: ctx.workspaceId, ...(state ? { state } : {}) },
        order: { lastMessageAt: { direction: 'DESC', nulls: 'LAST' }, createdAt: 'DESC' },
        take: 200,
      });
      const leads = await m.find(Lead, {
        where: { workspaceId: ctx.workspaceId, id: In(conversations.map((c) => c.leadId)) },
      });
      return conversations.map((conversation) => ({
        ...conversation,
        lead: leads.find((lead) => lead.id === conversation.leadId) ?? null,
      }));
    });
  }

  get(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const conversation = await this.load(m, ctx, id);
      const [lead, messages, intents] = await Promise.all([
        m.findOneBy(Lead, { workspaceId: ctx.workspaceId, id: conversation.leadId }),
        m.find(Message, { where: { workspaceId: ctx.workspaceId, conversationId: id }, order: { occurredAt: 'ASC' } }),
        m.find(SendIntent, { where: { workspaceId: ctx.workspaceId, conversationId: id, state: 'uncertain' } }),
      ]);
      return { ...conversation, lead, messages, uncertainSends: intents.map((intent) => intent.id) };
    });
  }

  /** A person takes the conversation: the staff member stops, and anything it queued is dropped. */
  takeOver(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const conversation = await this.load(m, ctx, id, true);
      if (conversation.state === 'closed') throw AppError.conflict('That conversation has ended.');
      if (conversation.handledBy === 'human') return conversation;
      await m.update(
        Conversation,
        { id },
        { handledBy: 'human', stateVersion: conversation.stateVersion + 1, state: 'active' },
      );
      await cancelPendingSends(m, conversation, 'A person took over.', false);
      await this.audit(m, ctx, 'conversation.taken_over', id);
      return m.findOneByOrFail(Conversation, { id });
    });
  }

  giveBack(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const conversation = await this.load(m, ctx, id, true);
      if (conversation.handledBy === 'staff') return conversation;
      await m.update(Conversation, { id }, { handledBy: 'staff', stateVersion: conversation.stateVersion + 1 });
      await this.audit(m, ctx, 'conversation.given_back', id);
      return m.findOneByOrFail(Conversation, { id });
    });
  }

  /** A person's own reply, sent as the conversation's staff member's mailbox but written by them. */
  reply(ctx: WorkspaceContext, id: string, input: z.output<typeof humanReplyRequest>) {
    return this.tx(ctx, async (m) => {
      const conversation = await this.load(m, ctx, id, true);
      if (conversation.state === 'closed') throw AppError.conflict('That conversation has ended.');
      const staff = await m.findOneBy(StaffMember, { workspaceId: ctx.workspaceId, id: conversation.staffId });
      if (!staff) throw AppError.conflict('The staff member for this conversation was removed.');
      const result = await createSendIntent(
        m,
        ctx.workspaceId,
        staff.id,
        {
          type: 'createSendIntent',
          leadId: conversation.leadId,
          kind: 'reply',
          subject: input.subject ?? `Re: ${conversation.subject}`.slice(0, 200),
          body: input.body,
          conversationVersion: null,
          idempotencyKey: `human:${uuidv7()}`,
        },
        { userId: ctx.userId },
      );
      if (!result.created) throw AppError.conflict(result.reason);
      return { queued: true, intentId: result.intentId };
    });
  }

  resolveSend(ctx: WorkspaceContext, intentId: string, outcome: 'sent' | 'retry') {
    return this.tx(ctx, async (m) => {
      const done = await resolveUncertainSend(m, ctx.workspaceId, intentId, outcome);
      if (!done) throw AppError.notFound('That email is not waiting to be settled.');
      await this.audit(m, ctx, `send.resolved_${outcome}`, intentId);
      return { ok: true };
    });
  }

  // ---- Suppressions ------------------------------------------------------------------------------------------

  suppressions(ctx: WorkspaceContext) {
    return this.tx(ctx, (m) =>
      m.find(Suppression, { where: { workspaceId: ctx.workspaceId }, order: { createdAt: 'DESC' }, take: 500 }),
    );
  }

  addSuppression(ctx: WorkspaceContext, input: z.output<typeof addSuppressionRequest>) {
    return this.tx(ctx, async (m) => {
      await suppress(m, ctx.workspaceId, input.value, 'manual', input.note);
      await this.audit(m, ctx, 'suppression.added', input.value);
      return m.findOneByOrFail(Suppression, { workspaceId: ctx.workspaceId, value: input.value });
    });
  }

  /** Only a person's own entries can be lifted. An opt-out, bounce or complaint is the other side's decision. */
  removeSuppression(ctx: WorkspaceContext, id: string) {
    return this.tx(ctx, async (m) => {
      const row = await m.findOneBy(Suppression, { workspaceId: ctx.workspaceId, id });
      if (!row) throw AppError.notFound('Suppression not found.');
      if (row.reason !== 'manual') {
        throw AppError.conflict('They asked to stop, or the address bounced, so this cannot be removed.');
      }
      await m.delete(Suppression, { id });
      await this.audit(m, ctx, 'suppression.removed', row.value);
    });
  }

  private audit(m: EntityManager, ctx: WorkspaceContext, action: string, target: string) {
    return m.save(
      m.create(AuditEntry, { workspaceId: ctx.workspaceId, userId: ctx.userId, action, target, detail: {} }),
    );
  }
}
