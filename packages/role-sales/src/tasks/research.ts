import { Cancel, crawlSite, type TaskDefinition } from '@ai-staff/core';
import { Lead } from '@ai-staff/db';
import { domainOf, isFreeMail } from '@ai-staff/mail';
import { z } from 'zod';

const input = z.object({ leadId: z.uuid() });
type Input = z.infer<typeof input>;

interface Output {
  leadId: string;
  items: { url: string; title: string | null; excerpt: string; kind: 'observed' }[];
}

/** Where to read about a lead: their website, or the domain of a company email address. Never a free-mail domain. */
export function researchUrl(lead: Pick<Lead, 'website' | 'email'>): string | null {
  if (lead.website) return /^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`;
  if (lead.email && !isFreeMail(lead.email)) return `https://${domainOf(lead.email)}`;
  return null;
}

/**
 * Reads a few pages of the lead's own site so the first email can be about them. No model call: dated excerpts of
 * what the pages say, through the SSRF-safe fetcher. A site that cannot be read is not an error: the first email is
 * then written from what the lead record says.
 */
export const researchLead: TaskDefinition<Input, Output> = {
  type: 'sales_manager.research_lead',
  name: 'Research a lead',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [{ event: 'lead.created' }],
  inputSchema: input,
  maxAttempts: 3,
  async execute(ctx, { leadId }) {
    const lead = await ctx.read((m) => m.findOneBy(Lead, { workspaceId: ctx.workspaceId, id: leadId }));
    if (!lead) throw new Cancel('The lead was removed.');
    if (lead.state !== 'new' && lead.state !== 'researching') throw new Cancel('The lead is already being worked.');
    const url = researchUrl(lead);
    if (!url) return { leadId, items: [] };
    const pages = await crawlSite(url, { maxPages: 3 }).catch(() => []);
    return {
      leadId,
      items: pages
        .filter((page) => page.text.trim())
        .map((page) => ({
          url: page.url,
          title: page.title,
          excerpt: [page.description, page.text].filter(Boolean).join('\n').slice(0, 2000),
          kind: 'observed' as const,
        })),
    };
  },
  toEffects(ctx, output) {
    return [
      { type: 'recordResearch', leadId: output.leadId, items: output.items },
      { type: 'updateLead', leadId: output.leadId, state: 'queued' },
      { type: 'emitEvent', event: 'lead.researched', payload: { staffId: ctx.staff.id, leadId: output.leadId } },
    ];
  },
};
