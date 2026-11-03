import { Cancel, type Effect, type TaskDefinition, untrusted } from '@ai-staff/core';
import { Conversation, Lead, Message } from '@ai-staff/db';
import { splitQuoted } from '@ai-staff/mail';
import { z } from 'zod';
import { companyBlock, systemPrompt } from '../prompts.js';
import { settingsOf } from '../settings.js';
import { DRAFT_MODEL, emailGuardrails, sendOrDraft } from './email.js';

const input = z.object({
  leadId: z.uuid(),
  conversationId: z.uuid(),
  messageId: z.uuid(),
  conversationVersion: z.number().int(),
});
type Input = z.infer<typeof input>;

export const CLASSIFICATIONS = [
  'interested',
  'question',
  'objection',
  'out_of_office',
  'opt_out',
  'bounce',
  'unclear',
  'escalate',
] as const;

export const triageSchema = z.object({
  classification: z.enum(CLASSIFICATIONS),
  action: z
    .enum(['reply', 'escalate', 'stop', 'wait'])
    .describe(
      'reply: answer within the facts. escalate: needs a person (pricing outside approved offers, contracts, anything not in the facts, anger, legal, asks for a person). stop: they do not want email. wait: nothing to send now (out of office).',
    ),
  subject: z.string().max(200).optional(),
  body: z.string().max(4000).optional(),
  reason: z.string().max(300).describe('Why, in one sentence, for the person reading the log.'),
});
export type Triage = z.infer<typeof triageSchema>;

/** Classes whose replies may ever go out without a person (once promoted). Objections and the rest stay drafts. */
const PROMOTABLE: ReadonlySet<Triage['classification']> = new Set(['question', 'interested']);

const DEFAULT_ESCALATE =
  'asked for anything not in the facts, a discount, a contract, custom work, legal or security questions, or when the person is upset or asks for a person';

/**
 * Reads a reply and decides what happens. The model proposes; the rules below decide (ported from KudiBooks
 * `decideReply` clamping): an opt-out always stops, a reply with no body escalates, and only questions and interest
 * may ever be answered without a person.
 */
export const triageReply: TaskDefinition<Input, Triage> = {
  type: 'sales_manager.triage_reply',
  name: 'Answer a reply',
  risk: 'acts_external',
  defaultAutonomy: 'draft',
  triggers: [{ event: 'lead.replied' }],
  inputSchema: input,
  maxAttempts: 3,
  model: DRAFT_MODEL,
  outputSchema: triageSchema,
  async buildPrompt(ctx, { conversationId, conversationVersion, messageId }) {
    const settings = settingsOf(ctx.staff);
    const { conversation, messages } = await ctx.read(async (m) => ({
      conversation: await m.findOneBy(Conversation, { workspaceId: ctx.workspaceId, id: conversationId }),
      messages: await m.find(Message, {
        where: { workspaceId: ctx.workspaceId, conversationId },
        order: { occurredAt: 'ASC' },
      }),
    }));
    if (!conversation || conversation.state === 'closed') throw new Cancel('The conversation has ended.');
    if (conversation.stateVersion !== conversationVersion)
      throw new Cancel('A newer message arrived; that one is answered instead.');
    if (conversation.handledBy === 'human') throw new Cancel('A person took over this conversation.');
    const latest = messages.find((message) => message.id === messageId);
    if (!latest) throw new Cancel('The reply was removed.');

    const company = companyBlock(ctx, settings);
    const thread = messages
      .filter((message) => message.id !== messageId && (message.direction === 'in' || message.delivery === 'accepted'))
      .slice(-6)
      .map((message) =>
        message.direction === 'out'
          ? `We wrote:\n${message.body}`
          : untrusted('reply_data', `They wrote:\n${splitQuoted(message.body).text}`),
      )
      .join('\n\n');
    const reply = splitQuoted(latest.body).text || latest.body.slice(0, 4000);
    ctx.evidence?.push(reply);
    return {
      system: [
        systemPrompt(ctx, settings, company.text),
        `Always escalate to a person when: ${settings.escalateWhen.trim() || DEFAULT_ESCALATE}.`,
      ].join('\n\n'),
      user: [
        thread ? `Conversation so far:\n${thread}` : '',
        untrusted('reply_data', reply),
        'Classify their latest message and decide what to do. If you reply, answer only from the company facts.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      factIds: company.factIds,
    };
  },
  guardrails: emailGuardrails<Triage>(),
  async toEffects(ctx, decision, { leadId, conversationId, conversationVersion }) {
    const { lead, conversation } = await ctx.read(async (m) => ({
      lead: await m.findOneByOrFail(Lead, { workspaceId: ctx.workspaceId, id: leadId }),
      conversation: await m.findOneByOrFail(Conversation, { workspaceId: ctx.workspaceId, id: conversationId }),
    }));
    const who = lead.name ?? lead.email ?? 'A lead';
    const track = (state?: Conversation['state'], reason?: string): Effect => ({
      type: 'updateConversation',
      conversationId,
      expectedVersion: conversationVersion,
      classification: decision.classification,
      ...(state ? { state } : {}),
      ...(reason ? { reason } : {}),
    });

    if (decision.classification === 'opt_out' || decision.action === 'stop') {
      return [
        { type: 'suppress', value: conversation.recipientEmail, reason: 'opt_out', note: decision.reason },
        { type: 'alert', summary: `${who} asked to stop. They will not be contacted again.` },
      ];
    }
    if (decision.classification === 'bounce') {
      return [{ type: 'suppress', value: conversation.recipientEmail, reason: 'bounce', note: decision.reason }];
    }
    if (decision.action === 'wait' || decision.classification === 'out_of_office') {
      return [track('waiting')];
    }
    const body = decision.body?.trim();
    if (decision.action === 'escalate' || decision.classification === 'escalate' || !body) {
      return [
        track('needs_human', decision.reason),
        { type: 'updateLead', leadId, state: 'needs_human' },
        {
          type: 'escalate',
          title: `${who} needs you`,
          reason: decision.reason,
          payload: { leadId, conversationId, classification: decision.classification, suggestedReply: body ?? null },
        },
      ];
    }
    return [
      track('active'),
      ...sendOrDraft(
        ctx,
        { subject: decision.subject?.trim() || `Re: ${conversation.subject}`.slice(0, 200), body },
        {
          leadId,
          kind: 'reply',
          conversationVersion,
          idempotencyKey: `reply:${conversationId}:${conversationVersion}`,
        },
        {
          kind: 'reply_draft',
          title: `Reply to ${who} (${decision.classification.replace('_', ' ')})`,
          to: conversation.recipientEmail,
          context: { leadId, conversationId, classification: decision.classification, reason: decision.reason },
        },
        PROMOTABLE.has(decision.classification),
      ),
    ];
  },
  promotion: { approvals: 15, maxMedianEditRatio: 0.15, windowDays: 30 },
};
