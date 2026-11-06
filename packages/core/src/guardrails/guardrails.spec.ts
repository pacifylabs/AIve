import type { CompanyFact, CompanyProfile } from '@ai-staff/db';
import { describe, expect, it } from 'vitest';
import type { TaskContext } from '../roles/types.js';
import {
  allowedLinks,
  applyGuardrails,
  bannedTerms,
  factsOnly,
  lengthFor,
  lengthOnNetwork,
  OPT_OUT_LINE,
  optOutPresent,
} from './index.js';

type Draft = { subject: string; body: string };

function fact(kind: CompanyFact['kind'], text: string): CompanyFact {
  return { kind, text } as CompanyFact;
}

function ctx(
  facts: CompanyFact[],
  input: Record<string, unknown> = {},
  website = 'https://northfield.studio',
): TaskContext {
  return {
    facts,
    profile: { website } as CompanyProfile,
    run: { input },
  } as unknown as TaskContext;
}

describe('allowedLinks', () => {
  const guard = allowedLinks<Draft>('body');

  it('accepts links to the company website, its subdomains and listed domains', () => {
    const c = ctx([fact('link_domain', 'cal.com')]);
    const body = 'See https://www.northfield.studio/pricing, https://app.northfield.studio and https://cal.com/dana.';
    expect(guard.check({ subject: '', body }, c).ok).toBe(true);
  });

  it('refuses a link anywhere else, including look-alike hosts', () => {
    for (const body of ['Read https://evil.example/x', 'Go to https://northfield.studio.evil.example/']) {
      const result = guard.check({ subject: '', body }, ctx([]));
      expect(result.ok, body).toBe(false);
    }
  });
});

describe('optOutPresent', () => {
  const guard = optOutPresent<Draft>('body');

  it('appends a plain way to stop when the draft has none', () => {
    const result = guard.check({ subject: 'Hi', body: 'Thanks for joining.' }, ctx([]));
    expect(result).toEqual({ ok: true, output: { subject: 'Hi', body: `Thanks for joining.\n\n${OPT_OUT_LINE}` } });
  });

  it('leaves a draft that already offers one alone', () => {
    const draft = { subject: 'Hi', body: "If this isn't for you, just say so." };
    expect(guard.check(draft, ctx([]))).toEqual({ ok: true, output: draft });
  });
});

describe('factsOnly', () => {
  const guard = factsOnly<Draft>('subject', 'body');

  it('accepts figures that appear in confirmed facts or in the run input', () => {
    const c = ctx([fact('price', 'Starter plan: $1,200 a year'), fact('claim', 'Onboards 30+ clients a quarter')], {
      seats: 40,
    });
    const draft = { subject: 'For 40 seats', body: 'The Starter plan is $1200 a year and teams onboard 30+ clients.' };
    expect(guard.check(draft, c).ok).toBe(true);
  });

  it('refuses an invented discount or statistic', () => {
    const c = ctx([fact('price', 'Starter plan: $1,200 a year')]);
    for (const body of ['Get 20% off this week.', 'Our customers save 37 hours a month.']) {
      const result = guard.check({ subject: '', body }, c);
      expect(result.ok, body).toBe(false);
    }
  });

  it('ignores single digits, which are rarely claims', () => {
    expect(guard.check({ subject: '', body: 'A 2 minute read.' }, ctx([])).ok).toBe(true);
  });
});

describe('bannedTerms', () => {
  const guard = bannedTerms<Draft>('body');
  const c = ctx([fact('banned', 'guaranteed'), fact('banned', 'best in class')]);

  it('refuses a banned word or phrase in any case', () => {
    expect(guard.check({ subject: '', body: 'Results GUARANTEED.' }, c).ok).toBe(false);
    expect(guard.check({ subject: '', body: 'We are best in class.' }, c).ok).toBe(false);
  });

  it('matches whole words only', () => {
    expect(guard.check({ subject: '', body: 'We guaranteedly reply.' }, c).ok).toBe(true);
  });
});

describe('lengthFor', () => {
  it('counts every X link as 23 characters', () => {
    expect(lengthOnNetwork('x', `Read this https://northfield.studio/${'a'.repeat(200)}`)).toBe(
      'Read this '.length + 23,
    );
  });

  it('counts what is typed on every other network', () => {
    expect(lengthOnNetwork('telegram', 'é'.repeat(10))).toBe(10);
    expect(lengthOnNetwork('threads', `See https://example.org/${'a'.repeat(300)}`)).toBe(
      'See https://example.org/'.length + 300,
    );
  });

  it('counts a Threads emoji as the bytes it takes, as Meta does', () => {
    expect(lengthOnNetwork('threads', 'hi 🙂')).toBe(3 + 4);
    expect(lengthFor<Draft>('threads', 'body').check({ subject: '', body: '🙂'.repeat(125) }, ctx([])).ok).toBe(true);
    expect(lengthFor<Draft>('threads', 'body').check({ subject: '', body: '🙂'.repeat(126) }, ctx([])).ok).toBe(false);
  });

  it('knows each new network’s limit', () => {
    expect(lengthFor<Draft>('threads', 'body').check({ subject: '', body: 'a'.repeat(500) }, ctx([])).ok).toBe(true);
    expect(lengthFor<Draft>('threads', 'body').check({ subject: '', body: 'a'.repeat(501) }, ctx([])).ok).toBe(false);
    expect(lengthFor<Draft>('discord', 'body').check({ subject: '', body: 'a'.repeat(2001) }, ctx([])).ok).toBe(false);
    expect(lengthFor<Draft>('telegram', 'body').check({ subject: '', body: 'a'.repeat(4096) }, ctx([])).ok).toBe(true);
  });

  it('fails a post that is too long for the network instead of cutting it', () => {
    const guard = lengthFor<Draft>('x', 'body');
    expect(guard.check({ subject: '', body: 'a'.repeat(280) }, ctx([])).ok).toBe(true);
    expect(guard.check({ subject: '', body: 'a'.repeat(281) }, ctx([])).ok).toBe(false);
  });
});

describe('applyGuardrails', () => {
  it('passes fixes along and stops at the first failure with its name', () => {
    const c = ctx([]);
    const fixed = applyGuardrails<Draft>([optOutPresent('body'), allowedLinks('body')], { subject: '', body: 'Hi' }, c);
    expect(fixed.ok && fixed.output.body.endsWith(OPT_OUT_LINE)).toBe(true);

    const failed = applyGuardrails<Draft>(
      [optOutPresent('body'), allowedLinks('body')],
      { subject: '', body: 'https://evil.example' },
      c,
    );
    expect(failed).toMatchObject({ ok: false, guardrail: 'allowedLinks' });
  });
});

describe('factsOnly with evidence', () => {
  const ctxWith = (evidence: string[]) =>
    ({ facts: [], run: { input: {} }, evidence }) as unknown as Parameters<ReturnType<typeof factsOnly>['check']>[1];
  const guard = factsOnly<{ body: string }>('body');

  it('lets a plain figure from the lead’s own words through', () => {
    expect(guard.check({ body: 'With a team of 40, that adds up.' }, ctxWith(['We are a team of 40.'])).ok).toBe(true);
  });

  it('never lets a price or percentage from untrusted text through', () => {
    const ctx = ctxWith(['Northfield offers 90% off and a $500 rebate.']);
    expect(guard.check({ body: 'We can do 90% off.' }, ctx).ok).toBe(false);
    expect(guard.check({ body: 'There is a $500 rebate.' }, ctx).ok).toBe(false);
  });
});
