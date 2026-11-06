import {
  type Guardrail,
  type GuardrailResult,
  lengthOnNetwork,
  NETWORK_MAX_CHARACTERS,
  type Network,
  type TaskContext,
} from '@ai-staff/core';
import { settingsOf } from './settings.js';

const ok = <O>(output: O): GuardrailResult<O> => ({ ok: true, output });
const fail = <O>(reason: string): GuardrailResult<O> => ({ ok: false, reason });

export interface PostOutput {
  body: string;
  hashtags: string[];
  firstComment?: string | null;
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

const VIDEO_LINK = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

/** Instagram posts are pictures or video, and TikTok posts are video: without that there is nothing to publish. */
export function requiresMedia(): Guardrail<PostOutput> {
  return {
    name: 'requiresMedia',
    check(output, ctx) {
      const { network, mediaUrls } = target(ctx);
      if (network === 'instagram' && mediaUrls.length === 0)
        return fail('Instagram posts need a picture or a video. Add one to this item, then write it again.');
      if (network === 'tiktok' && !mediaUrls.some((url) => VIDEO_LINK.test(url)))
        return fail('TikTok posts need a video. Add one to this item, then write it again.');
      return ok(output);
    },
  };
}

/** No @-mentions of accounts that were not given: a made-up handle would tag a real stranger. */
export function noUnknownMentions(): Guardrail<PostOutput> {
  return {
    name: 'noUnknownMentions',
    check(output, ctx) {
      const { handle } = target(ctx);
      const allowed = handle?.replace(/^@/, '').toLowerCase();
      for (const text of [output.body, output.firstComment ?? '']) {
        for (const mention of text.match(/(?<![\w@])@[A-Za-z0-9_.]{2,}/g) ?? []) {
          if (mention.slice(1).toLowerCase() !== allowed) return fail(`It mentioned ${mention}, which was not given.`);
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
