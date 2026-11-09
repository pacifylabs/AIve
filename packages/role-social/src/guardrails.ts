import {
  type Guardrail,
  type GuardrailResult,
  lengthOnNetwork,
  mediaProblem,
  NETWORK_MAX_CHARACTERS,
  type Network,
  type TaskContext,
} from '@ai-staff/core';
import { mentionsFor, settingsOf, signatureFor } from './settings.js';

const ok = <O>(output: O): GuardrailResult<O> => ({ ok: true, output });
const fail = <O>(reason: string): GuardrailResult<O> => ({ ok: false, reason });

export interface PostOutput {
  body: string;
  hashtags: string[];
  firstComment?: string | null;
  /** Up to three follow-up replies, written as a thread. Kept only as many as the staff member is set to write. */
  reply1?: string | null;
  reply2?: string | null;
  reply3?: string | null;
}

/** The network and media the plan chose for this post, from the task's own input. */
const target = (ctx: TaskContext) => ({
  network: String(ctx.run.input.network ?? '') as Network,
  mediaUrls: Array.isArray(ctx.run.input.mediaUrls) ? (ctx.run.input.mediaUrls as string[]) : [],
  handle: typeof ctx.run.input.handle === 'string' ? ctx.run.input.handle : null,
});

const EMOJI = /\p{Extended_Pictographic}/gu;

/** Hashtags the company never uses are refused; the "always" ones are added; the rest are capped at the maximum. */
export function hashtagPolicy(): Guardrail<PostOutput> {
  return {
    name: 'hashtagPolicy',
    check(output, ctx) {
      const { hashtags: policy } = settingsOf(ctx.staff);
      const never = new Set(policy.never.map((tag) => tag.toLowerCase()));
      const clean = output.hashtags.map((tag) => tag.replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean);
      const banned = clean.find((tag) => never.has(tag.toLowerCase()));
      if (banned) return fail(`It used #${banned}, which you asked never to use.`);
      const wanted = [...policy.always, ...clean];
      const unique = wanted.filter(
        (tag, index) => wanted.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) === index,
      );
      return ok({ ...output, hashtags: unique.slice(0, policy.max) });
    },
  };
}

/** Puts the hashtags at the end of the post, so length and every later check see the text that will be published. */
export function composeHashtags(): Guardrail<PostOutput> {
  return {
    name: 'composeHashtags',
    check(output) {
      if (!output.hashtags.length) return ok(output);
      const tags = output.hashtags.map((tag) => `#${tag}`).join(' ');
      return ok({ ...output, body: `${output.body.trimEnd()}\n\n${tags}`, hashtags: [] });
    },
  };
}

/**
 * Adds the account's saved sign-off after the hashtags, so the length, banned-word and link checks that follow all see the
 * text that will be published. The owner wrote it, so figures in it are not claims the model made: it is added to the text
 * the facts check may repeat.
 */
export function composeSignature(): Guardrail<PostOutput> {
  return {
    name: 'composeSignature',
    check(output, ctx) {
      const signature = signatureFor(settingsOf(ctx.staff), ctx.run.input.accountId);
      if (!signature || output.body.trimEnd().endsWith(signature)) return ok(output);
      (ctx.evidence ??= []).push(signature);
      return ok({ ...output, body: `${output.body.trimEnd()}\n\n${signature}` });
    },
  };
}

/** `none`: no emoji at all. `light`: at most two. `free`: any. */
export function emojiPolicy(): Guardrail<PostOutput> {
  return {
    name: 'emojiPolicy',
    check(output, ctx) {
      const { emoji } = settingsOf(ctx.staff);
      if (emoji === 'free') return ok(output);
      const count = (output.body.match(EMOJI) ?? []).length;
      const allowed = emoji === 'none' ? 0 : 2;
      return count <= allowed ? ok(output) : fail(`It used ${count} emoji; your setting allows ${allowed}.`);
    },
  };
}

/** The post must fit the network it goes to. Too long fails rather than being cut: a cut post can change its meaning. */
export function fitsNetwork(): Guardrail<PostOutput> {
  return {
    name: 'fitsNetwork',
    check(output, ctx) {
      const { network } = target(ctx);
      const max = NETWORK_MAX_CHARACTERS[network];
      if (!max) return fail(`${network || 'This network'} is not a network we can post to.`);
      const length = lengthOnNetwork(network, output.body);
      return length <= max ? ok(output) : fail(`It is ${length} characters; ${network} allows ${max}.`);
    },
  };
}

/** The networks whose publisher can post a reply to the post before it. */
export const CHAIN_NETWORKS: readonly string[] = ['x', 'threads', 'telegram', 'facebook', 'instagram'];

export const repliesOf = (output: PostOutput): string[] =>
  [output.reply1, output.reply2, output.reply3].map((reply) => reply?.trim() ?? '').filter(Boolean);

/**
 * Keeps only as many replies as the staff member is set to write, and none where the network cannot post a chain, so a
 * draft never promises a thread that will not go out. What is kept is then checked like the post itself.
 */
export function limitReplies(): Guardrail<PostOutput> {
  return {
    name: 'limitReplies',
    check(output, ctx) {
      const { network } = target(ctx);
      const allowed = CHAIN_NETWORKS.includes(network) ? settingsOf(ctx.staff).chainReplies : 0;
      const kept = repliesOf(output).slice(0, allowed);
      return ok({ ...output, reply1: kept[0] ?? null, reply2: kept[1] ?? null, reply3: kept[2] ?? null });
    },
  };
}

/** Each reply must fit the network, as the post does. */
export function repliesFit(): Guardrail<PostOutput> {
  return {
    name: 'repliesFit',
    check(output, ctx) {
      const { network } = target(ctx);
      const max = NETWORK_MAX_CHARACTERS[network];
      const tooLong = repliesOf(output).findIndex((reply) => lengthOnNetwork(network, reply) > max);
      return tooLong === -1 ? ok(output) : fail(`Reply ${tooLong + 1} is longer than the ${max} ${network} allows.`);
    },
  };
}

/** Instagram posts are pictures or video, and TikTok posts are video: without that there is nothing to publish. */
export function requiresMedia(): Guardrail<PostOutput> {
  return {
    name: 'requiresMedia',
    check(output, ctx) {
      const { network, mediaUrls } = target(ctx);
      const problem = mediaProblem(network, mediaUrls);
      return problem ? fail(`${problem} Add one to this item, then write it again.`) : ok(output);
    },
  };
}

/**
 * No @-mentions except the account itself and the accounts a person saved for that network: a made-up handle would tag a
 * real stranger. A handle saved for another network does not count, since the same name can be someone else there.
 */
export function noUnknownMentions(): Guardrail<PostOutput> {
  return {
    name: 'noUnknownMentions',
    check(output, ctx) {
      const { handle, network } = target(ctx);
      const allowed = new Set(
        [handle?.replace(/^@/, ''), ...mentionsFor(settingsOf(ctx.staff), network)]
          .filter((value): value is string => Boolean(value))
          .map((value) => value.toLowerCase()),
      );
      for (const text of [output.body, output.firstComment ?? '']) {
        for (const mention of text.match(/(?<![\w@])@[A-Za-z0-9_.]{2,}/g) ?? []) {
          if (!allowed.has(mention.slice(1).toLowerCase()))
            return fail(`It mentioned ${mention}, which was not given.`);
        }
      }
      return ok(output);
    },
  };
}

/** Words that always go to a person, whatever the model classified the message as. */
const SENSITIVE =
  /\b(refund|chargeback|lawyer|legal action|sue|suing|solicitor|gdpr|data protection|delete my data|personal data|my address|my phone|scam|fraud|police|report you)\b/i;

export const isSensitive = (text: string): boolean => SENSITIVE.test(text);
