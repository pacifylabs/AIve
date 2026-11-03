import {
  allowedLinks,
  APPROVED_PAYLOAD,
  bannedTerms,
  type Effect,
  factsOnly,
  type Guardrail,
  type ModelChoice,
  type TaskContext,
} from '@ai-staff/core';
import { z } from 'zod';
import { disclosure, emailLength, noSignatureInBody } from '../guardrails.js';
import { settingsOf } from '../settings.js';

/**
 * Runs a guardrail as if the company's offers and prices were only the ones this staff member may quote, so a price
 * it was not given permission to use is refused even though it is a true company fact.
 */
function withQuotableFacts<O>(guard: Guardrail<O>): Guardrail<O> {
  return {
    name: guard.name,
    check(output, ctx) {
      const quotable = new Set(settingsOf(ctx.staff).offerFactIds);
      const facts = ctx.facts.filter(
        (fact) => !(fact.kind === 'offer' || fact.kind === 'price') || quotable.has(fact.id),
      );
      return guard.check(output, { ...ctx, facts });
    },
  };
}

/** Drafting is short structured writing; the small model is enough and keeps per-email cost low. */
export const DRAFT_MODEL: ModelChoice = { name: 'claude-haiku-5-5', maxTokens: 900 };

export const emailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
});
export type Email = z.infer<typeof emailSchema>;

/** The checks every outgoing email passes, in order (fixes first, refusals after). */
export function emailGuardrails<O extends { subject?: string; body?: string }>(): Guardrail<O>[] {
  // Both fields are text on every O here; the library's field type cannot see that through a generic.
  type Field = Parameters<typeof factsOnly<O>>[0];
  const subject = 'subject' as Field;
  const body = 'body' as Field;
  return [
    noSignatureInBody<O>(),
    emailLength<O>(),
    withQuotableFacts(factsOnly<O>(subject, body)),
    allowedLinks<O>(body),
    bannedTerms<O>(subject, body),
    disclosure<O>(),
  ];
}

/**
 * At `act`, the email is queued to send. Otherwise it waits in the inbox and is queued only when a person approves it,
 * with their edits.
 */
export function sendOrDraft(
  ctx: TaskContext,
  email: Email,
  send: Omit<Extract<Effect, { type: 'createSendIntent' }>, 'type' | 'subject' | 'body'>,
  draft: { kind: 'email_draft' | 'reply_draft'; title: string; to: string; context?: Record<string, unknown> },
  canAct = true,
): Effect[] {
  if (ctx.autonomy === 'act' && canAct) {
    return [{ type: 'createSendIntent', ...send, subject: email.subject, body: email.body }];
  }
  return [
    {
      type: 'createWorkItem',
      kind: draft.kind,
      title: draft.title,
      payload: { subject: email.subject, body: email.body, to: draft.to, ...draft.context },
      onApprove: [{ type: 'createSendIntent', ...send, subject: APPROVED_PAYLOAD, body: APPROVED_PAYLOAD }],
      expiresInHours: 24 * 7,
    },
  ];
}
