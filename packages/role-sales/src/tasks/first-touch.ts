import { Cancel, isSuppressed, optOutPresent, type TaskDefinition, untrusted } from '@ai-staff/core';
import { Conversation, Lead, LeadResearch, Not } from '@ai-staff/db';
import { z } from 'zod';
import { callToAction, companyBlock, systemPrompt } from '../prompts.js';
import { settingsOf } from '../settings.js';
import { DRAFT_MODEL, type Email, emailGuardrails, emailSchema, sendOrDraft } from './email.js';

const input = z.object({ leadId: z.uuid() });
type Input = z.infer<typeof input>;

const describeLead = (lead: Lead) =>
  [
    lead.name && `Name: ${lead.name}`,
    lead.company && `Company: ${lead.company}`,
    lead.website && `Website: ${lead.website}`,
    lead.notes && `Notes from the owner: ${lead.notes}`,
  ]
    .filter(Boolean)
    .join('\n');

/** The first email to a lead, about them, from what their own site says. Ported from KudiBooks `draftOutreach`. */
export const firstTouch: TaskDefinition<Input, Email> = {
  type: 'sales_manager.first_touch',
  name: 'Write a first email',
  risk: 'acts_external',
  defaultAutonomy: 'draft',
  triggers: [{ event: 'lead.researched' }, { person: true }],
  inputSchema: input,
  maxAttempts: 3,
  model: DRAFT_MODEL,
  outputSchema: emailSchema,
  async buildPrompt(ctx, { leadId }) {
    const settings = settingsOf(ctx.staff);
    const { lead, research, open, suppressed } = await ctx.read(async (m) => {
      const lead = await m.findOneBy(Lead, { workspaceId: ctx.workspaceId, id: leadId });
      return {
        lead,
        research: await m.find(LeadResearch, {
          where: { workspaceId: ctx.workspaceId, leadId },
          order: { retrievedAt: 'DESC' },
          take: 3,
        }),
        open: await m.existsBy(Conversation, { workspaceId: ctx.workspaceId, leadId, state: Not('closed') }),
        suppressed: lead?.email ? await isSuppressed(m, ctx.workspaceId, lead.email) : false,
      };
    });
    if (!lead?.email) throw new Cancel('The lead has no email address.');
    if (suppressed) throw new Cancel('This lead asked not to be contacted.');
    if (open) throw new Cancel('There is already a conversation with this lead.');
    if (!['new', 'researching', 'queued'].includes(lead.state)) throw new Cancel(`The lead is ${lead.state}.`);

    const company = companyBlock(ctx, settings);
    const pages = research.map(
      (item) => `${item.url} (read ${item.retrievedAt.toISOString().slice(0, 10)}):\n${item.excerpt}`,
    );
    const leadText = describeLead(lead);
    ctx.evidence?.push(leadText, ...pages);
    return {
      system: systemPrompt(ctx, settings, company.text),
      user: [
        'Write a first email to this person. Mention one specific, true thing from the page data if there is one, then what the company does for businesses like theirs, then one easy next step.',
        callToAction(settings),
        'Include one short, polite way to stop hearing from us.',
        untrusted('lead_data', leadText || '(only an email address)'),
        pages.length
          ? untrusted('page_data', pages.join('\n\n'))
          : 'There is no page data: do not pretend to know their business.',
      ].join('\n\n'),
      factIds: company.factIds,
    };
  },
  guardrails: [...emailGuardrails<Email>(), optOutPresent<Email>('body')],
  async toEffects(ctx, email, { leadId }) {
    const lead = await ctx.read((m) => m.findOneByOrFail(Lead, { workspaceId: ctx.workspaceId, id: leadId }));
    const who = lead.name ?? lead.email ?? 'a lead';
    return sendOrDraft(
      ctx,
      email,
      { leadId, kind: 'first', conversationVersion: null, idempotencyKey: `first:${leadId}` },
      { kind: 'email_draft', title: `First email to ${who}`, to: lead.email ?? '', context: { leadId } },
    );
  },
  promotion: { approvals: 25, maxMedianEditRatio: 0.15, windowDays: 30 },
};
