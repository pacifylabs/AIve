import { createDataSource, type DataSource, DomainEvent, StaffMember, WorkItem, withTenant } from '@ai-staff/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signedInUser, startApp, type TestApp } from './helpers/app.js';

let t: TestApp;
let db: DataSource;

beforeAll(async () => {
  t = await startApp();
  db = await createDataSource({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME!,
    username: process.env.DB_APP_USER!,
    password: process.env.DB_APP_PASSWORD!,
    poolSize: 2,
  }).initialize();
});

afterAll(async () => {
  await db.destroy();
  await t.close();
});

async function workspace(label: string) {
  const owner = await signedInUser(t, label);
  const ws = (
    await t
      .http()
      .post('/v1/workspaces')
      .set(owner.auth)
      .send({ name: `${label} Co` })
      .expect(201)
  ).body as { id: string };
  return { owner, workspaceId: ws.id, as: { ...owner.auth, 'X-Workspace-Id': ws.id } };
}

/** A staff member and one pending draft whose approval emits an event, as the task engine would leave them. */
async function pendingDraft(workspaceId: string, factIds: string[] = []) {
  return withTenant(db, { workspaceId, userId: null }, async (m) => {
    const staff = await m.save(
      m.create(StaffMember, { workspaceId, roleKey: 'dummy', roleVersion: 1, displayName: 'Dee', settings: {} }),
    );
    const item = await m.save(
      m.create(WorkItem, {
        workspaceId,
        staffId: staff.id,
        taskRunId: null,
        taskType: 'dummy.draft_note',
        kind: 'note_draft',
        title: 'Our Starter plan',
        payload: { title: 'Our Starter plan', body: 'The Starter plan is $1,200 a year.' },
        original: { title: 'Our Starter plan', body: 'The Starter plan is $1,200 a year.' },
        onApprove: [{ type: 'emitEvent', event: 'dummy.note_approved', payload: '$approved' }],
        factIds,
        state: 'pending',
      }),
    );
    return { staff, item };
  });
}

describe('approval inbox', () => {
  it('lists pending drafts and approves one with edits, running its follow-up effect once', async () => {
    const { workspaceId, as } = await workspace('inbox');
    const { item } = await pendingDraft(workspaceId);

    const list = await t.http().get('/v1/inbox').set(as).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: item.id, staffName: 'Dee', state: 'pending' })]);

    const approved = await t
      .http()
      .post(`/v1/inbox/${item.id}/approve`)
      .set(as)
      .send({ payload: { title: 'Our Starter plan, explained', body: 'The Starter plan is $1,200 a year.' } })
      .expect(201);
    expect(approved.body).toMatchObject({ state: 'edited' });

    const emitted = await withTenant(db, { workspaceId, userId: null }, (m) =>
      m.find(DomainEvent, { where: { workspaceId, type: 'dummy.note_approved' } }),
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload).toMatchObject({ title: 'Our Starter plan, explained' });

    // Deciding twice is refused, and nothing runs again.
    await t.http().post(`/v1/inbox/${item.id}/reject`).set(as).send({ reason: 'Too late' }).expect(409);
    expect((await t.http().get('/v1/inbox?view=decided').set(as).expect(200)).body[0]).toMatchObject({
      state: 'edited',
    });
  });

  it('requires a reason to reject', async () => {
    const { workspaceId, as } = await workspace('reject');
    const { item } = await pendingDraft(workspaceId);
    const response = await t.http().post(`/v1/inbox/${item.id}/reject`).set(as).send({ reason: ' ' }).expect(400);
    expect(response.body.errors[0].path).toBe('reason');
    await t.http().post(`/v1/inbox/${item.id}/reject`).set(as).send({ reason: 'Wrong tone' }).expect(201);
  });

  it("never lets another workspace see or decide this workspace's drafts", async () => {
    const a = await workspace('ownera');
    const b = await workspace('ownerb');
    const { item } = await pendingDraft(a.workspaceId);
    expect((await t.http().get('/v1/inbox').set(b.as).expect(200)).body).toEqual([]);
    await t.http().post(`/v1/inbox/${item.id}/approve`).set(b.as).send({}).expect(409);
    // Using workspace A's id without being a member is a 404, like every workspace route.
    await t
      .http()
      .get('/v1/inbox')
      .set({ ...b.owner.auth, 'X-Workspace-Id': a.workspaceId })
      .expect(404);
  });
});

describe('company brain', () => {
  it('adds, edits, confirms and removes facts, and withdraws drafts that relied on a changed fact', async () => {
    const { workspaceId, as } = await workspace('brain');
    const fact = (
      await t.http().post('/v1/company/facts').set(as).send({ kind: 'price', text: 'Starter: $1,200' }).expect(201)
    ).body as { id: string; confirmedAt: string | null };
    expect(fact.confirmedAt).not.toBeNull();

    const { item } = await pendingDraft(workspaceId, [fact.id]);
    const edited = (
      await t.http().patch(`/v1/company/facts/${fact.id}`).set(as).send({ text: 'Starter: $1,500' }).expect(200)
    ).body as { id: string };
    expect(edited.id).not.toBe(fact.id);
    expect(
      (await t.http().get('/v1/inbox').set(as).expect(200)).body.some((row: { id: string }) => row.id === item.id),
    ).toBe(false);

    const company = (await t.http().get('/v1/company').set(as).expect(200)).body as {
      profile: { version: number };
      facts: { id: string; text: string }[];
    };
    expect(company.facts.map((row) => row.text)).toEqual(['Starter: $1,500']);
    expect(company.profile.version).toBeGreaterThan(1);

    await t.http().delete(`/v1/company/facts/${edited.id}`).set(as).expect(204);
    await t.http().delete(`/v1/company/facts/${edited.id}`).set(as).expect(404);
  });

  it('validates the profile and refuses an empty change', async () => {
    const { as } = await workspace('profile');
    await t.http().patch('/v1/company').set(as).send({}).expect(400);
    const bad = await t.http().patch('/v1/company').set(as).send({ website: 'not a site' }).expect(400);
    expect(bad.body.errors[0].path).toBe('website');
    const ok = await t.http().patch('/v1/company').set(as).send({ website: 'northfield.studio' }).expect(200);
    expect(ok.body.website).toBe('https://northfield.studio');
  });

  it('queues a website read only once a website is set', async () => {
    const { as } = await workspace('prefill');
    await t.http().post('/v1/company/prefill').set(as).expect(409);
    await t.http().patch('/v1/company').set(as).send({ website: 'northfield.studio' }).expect(200);
    expect((await t.http().post('/v1/company/prefill').set(as).expect(202)).body).toEqual({ prefillState: 'queued' });
    // Asking again while it is queued does not queue a second read.
    expect((await t.http().post('/v1/company/prefill').set(as).expect(202)).body).toEqual({ prefillState: 'queued' });
  });
});

describe('roles and permissions', () => {
  it('lets members read and decide, but only admins change facts and staff, and only the owner the spend cap', async () => {
    const { owner, workspaceId, as } = await workspace('perms');
    const member = await signedInUser(t, 'perms-member');
    await t.http().post('/v1/workspace/invitations').set(as).send({ email: member.email, role: 'member' }).expect(201);
    const token = t.mail.tokenFor(member.email);
    await t.http().post('/v1/invitations/accept').set(member.auth).send({ token }).expect(200);
    const asMember = { ...member.auth, 'X-Workspace-Id': workspaceId };

    await t.http().get('/v1/company').set(asMember).expect(200);
    await t.http().post('/v1/company/facts').set(asMember).send({ kind: 'claim', text: 'x' }).expect(403);
    await t.http().put('/v1/spend-cap').set(asMember).send({ monthlyCapUsd: 50 }).expect(403);

    const { staff } = await pendingDraft(workspaceId);
    await t.http().patch(`/v1/staff/${staff.id}`).set(asMember).send({ state: 'paused' }).expect(403);
    const paused = await t.http().patch(`/v1/staff/${staff.id}`).set(as).send({ state: 'paused' }).expect(200);
    expect(paused.body).toMatchObject({ state: 'paused', pausedReason: 'Paused by you.' });

    const cap = await t.http().put('/v1/spend-cap').set(as).send({ monthlyCapUsd: 50 }).expect(200);
    expect(cap.body).toMatchObject({ monthlyCapUsd: 50, alertAtPct: 80 });
    expect((await t.http().get('/v1/activity').set(asMember).expect(200)).body).toBeInstanceOf(Array);
    void owner;
  });
});
