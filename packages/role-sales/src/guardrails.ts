import type { Guardrail, GuardrailResult } from '@ai-staff/core';

const ok = <O>(output: O): GuardrailResult<O> => ({ ok: true, output });
const fail = <O>(reason: string): GuardrailResult<O> => ({ ok: false, reason });

interface Email {
  subject?: string;
  body?: string;
}

const SIGN_OFF =
  /^(best|best regards|kind regards|regards|warm regards|thanks|thank you|many thanks|cheers|sincerely|all the best)[,!.]?$/i;

/**
 * The signature is added by the platform, so a sign-off the model wrote would appear twice. Trailing sign-off lines
 * and the staff member's own name are removed, not refused.
 */
export function noSignatureInBody<O extends Email>(): Guardrail<O> {
  return {
    name: 'noSignatureInBody',
    check(output, ctx) {
      if (typeof output.body !== 'string') return ok(output);
      const name = ctx.staff.displayName.trim().toLowerCase();
      const lines = output.body.trimEnd().split('\n');
      while (lines.length > 1) {
        const last = (lines.at(-1) ?? '').trim();
        if (!last || SIGN_OFF.test(last) || last.toLowerCase() === name || last.toLowerCase().startsWith(`${name},`)) {
          lines.pop();
        } else break;
      }
      return ok({ ...output, body: lines.join('\n').trimEnd() });
    },
  };
}

const HUMAN_CLAIM =
  /\b(i am|i'm|i’m) (a )?(real|human|actual) (person|human)\b|\bnot an? (ai|bot|robot)\b|\b(i am|i'm|i’m) not (an )?(ai|bot|automated)\b/i;

/** An AI-labelled staff member never says it is a person. */
export function disclosure<O extends Email>(): Guardrail<O> {
  return {
    name: 'disclosure',
    check(output, ctx) {
      if (ctx.staff.disclosure !== 'ai_labelled') return ok(output);
      const text = `${output.subject ?? ''}\n${output.body ?? ''}`;
      return HUMAN_CLAIM.test(text)
        ? fail('It claimed to be a person, but this staff member is an AI assistant.')
        : ok(output);
    },
  };
}

/** Subject at most 200 characters, body at most 4,000. */
export function emailLength<O extends Email>(): Guardrail<O> {
  return {
    name: 'emailLength',
    check(output) {
      if ((output.subject?.length ?? 0) > 200) return fail('The subject is longer than 200 characters.');
      if ((output.body?.length ?? 0) > 4000) return fail('The email is longer than 4,000 characters.');
      return ok(output);
    },
  };
}
