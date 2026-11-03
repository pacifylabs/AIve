import { allowedLinks, bannedTerms, Cancel, factsOnly, type TaskDefinition, untrusted } from '@ai-staff/core';
import { Lead } from '@ai-staff/db';
import { z } from 'zod';
import { companyBlock, systemPrompt } from '../prompts.js';
import { settingsOf } from '../settings.js';
import { DRAFT_MODEL } from './email.js';

const input = z.object({ leadId: z.uuid() });
type Input = z.infer<typeof input>;

const outputSchema = z.object({
  reply: z.string().min(1).max(1000),
});
type Output = z.infer<typeof outputSchema>;

/**
 * A person who showed buying intent on social has no email address, so there is nothing to send. This writes a short
 * reply the owner can paste into the conversation themselves. It is always a draft: it is never sent by us.
 */
export const socialHandoff: TaskDefinition<Input, Output> = {
  type: 'sales_manager.social_handoff',
  name: 'Suggest a reply to a social lead',
  risk: 'drafts',
  defaultAutonomy: 'draft',
  triggers: [{ event: 'lead.created' }],
  inputSchema: input,
  maxAttempts: 3,
  model: DRAFT_MODEL,
  outputSchema,
  async buildPrompt(ctx, { leadId }) {
    const settings = settingsOf(ctx.staff);
    const lead = await ctx.read((m) => m.findOneBy(Lead, { workspaceId: ctx.workspaceId, id: leadId }));
    if (!lead) throw new Cancel('The lead was removed.');
    if (lead.source !== 'social') throw new Cancel('This lead did not come from social.');
    const company = companyBlock(ctx, settings);
    const asked = lead.notes ?? '';
    ctx.evidence?.push(asked);
    return {
      system: systemPrompt(ctx, settings, company.text),
      user: [
        `${lead.name ?? 'Someone'} showed interest on social media. Write a short, friendly reply the owner can send in that conversation: answer from the company facts, and invite them to take the next step.`,
        'Do not claim to be a person. Do not ask for their email in public.',
        untrusted('lead_data', asked || '(no message text)'),
      ].join('\n\n'),
      factIds: company.factIds,
    };
  },
  guardrails: [factsOnly<Output>('reply'), allowedLinks<Output>('reply'), bannedTerms<Output>('reply')],
  async toEffects(ctx, output, { leadId }) {
    const lead = await ctx.read((m) => m.findOneByOrFail(Lead, { workspaceId: ctx.workspaceId, id: leadId }));
    return [
      {
        type: 'createWorkItem',
        kind: 'reply_draft',
        title: `Suggested reply to ${lead.name ?? 'a social lead'}`,
        payload: { leadId, replyTo: lead.notes ?? '', reply: output.reply },
        // The owner sends it themselves where the conversation is; approving records that it was dealt with.
        onApprove: [{ type: 'updateLead', leadId, state: 'contacting' }],
        expiresInHours: 48,
      },
    ];
  },
};
