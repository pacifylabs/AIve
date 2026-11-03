import {
  allowedLinks,
  APPROVED_PAYLOAD,
  bannedTerms,
  Cancel,
  type Effect,
  factsOnly,
  type TaskDefinition,
  untrusted,
} from '@ai-staff/core';
import { ConnectedAccount, SocialEngagement, SocialPost } from '@ai-staff/db';
import { z } from 'zod';
import { isSensitive } from '../guardrails.js';
import { companyBlock, RULES, SMALL_MODEL } from '../prompts.js';
import { settingsOf } from '../settings.js';

const input = z.object({ engagementId: z.uuid() });
type Input = z.infer<typeof input>;

export const ENGAGEMENT_CLASSES = ['question', 'praise', 'complaint', 'buying_intent', 'spam', 'other'] as const;

export const triageSchema = z.object({
  classification: z.enum(ENGAGEMENT_CLASSES),
  reply: z.string().max(1000).nullish().describe('A short reply in the company voice, only if one is worth sending.'),
  reason: z.string().max(300).describe('Why, in one sentence, for the person reading the log.'),
});
export type Triage = z.infer<typeof triageSchema>;

type Reply = { reply?: string | null };

/**
 * Reads a comment or private message and decides what happens. The model proposes; the rules below decide: complaints,
 * anything legal, a refund or personal data always go to a person and are never auto-replied to, a private message past
 * the network's reply window is not answered (the window rule), and a reply is never sent without a person: replies are
 * not promotable at launch, whatever the autonomy setting says.
 */
export const triageEngagement: TaskDefinition<Input, Triage & Reply> = {
  type: 'social_media.triage_engagement',
  name: 'Answer a comment or message',
  risk: 'drafts',
  defaultAutonomy: 'draft',
  triggers: [{ event: 'engagement.received' }],
  inputSchema: input,
  maxAttempts: 3,
  model: SMALL_MODEL,
  outputSchema: triageSchema,
  async buildPrompt(ctx, { engagementId }) {
    const settings = settingsOf(ctx.staff);
    const { engagement, post } = await ctx.read(async (m) => {
      const engagement = await m.findOneBy(SocialEngagement, { workspaceId: ctx.workspaceId, id: engagementId });
      return {
        engagement,
        post: engagement?.postId
          ? await m.findOneBy(SocialPost, { workspaceId: ctx.workspaceId, id: engagement.postId })
          : null,
      };
    });
    if (!engagement) throw new Cancel('That comment was removed.');
    if (engagement.state !== 'new') throw new Cancel('That comment was already handled.');
    const company = companyBlock(ctx, settings);
    ctx.evidence?.push(engagement.text);
    const tag = engagement.kind === 'dm' ? 'message_data' : 'comment_data';
    return {
      system: [
        RULES,
        `You are ${ctx.staff.displayName}. Never say or imply you are a person.`,
        `Always leave the reply empty and escalate when: ${settings.replyPolicy.alwaysEscalate.trim() || 'the person is upset, asks for a refund, mentions a lawyer or personal data, or asks for anything not in the facts'}.`,
        `Company facts:\n${company.text}`,
      ].join('\n\n'),
      user: [
        post ? `Our post they are replying to:\n${post.body}` : '',
        `${engagement.authorName ?? 'Someone'} wrote ${engagement.kind === 'dm' ? 'a private message' : 'a comment'}:`,
        untrusted(tag, engagement.text),
        'Classify it. If a reply is worth sending, write one short reply using only the company facts. A buying_intent is someone asking how to buy, book or get a quote.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      factIds: company.factIds,
    };
  },
  guardrails: [
    factsOnly<Triage & Reply>('reply'),
    allowedLinks<Triage & Reply>('reply'),
    bannedTerms<Triage & Reply>('reply'),
  ],
  async toEffects(ctx, decision, { engagementId }) {
    const settings = settingsOf(ctx.staff);
    const { engagement, account } = await ctx.read(async (m) => {
      const engagement = await m.findOneByOrFail(SocialEngagement, { workspaceId: ctx.workspaceId, id: engagementId });
      return {
        engagement,
        account: await m.findOneByOrFail(ConnectedAccount, { workspaceId: ctx.workspaceId, id: engagement.accountId }),
      };
    });
    const who = engagement.authorName ?? 'Someone';
    const mark = (state: 'triaged' | 'dismissed'): Effect => ({
      type: 'updateEngagement',
      engagementId,
      classification: decision.classification,
      state,
    });
    const escalate = (reason: string): Effect[] => [
      mark('triaged'),
      {
        type: 'escalate',
        title: `${who} on ${account.name} needs you`,
        reason,
        payload: { engagementId, classification: decision.classification, text: engagement.text.slice(0, 1000) },
      },
    ];

    if (decision.classification === 'spam') return [mark('dismissed')];
    // Never answered by us, whatever the model said: these are a person's to handle.
    if (decision.classification === 'complaint' || isSensitive(engagement.text)) {
      return escalate(
        decision.classification === 'complaint'
          ? 'A complaint. Complaints are never answered automatically.'
          : 'It mentions a refund, a legal matter or personal data.',
      );
    }

    const effects: Effect[] = [];
    if (decision.classification === 'buying_intent') {
      effects.push({
        type: 'createLead',
        name: engagement.authorName,
        sourceRef: `${account.id}:${engagement.authorName ?? engagement.externalId}`,
        notes: `Asked on ${account.name} (${engagement.kind}): "${engagement.text.slice(0, 300)}"`,
      });
    }
    const reply = decision.reply?.trim();
    if (engagement.kind === 'dm' && engagement.replyWindowEndsAt && ctx.now > engagement.replyWindowEndsAt) {
      return [
        ...effects,
        ...escalate("The network's reply window for this message has closed, so it cannot be answered from here."),
      ];
    }
    if (!reply || !settings.replyPolicy.draftReplies) {
      return [...effects, mark('triaged')];
    }
    return [
      ...effects,
      mark('triaged'),
      {
        type: 'createWorkItem',
        kind: 'reply_draft',
        title: `Reply to ${who} on ${account.name}`,
        payload: {
          staffId: ctx.staff.id,
          engagementId,
          accountId: account.id,
          replyTo: engagement.text.slice(0, 500),
          reply,
        },
        // Approving queues the reply with the wording the person left. The sender re-checks the network's window.
        onApprove: [
          {
            type: 'createReplyIntent',
            engagementId,
            message: APPROVED_PAYLOAD,
            idempotencyKey: `reply:${engagementId}`,
          },
        ],
        expiresInHours: engagement.kind === 'dm' ? 20 : 24 * 3,
      },
    ];
  },
};
