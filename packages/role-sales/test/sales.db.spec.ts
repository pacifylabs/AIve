import { randomBytes } from 'node:crypto';
import {
  ApprovalService,
  CompanyBrain,
  hireStaff,
  inboundSecretHash,
  Keyring,
  MailDispatcher,
  MailInbox,
  RoleRegistry,
  TaskEngine,
  Triggers,
} from '@ai-staff/core';
import {
  ActivityEvent,
  asSystem,
  Conversation,
  createDataSource,
  type DataSource,
  DomainEvent,
  Lead,
  Mailbox,
  SendIntent,
  StaffTaskSetting,
  Suppression,
  TaskRun,
  WorkItem,
  withTenant,
} from '@ai-staff/db';
import { type FakeReply, FakeModelProvider, type GenerateRequest } from '@ai-staff/llm';
import { FixtureTransport, type InboundMail } from '@ai-staff/mail';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { salesManagerRole, salesSendHooks, type Triage } from '../src/index.js';

let db: DataSource;
beforeAll(async () => {
  db = await createDataSource({
    host: process.env.TEST_DB_HOST!,
    port: Number(process.env.TEST_DB_PORT),
    database: process.env.TEST_DB_NAME!,
    username: process.env.TEST_DB_APP_USER!,
    password: process.env.TEST_DB_APP_PASSWORD!,
    poolSize: 5,
  }).initialize();
});
afterAll(async () => {
  await db.destroy();
});

const keyring = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');

/** What the fake model answers, by task: tests overwrite these to script a scenario. */
interface Script {
  first: { subject: string; body: string };
  followUp: { subject: string; body: string };
  triage: Triage;
}

function modelFor(script: Script) {
  return new FakeModelProvider((request: GenerateRequest<z.ZodType>): FakeReply => {
    if (request.user.includes('Write a first email')) return { output: script.first };
    if (request.user.includes('Write follow-up number')) return { output: script.followUp };
    if (request.user.includes('Classify their latest message')) return { output: script.triage };
    return { error: new Error(`Unexpected prompt: ${request.user.slice(0, 80)}`) };
  });
}

async function setup(at = '2026-11-03T10:00:00Z') {
  const time = { now: new Date(at) };
  const now = () => new Date(time.now);
  const userId = uuidv7();
  const workspaceId = uuidv7();
  await asSystem(db, 'test: create a user and workspace', async (m) => {
    await m.query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, 'Owner', 'x')`, [
      userId,
      `${userId}@test.local`,
    ]);
    await m.query(`INSERT INTO workspaces (id, name, slug, timezone) VALUES ($1, 'Northfield', $2, 'UTC')`, [
      workspaceId,
      `ws-${workspaceId}`,
    ]);
    await m.query(`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES ($1, $2, $3, 'owner')`, [
      uuidv7(),
      workspaceId,
      userId,
    ]);
  });
  const actor = { workspaceId, userId };
  const inWs = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(db, { workspaceId, userId: null }, work);

  const brain = new CompanyBrain(db, now);
  await brain.updateProfile(actor, { website: 'https://northfield.test', summary: 'Client onboarding for agencies.' });
  const price = await brain.addFact(actor, 'price', 'Starter plan: $1,200 a year');

  const mailbox = await inWs((m) =>
    m.save(
      m.create(Mailbox, {
        workspaceId,
        address: 'sales@northfield.test',
        displayName: 'Dee at Northfield',
        provider: 'fixture',
        credentialsEnc: null,
        inboundMode: 'forward',
        inboundSecretHash: inboundSecretHash('secret'),
        status: 'verified',
        verifiedAt: new Date('2026-09-01T00:00:00Z'),
        failures: 0,
      }),
    ),
  );
  const registry = new RoleRegistry().register(salesManagerRole);
  const staff = await hireStaff(db, registry, actor, {
    roleKey: 'sales_manager',
    displayName: 'Dee',
    signature: 'Dee, AI sales assistant\nNorthfield Studio',
    settings: { mailboxId: mailbox.id, offerFactIds: [price.fact.id] },
  });

  const script: Script = {
    first: {
      subject: 'Onboarding at Buyer Co',
      body: 'Hello Ada,\n\nWe help agencies onboard clients.\n\nWould a short call help?\n\nBest,\nDee',
    },
    followUp: { subject: 'Following up', body: 'A short note in case my last email got buried.' },
    triage: {
      classification: 'question',
      action: 'reply',
      body: 'The Starter plan is $1,200 a year.',
      reason: 'They asked the price.',
    },
  };
  const transport = new FixtureTransport();
  const engine = new TaskEngine(db, registry, modelFor(script), { now, leaseMs: 60_000 });
  const triggers = new Triggers(db, registry, now);
  const approvals = new ApprovalService(db, registry, now);
  const dispatcher = new MailDispatcher(db, {
    keyring,
    transportFor: () => transport,
    hooksFor: (role) => (role === 'sales_manager' ? salesSendHooks : null),
    appUrl: 'https://app.test',
    now,
  });
  const inbox = new MailInbox(db, keyring);

  /** Runs everything due in this workspace until nothing is left: events, task runs, then sends. */
  const settle = async () => {
    for (let round = 0; round < 10; round += 1) {
      await triggers.dispatchEvents();
      const due = (await triggers.dueRuns()).filter((run) => run.workspaceId === workspaceId);
      for (const run of due) await engine.run(workspaceId, run.id);
      const sends = (await dispatcher.due()).filter((send) => send.workspaceId === workspaceId);
      for (const send of sends) await dispatcher.dispatch(workspaceId, send.id);
      if (!due.length && !sends.length) return;
    }
  };

  const addLead = async (email = `ada-${randomBytes(3).toString('hex')}@gmail.com`) => {
    const lead = await inWs(async (m) => {
      const lead = await m.save(
        m.create(Lead, {
          workspaceId,
          name: 'Ada Buyer',
          company: 'Buyer Co',
          email,
          website: null,
          timezone: null,
          source: 'manual',
          sourceRef: null,
          ownerUserId: userId,
          assignedStaffId: staff.id,
          state: 'new',
          notes: null,
        }),
      );
      await m.save(
        m.create(DomainEvent, {
          workspaceId,
          type: 'lead.created',
          payload: { staffId: staff.id, leadId: lead.id },
          sourceRunId: null,
          dispatchedAt: null,
        }),
      );
      return lead;
    });
    return lead;
  };

  const pending = () =>
    inWs((m) => m.find(WorkItem, { where: { workspaceId, state: 'pending' }, order: { createdAt: 'ASC' } }));
  const approveAll = async () => {
    for (const item of await pending()) await approvals.approve(actor, item.id);
  };
  const reply = (lead: Lead, text: string): InboundMail => ({
    event: 'message',
    messageId: `<r-${randomBytes(4).toString('hex')}@gmail.com>`,
    inReplyTo: transport.outbox.at(-1)?.messageId ?? null,
    from: { email: lead.email! },
    subject: 'Re: Onboarding at Buyer Co',
    text,
  });
  const setAutonomy = (taskType: string, autonomy: 'draft' | 'act') =>
    inWs((m) => m.update(StaffTaskSetting, { workspaceId, staffId: staff.id, taskType }, { autonomy }));

  return {
    time,
    workspaceId,
    actor,
    staff,
    mailbox,
    script,
    transport,
    inbox,
    approvals,
    settle,
    addLead,
    pending,
    approveAll,
    reply,
    setAutonomy,
    inWs,
  };
}

describe('Sales Manager Staff, end to end', () => {
  it('drafts a first email, sends it only after approval, and schedules a follow-up', async () => {
    const s = await setup();
    const lead = await s.addLead();
    await s.settle();

    const [draft] = await s.pending();
    expect(draft?.kind).toBe('email_draft');
    expect(draft?.payload).toMatchObject({ subject: 'Onboarding at Buyer Co', to: lead.email });
    // The model's own sign-off was removed and the opt-out line added.
    expect(String(draft?.payload.body)).not.toMatch(/Best,\nDee$/);
    expect(String(draft?.payload.body)).toContain('reply STOP');
    expect(s.transport.outbox).toHaveLength(0);

    await s.approveAll();
    await s.settle();
    expect(s.transport.outbox).toHaveLength(1);
    const sent = s.transport.outbox[0]!;
    expect(sent.to).toBe(lead.email);
    expect(sent.text).toContain('Dee, AI sales assistant');
    expect(sent.unsubscribe).toBeDefined();

    const followUps = await s.inWs((m) =>
      m.find(TaskRun, { where: { workspaceId: s.workspaceId, taskType: 'sales_manager.follow_up' } }),
    );
    expect(followUps).toHaveLength(1);
    expect(followUps[0]!.runAt.toISOString()).toBe('2026-11-06T10:00:00.000Z');
  });

  it('the follow-up is written when nobody answers, and dropped when they did', async () => {
    const quiet = await setup();
    await quiet.addLead();
    await quiet.settle();
    await quiet.approveAll();
    await quiet.settle();
    quiet.time.now = new Date('2026-11-06T10:00:00Z');
    await quiet.settle();
    expect((await quiet.pending()).map((item) => item.title)).toEqual([expect.stringMatching(/^Follow-up 1/)]);

    const answered = await setup();
    const lead = await answered.addLead();
    await answered.settle();
    await answered.approveAll();
    await answered.settle();
    await answered.inbox.receive(answered.mailbox, answered.reply(lead, 'Not right now, thanks.'));
    answered.script.triage = { classification: 'objection', action: 'escalate', reason: 'Timing.' };
    answered.time.now = new Date('2026-11-06T10:00:00Z');
    await answered.settle();
    const items = await answered.pending();
    expect(items.some((item) => item.title.startsWith('Follow-up'))).toBe(false);
    const run = await answered.inWs((m) =>
      m.findOneBy(TaskRun, { workspaceId: answered.workspaceId, taskType: 'sales_manager.follow_up' }),
    );
    expect(run?.state).toBe('cancelled');
  });

  it('a reply is triaged into a drafted answer quoting only approved facts', async () => {
    const s = await setup();
    const lead = await s.addLead();
    await s.settle();
    await s.approveAll();
    await s.settle();

    await s.inbox.receive(s.mailbox, s.reply(lead, 'How much does it cost?'));
    await s.settle();
    const [draft] = await s.pending();
    expect(draft?.kind).toBe('reply_draft');
    expect(draft?.payload).toMatchObject({ body: 'The Starter plan is $1,200 a year.', classification: 'question' });

    await s.approveAll();
    await s.settle();
    expect(s.transport.outbox).toHaveLength(2);
    // The answer threads under the lead's reply.
    expect(s.transport.outbox[1]!.inReplyTo).toMatch(/@gmail\.com>$/);
  });

  it('a true price this staff member may not quote is escalated, not sent', async () => {
    const s = await setup();
    await s.inWs((m) =>
      m.query(`UPDATE staff_members SET settings = jsonb_set(settings, '{offerFactIds}', '[]') WHERE id = $1`, [
        s.staff.id,
      ]),
    );
    const lead = await s.addLead();
    await s.settle();
    await s.approveAll();
    await s.settle();
    await s.inbox.receive(s.mailbox, s.reply(lead, 'How much does it cost?'));
    await s.settle();
    const [item] = await s.pending();
    expect(item?.kind).toBe('escalation');
    expect(item?.flaggedReason).toMatch(/1,200/);
  });

  it('a price the facts do not support is escalated, not sent', async () => {
    const s = await setup();
    const lead = await s.addLead();
    await s.settle();
    await s.approveAll();
    await s.settle();
    s.script.triage = { classification: 'question', action: 'reply', body: 'For you, 30% off.', reason: 'Discount.' };
    await s.setAutonomy('sales_manager.triage_reply', 'act');
    await s.inbox.receive(s.mailbox, s.reply(lead, 'Any discount?'));
    await s.settle();
    const [item] = await s.pending();
    expect(item?.kind).toBe('escalation');
    expect(item?.flaggedReason).toMatch(/factsOnly/);
    expect(s.transport.outbox).toHaveLength(1);
  });

  it('an opt-out reply suppresses the address and nothing more is sent', async () => {
    const s = await setup();
    const lead = await s.addLead();
    await s.settle();
    await s.approveAll();
    await s.settle();
    await s.inbox.receive(s.mailbox, s.reply(lead, 'Please unsubscribe me.'));
    s.time.now = new Date('2026-11-06T10:00:00Z');
    await s.settle();
    expect(await s.pending()).toEqual([]);
    expect(s.transport.outbox).toHaveLength(1);
    const suppressed = await s.inWs((m) => m.findBy(Suppression, { workspaceId: s.workspaceId }));
    expect(suppressed.map((row) => row.reason)).toEqual(['opt_out']);
  });

  it('nothing sends outside the sending hours', async () => {
    const s = await setup('2026-11-03T20:00:00Z');
    await s.addLead();
    await s.settle();
    await s.approveAll();
    await s.settle();
    expect(s.transport.outbox).toHaveLength(0);
    const [intent] = await s.inWs((m) => m.findBy(SendIntent, { workspaceId: s.workspaceId }));
    expect(intent?.state).toBe('pending');
    expect(intent?.notBefore.toISOString()).toBe('2026-11-04T09:00:00.000Z');
    s.time.now = new Date('2026-11-04T09:00:00Z');
    await s.settle();
    expect(s.transport.outbox).toHaveLength(1);
  });

  it('nothing sends over the daily new-contact limit', async () => {
    const s = await setup();
    await s.inWs((m) =>
      m.query(`UPDATE staff_members SET settings = jsonb_set(settings, '{dailyNewContacts}', '2') WHERE id = $1`, [
        s.staff.id,
      ]),
    );
    for (let i = 0; i < 3; i += 1) await s.addLead();
    await s.settle();
    await s.approveAll();
    await s.settle();
    expect(s.transport.outbox).toHaveLength(2);
    const held = await s.inWs((m) => m.findBy(SendIntent, { workspaceId: s.workspaceId, state: 'pending' }));
    expect(held).toHaveLength(1);
    expect(held[0]!.error).toMatch(/limit of 2 new contacts/);
  });

  it('a promoted first touch sends without a draft', async () => {
    const s = await setup();
    await s.setAutonomy('sales_manager.first_touch', 'act');
    await s.addLead();
    await s.settle();
    expect(await s.pending()).toEqual([]);
    expect(s.transport.outbox).toHaveLength(1);
  });

  it('a spam complaint takes sending back to drafts', async () => {
    const s = await setup();
    await s.setAutonomy('sales_manager.first_touch', 'act');
    const lead = await s.addLead();
    await s.settle();
    await s.inbox.receive(s.mailbox, {
      event: 'complaint',
      messageId: '<fbl-1@gmail.com>',
      from: { email: 'fbl@gmail.com' },
      recipient: lead.email!,
    });
    await s.settle();
    const setting = await s.inWs((m) =>
      m.findOneByOrFail(StaffTaskSetting, { staffId: s.staff.id, taskType: 'sales_manager.first_touch' }),
    );
    expect(setting.autonomy).toBe('draft');
    const types = (await s.inWs((m) => m.find(ActivityEvent, { where: { workspaceId: s.workspaceId } }))).map(
      (event) => event.type,
    );
    expect(types).toContain('autonomy.demoted');
    const conversation = await s.inWs((m) => m.findOneByOrFail(Conversation, { workspaceId: s.workspaceId }));
    expect(conversation.state).toBe('closed');
  });
});
