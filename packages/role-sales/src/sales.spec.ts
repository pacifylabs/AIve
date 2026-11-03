import { RoleRegistry, type TaskContext } from '@ai-staff/core';
import { type Conversation, Lead } from '@ai-staff/db';
import { describe, expect, it } from 'vitest';
import { disclosure, emailLength, noSignatureInBody } from './guardrails.js';
import { localDayStart, nextWindowStart, warmUpCap } from './policy.js';
import { salesManagerRole } from './role.js';
import { salesSettingsSchema } from './settings.js';
import { researchUrl } from './tasks/research.js';
import { type Triage, triageReply } from './tasks/triage.js';

const hours = { start: 9, end: 17, weekdaysOnly: true };

describe('nextWindowStart', () => {
  it('returns now when inside the window', () => {
    const at = new Date('2026-11-03T10:00:00Z'); // Tuesday
    expect(nextWindowStart(at, 'UTC', hours)).toEqual(at);
  });

  it('moves an evening send to the next morning', () => {
    expect(nextWindowStart(new Date('2026-11-03T18:10:00Z'), 'UTC', hours).toISOString()).toBe(
      '2026-11-04T09:00:00.000Z',
    );
  });

  it('skips the weekend', () => {
    expect(nextWindowStart(new Date('2026-11-07T10:00:00Z'), 'UTC', hours).toISOString()).toBe(
      '2026-11-09T09:00:00.000Z',
    );
  });

  it("uses the recipient's time zone", () => {
    // 10:00 UTC is 05:00 in New York (EST), so the send waits until 09:00 New York = 14:00 UTC.
    expect(nextWindowStart(new Date('2026-11-03T10:00:00Z'), 'America/New_York', hours).toISOString()).toBe(
      '2026-11-03T14:00:00.000Z',
    );
  });
});

describe('localDayStart', () => {
  it('is local midnight as an instant', () => {
    expect(localDayStart(new Date('2026-11-03T10:00:00Z'), 'Africa/Lagos').toISOString()).toBe(
      '2026-11-02T23:00:00.000Z',
    );
  });
});

describe('warmUpCap', () => {
  const verified = new Date('2026-11-01T00:00:00Z');
  it('starts at 10 and reaches the setting after three weeks', () => {
    expect(warmUpCap(40, verified, verified)).toBe(10);
    expect(warmUpCap(40, verified, new Date('2026-11-11T12:00:00Z'))).toBe(25);
    expect(warmUpCap(40, verified, new Date('2026-11-25T00:00:00Z'))).toBe(40);
  });
  it('allows nothing before the mailbox is verified', () => {
    expect(warmUpCap(40, null, verified)).toBe(0);
  });
});

const ctx = (disclosureMode: 'ai_labelled' | 'named_human' = 'ai_labelled') =>
  ({
    staff: { displayName: 'Dee', disclosure: disclosureMode },
    facts: [],
    run: { input: {} },
  }) as unknown as TaskContext;

describe('sales guardrails', () => {
  it('removes a sign-off the model wrote, since the signature is added for it', () => {
    const result = noSignatureInBody().check({ subject: 'Hi', body: 'Hello.\n\nTalk soon.\n\nBest,\nDee' }, ctx());
    expect(result).toEqual({ ok: true, output: { subject: 'Hi', body: 'Hello.\n\nTalk soon.' } });
  });

  it('refuses an AI-labelled staff member claiming to be a person', () => {
    expect(disclosure().check({ body: "Don't worry, I'm a real person." }, ctx()).ok).toBe(false);
    expect(disclosure().check({ body: "Don't worry, I'm a real person." }, ctx('named_human')).ok).toBe(true);
  });

  it('enforces subject and body lengths', () => {
    expect(emailLength().check({ subject: 'x'.repeat(201), body: 'ok' }, ctx()).ok).toBe(false);
    expect(emailLength().check({ subject: 'ok', body: 'x'.repeat(4001) }, ctx()).ok).toBe(false);
  });
});

describe('researchUrl', () => {
  it('prefers the website, then a company email domain, never free mail', () => {
    expect(researchUrl({ website: 'buyer.test', email: null })).toBe('https://buyer.test');
    expect(researchUrl({ website: null, email: 'ada@buyer.test' })).toBe('https://buyer.test');
    expect(researchUrl({ website: null, email: 'ada@gmail.com' })).toBeNull();
  });
});

describe('the role', () => {
  it('registers cleanly and defaults every sending task to drafts', () => {
    const registry = new RoleRegistry().register(salesManagerRole);
    for (const task of salesManagerRole.tasks.filter((task) => task.risk === 'acts_external')) {
      expect(registry.task(task.type).task.defaultAutonomy).toBe('draft');
    }
  });

  it('has safe default settings', () => {
    const settings = salesSettingsSchema.parse({});
    expect(settings).toMatchObject({ mailboxId: null, dailyNewContacts: 20, followUps: { count: 2 } });
    expect(() => salesSettingsSchema.parse({ cta: { kind: 'book', url: 'http://insecure.test' } })).toThrow();
  });
});

describe('triage clamping', () => {
  const lead = { id: 'lead-1', name: 'Ada', email: 'ada@buyer.test' } as Lead;
  const conversation = { id: 'conv-1', subject: 'Hello', recipientEmail: 'ada@buyer.test' } as Conversation;
  const triageCtx = (autonomy: 'draft' | 'act') =>
    ({
      ...ctx(),
      workspaceId: 'ws',
      autonomy,
      read: (work: (m: unknown) => Promise<unknown>) =>
        work({ findOneByOrFail: (entity: unknown) => Promise.resolve(entity === Lead ? lead : conversation) }),
    }) as unknown as TaskContext;
  const input = { leadId: 'lead-1', conversationId: 'conv-1', messageId: 'msg-1', conversationVersion: 4 };
  const decide = (decision: Triage, autonomy: 'draft' | 'act' = 'act') =>
    Promise.resolve(triageReply.toEffects(triageCtx(autonomy), decision, input));

  it('an opt-out always suppresses, whatever the model wanted to send', async () => {
    const effects = await decide({
      classification: 'opt_out',
      action: 'reply',
      body: 'Sorry to see you go',
      reason: 'r',
    });
    expect(effects.map((effect) => effect.type)).toEqual(['suppress', 'alert']);
  });

  it('a reply without a body escalates', async () => {
    const effects = await decide({ classification: 'question', action: 'reply', reason: 'needs pricing' });
    expect(effects.map((effect) => effect.type)).toContain('escalate');
  });

  it('answers a question directly only at act', async () => {
    const reply: Triage = { classification: 'question', action: 'reply', body: 'Yes, it does.', reason: 'r' };
    expect((await decide(reply, 'act')).map((effect) => effect.type)).toEqual([
      'updateConversation',
      'createSendIntent',
    ]);
    expect((await decide(reply, 'draft')).map((effect) => effect.type)).toEqual([
      'updateConversation',
      'createWorkItem',
    ]);
  });

  it('an objection stays a draft even when promoted', async () => {
    const effects = await decide({ classification: 'objection', action: 'reply', body: 'I understand.', reason: 'r' });
    expect(effects.map((effect) => effect.type)).toEqual(['updateConversation', 'createWorkItem']);
  });

  it('out of office waits and sends nothing', async () => {
    const effects = await decide({ classification: 'out_of_office', action: 'wait', reason: 'away' });
    expect(effects).toEqual([expect.objectContaining({ type: 'updateConversation', state: 'waiting' })]);
  });
});
