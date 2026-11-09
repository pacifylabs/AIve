import type { Guardrail, GuardrailResult, TaskContext } from '../roles/types.js';

/**
 * The shared guardrail library. Each factory takes the output field(s) it checks, so one guardrail works for any
 * role whose output has text in it. Roles compose these and add their own.
 */

type TextFields<O> = { [K in keyof O]: O[K] extends string | null | undefined ? K : never }[keyof O];

const ok = <O>(output: O): GuardrailResult<O> => ({ ok: true, output });
const fail = <O>(reason: string): GuardrailResult<O> => ({ ok: false, reason });

function textsOf<O>(output: O, fields: TextFields<O>[]): string[] {
  return fields
    .map((field) => output[field])
    .filter((value): value is O[TextFields<O>] & string => typeof value === 'string');
}

const hostOf = (value: string): string | null => {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return null;
  }
};

/** The hosts a staff member may link to: the company website plus every confirmed `link_domain` fact. */
export function allowedHosts(ctx: TaskContext): Set<string> {
  const hosts = ctx.facts.filter((fact) => fact.kind === 'link_domain').map((fact) => hostOf(fact.text));
  if (ctx.profile?.website) hosts.push(hostOf(ctx.profile.website));
  return new Set(hosts.filter((host): host is string => Boolean(host)));
}

/**
 * Every link must go to one of the company's own domains (subdomains included). Ported from KudiBooks `linksAllowed`:
 * a page or a reply that talked the model into linking elsewhere is refused, not rewritten.
 */
export function allowedLinks<O>(...fields: TextFields<O>[]): Guardrail<O> {
  return {
    name: 'allowedLinks',
    check(output, ctx) {
      const allowed = allowedHosts(ctx);
      for (const text of textsOf(output, fields)) {
        for (const link of text.match(/https?:\/\/[^\s)>"'\]]+/gi) ?? []) {
          const host = hostOf(link);
          const permitted = host && [...allowed].some((domain) => host === domain || host.endsWith(`.${domain}`));
          if (!permitted)
            return fail(`It linked to ${host ?? 'an unreadable address'}, which is not one of your domains.`);
        }
      }
      return ok(output);
    },
  };
}

/** Recognises a polite way to stop already present in the text (from KudiBooks). */
const HAS_OPT_OUT =
  /reply stop|just say so|not for you|rather not hear|unsubscribe|won't write again|will not write again/i;
export const OPT_OUT_LINE = 'If you would rather not hear from me, reply STOP and I will not write again.';

/** First-touch emails carry a plain way to stop hearing from us. If the model left it out, it is appended. */
export function optOutPresent<O>(field: TextFields<O>): Guardrail<O> {
  return {
    name: 'optOutPresent',
    check(output) {
      const text = output[field];
      if (typeof text !== 'string' || HAS_OPT_OUT.test(text)) return ok(output);
      return ok({ ...output, [field]: `${text.trimEnd()}\n\n${OPT_OUT_LINE}` });
    },
  };
}

/** Numbers that carry a claim: prices, percentages, counts, years. Single digits are left alone ("2 minutes"). */
const CLAIM_NUMBER = /(?:[$£€₦]\s?)?\d[\d,]*(?:\.\d+)?\s?%?/g;
const normaliseNumber = (value: string) => value.replace(/[\s,]/g, '').replace(/^[$£€₦]/, '');

/**
 * Every price, percentage or other figure in the output must appear in the company's confirmed facts or in the run's
 * own input data. This is what stops a staff member inventing a discount or a statistic.
 */
export function factsOnly<O>(...fields: TextFields<O>[]): Guardrail<O> {
  return {
    name: 'factsOnly',
    check(output, ctx) {
      const numbersIn = (texts: string[]) =>
        new Set(texts.flatMap((text) => text.match(CLAIM_NUMBER) ?? []).map(normaliseNumber));
      const known = numbersIn([...ctx.facts.map((fact) => fact.text), JSON.stringify(ctx.run.input)]);
      // Figures quoted from the other side's own words, but never as a price or a percentage: an injected page
      // must not be able to put "90% off" in our mouth.
      const quoted = numbersIn(ctx.evidence ?? []);
      for (const text of textsOf(output, fields)) {
        for (const raw of text.match(CLAIM_NUMBER) ?? []) {
          const value = normaliseNumber(raw);
          if (/^\d$/.test(value)) continue;
          if (known.has(value)) continue;
          if (!/[$£€₦%]/.test(raw) && quoted.has(value)) continue;
          return fail(`It used "${raw.trim()}", which is not in your confirmed facts.`);
        }
      }
      return ok(output);
    },
  };
}

/** None of the company's banned words or claims may appear (whole words, any case). */
export function bannedTerms<O>(...fields: TextFields<O>[]): Guardrail<O> {
  return {
    name: 'bannedTerms',
    check(output, ctx) {
      const banned = ctx.facts
        .filter((fact) => fact.kind === 'banned')
        .map((fact) => fact.text.trim())
        .filter(Boolean);
      for (const text of textsOf(output, fields)) {
        for (const term of banned) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i').test(text))
            return fail(`It used "${term}", which you asked never to use.`);
        }
      }
      return ok(output);
    },
  };
}

export type Network = 'facebook' | 'instagram' | 'threads' | 'linkedin' | 'tiktok' | 'x' | 'telegram' | 'discord';

/** Post length limits per network (from KudiBooks `PLATFORM_LIMITS`, plus LinkedIn Pages). */
export const NETWORK_MAX_CHARACTERS: Readonly<Record<Network, number>> = {
  facebook: 63_206,
  instagram: 2_200,
  linkedin: 3_000,
  tiktok: 2_200,
  x: 280,
  threads: 500,
  telegram: 4_096,
  discord: 2_000,
};

const EMOJI = /^\p{Extended_Pictographic}/u;

/** X counts any link as 23 characters, however long it is. */
const FIXED_LINK_LENGTH = 23;
const FIXED_LINK_NETWORKS: readonly Network[] = ['x'];

/**
 * How many characters a post takes on a network. X counts any link as 23 characters, Threads counts an emoji as the
 * bytes it takes (Meta's rule), and the rest count what is typed.
 */
export function lengthOnNetwork(network: Network, text: string): number {
  if (FIXED_LINK_NETWORKS.includes(network)) {
    const links = text.match(/https?:\/\/\S+/g) ?? [];
    return text.replace(/https?:\/\/\S+/g, '').length + links.length * FIXED_LINK_LENGTH;
  }
  if (network === 'threads') {
    let count = 0;
    for (const symbol of text) count += EMOJI.test(symbol) ? new TextEncoder().encode(symbol).length : 1;
    return count;
  }
  return text.length;
}

/** The text must fit the network. Too long fails rather than being cut, since a cut post can change its meaning. */
export function lengthFor<O>(network: Network, field: TextFields<O>): Guardrail<O> {
  return {
    name: `lengthFor:${network}`,
    check(output) {
      const text = output[field];
      if (typeof text !== 'string') return ok(output);
      const length = lengthOnNetwork(network, text);
      const max = NETWORK_MAX_CHARACTERS[network];
      return length <= max ? ok(output) : fail(`It is ${length} characters; ${network} allows ${max}.`);
    },
  };
}

/** Runs guardrails in order, passing each one's (possibly fixed) output to the next. Stops at the first failure. */
export function applyGuardrails<O>(
  guardrails: Guardrail<O>[],
  output: O,
  ctx: TaskContext,
): { ok: true; output: O } | { ok: false; reason: string; guardrail: string; output: O } {
  let current = output;
  for (const guardrail of guardrails) {
    const result = guardrail.check(current, ctx);
    if (!result.ok) return { ok: false, reason: result.reason, guardrail: guardrail.name, output: current };
    current = result.output;
  }
  return { ok: true, output: current };
}

const VIDEO_LINK = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

/** Why a post for this network cannot go out without pictures or video, or null. Shared by drafts and hand-written posts. */
export function mediaProblem(network: Network, mediaUrls: readonly string[]): string | null {
  if (network === 'instagram' && mediaUrls.length === 0) return 'Instagram posts need a picture or a video.';
  if (network === 'tiktok' && !mediaUrls.some((url) => VIDEO_LINK.test(url))) return 'TikTok posts need a video.';
  return null;
}

/** Networks whose publisher puts the link on its own line after the words, so it takes room in the post. */
const LINK_IN_TEXT: readonly Network[] = ['x', 'telegram', 'discord'];

/** Whether the words fit the network, counting the link where the publisher adds it to the text. A reason, or null. */
export function lengthProblem(input: { network: Network; body: string; linkUrl?: string | null }): string | null {
  const text = input.linkUrl && LINK_IN_TEXT.includes(input.network) ? `${input.body}\n${input.linkUrl}` : input.body;
  const limit = NETWORK_MAX_CHARACTERS[input.network];
  const used = lengthOnNetwork(input.network, text);
  if (used <= limit) return null;
  const over = used - limit;
  return `It is ${over} character${over === 1 ? '' : 's'} over the ${limit} that ${input.network} allows.`;
}

/** Whether a finished post fits its network and has the media it needs. A reason in plain words, or null. */
export function postProblem(input: {
  network: Network;
  body: string;
  linkUrl?: string | null;
  mediaUrls: readonly string[];
}): string | null {
  return lengthProblem(input) ?? mediaProblem(input.network, input.mediaUrls);
}
