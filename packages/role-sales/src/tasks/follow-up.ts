import { Cancel, isSuppressed, type TaskDefinition } from '@ai-staff/core';
import { Conversation, Lead, Message } from '@ai-staff/db';
import { z } from 'zod';
import { callToAction, companyBlock, systemPrompt } from '../prompts.js';
import { settingsOf } from '../settings.js';
import { DRAFT_MODEL, type Email, emailGuardrails, emailSchema, sendOrDraft } from './email.js';

const input = z.object({
  leadId: z.uuid(),
  conversationId: z.uuid(),
  conversationVersion: z.number().int(),
  step: z.number().int().min(1).max(3),
});
type Input = z.infer<typeof input>;

/**
 * A polite follow-up when nobody answered. Scheduled by the send policy after each send; it only runs if the
 * conversation is exactly as it was then. A reply of any kind ends follow-ups (deterministic, not the model's call).
 */
export const followUp: TaskDefinition<Input, Email> = {
  type: 'sales_manager.follow_up',
  name: 'Write a follow-up',
  risk: 'acts_external',
  defaultAutonomy: 'draft',
  triggers: [],
  inputSchema: input,
  maxAttempts: 3,
  model: DRAFT_MODEL,
  outputSchema: emailSchema,
  async buildPrompt(ctx, { conversationId, conversationVersion, step }) {
    const settings = settingsOf(ctx.staff);
    const { conversation, messages, suppressed } = await ctx.read(async (m) => {
      const conversation = await m.findOneBy(Conversation, { workspaceId: ctx.workspaceId, id: conversationId });
      return {
        conversation,
        messages: await m.find(Message, {
          where: { workspaceId: ctx.workspaceId, conversationId },
          order: { occurredAt: 'ASC' },
        }),
        suppressed: conversation ? await isSuppressed(m, ctx.workspaceId, conversation.recipientEmail) : false,
      };
    });
    if (!conversation || conversation.state === 'closed') throw new Cancel('The conversation has ended.');
    if (conversation.stateVersion !== conversationVersion) throw new Cancel('The conversation moved on.');
    if (conversation.handledBy === 'human') throw new Cancel('A person took over this conversation.');
    if (messages.some((message) => message.direction === 'in')) throw new Cancel('They replied.');
    if (suppressed) throw new Cancel('This lead asked not to be contacted.');

    const company = companyBlock(ctx, settings);
    const earlier = messages
      .filter((message) => message.delivery === 'accepted')
      .map((message) => `Subject: ${message.subject}\n${message.body}`)
      .join('\n\n---\n\n');
    return {
      system: systemPrompt(ctx, settings, company.text),
      user: [
        `Write follow-up number ${step}. Do not repeat the earlier emails. Be shorter than them. Add one new, useful fact from the company facts.`,
        callToAction(settings),
        `Earlier emails we sent them:\n${earlier}`,
      ].join('\n\n'),
      factIds: company.factIds,
    };
  },
  guardrails: emailGuardrails<Email>(),
  async toEffects(ctx, email, { leadId, conversationId, conversationVersion, step }) {
    const lead = await ctx.read((m) => m.findOneByOrFail(Lead, { workspaceId: ctx.workspaceId, id: leadId }));
    return sendOrDraft(
      ctx,
      email,
      { leadId, kind: 'follow_up', conversationVersion, idempotencyKey: `follow:${conversationId}:${step}:send` },
      {
        kind: 'email_draft',
        title: `Follow-up ${step} to ${lead.name ?? lead.email ?? 'a lead'}`,
        to: lead.email ?? '',
        context: { leadId, conversationId },
      },
    );
  },
  promotion: { approvals: 25, maxMedianEditRatio: 0.15, windowDays: 30 },
};
