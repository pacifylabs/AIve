import { createDataSource, type DataSource, DomainEvent, Mailbox, withTenant } from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
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

/** A workspace with a fixture mailbox and a hired Sales Manager, ready for leads. */
async function hired(label: string) {
  const w = await workspace(label);
  const mailbox = (
    await t
      .http()
      .post('/v1/mailboxes')
      .set(w.as)
      .send({ address: `sales@${label}.test`, displayName: 'Dee', provider: 'fixture' })
      .expect(201)
  ).body as { id: string; forwardingUrl: string };
  const staff = (
    await t
      .http()
      .post('/v1/staff')
      .set(w.as)
      .send({ roleKey: 'sales_manager', displayName: 'Dee', settings: { mailboxId: mailbox.id } })
      .expect(201)
  ).body as { id: string };
  return { ...w, mailbox, staff };
}

describe('mailboxes', () => {
  it('connects a mailbox without ever returning its login or secret hash, and shows the forwarding URL once', async () => {
    const w = await workspace('mb1');
    const created = await t
      .http()
      .post('/v1/mailboxes')
      .set(w.as)
      .send({ address: 'Sales@MB1.test', displayName: 'Dee', provider: 'fixture' })
      .expect(201);
    expect(created.body).toMatchObject({ address: 'sales@mb1.test', status: 'pending' });
    expect(created.body.forwardingUrl).toMatch(/\/v1\/inbound\/mail\/[0-9a-f-]{36}\/[\w-]{20,}$/);
    expect(JSON.stringify(created.body)).not.toMatch(/credentials|inboundSecretHash/i);

    const list = await t.http().get('/v1/mailboxes').set(w.as).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].forwardingUrl).toBeUndefined();
    await t
      .http()
      .post('/v1/mailboxes')
      .set(w.as)
      .send({ address: 'sales@mb1.test', displayName: 'Dee', provider: 'fixture' })
      .expect(409);
  });

  it('needs a login for a real SMTP mailbox', async () => {
    const w = await workspace('mb2');
    const res = await t
      .http()
      .post('/v1/mailboxes')
      .set(w.as)
      .send({ address: 'a@mb2.test', displayName: 'Dee' })
      .expect(400);
    expect(res.body.errors).toEqual([expect.objectContaining({ path: 'smtp' })]);
  });

  it("another workspace cannot see or test someone else's mailbox", async () => {
    const a = await hired('mba');
    const b = await workspace('mbb');
    expect((await t.http().get('/v1/mailboxes').set(b.as).expect(200)).body).toEqual([]);
    await t.http().post(`/v1/mailboxes/${a.mailbox.id}/test`).set(b.as).send({ to: 'x@y.test' }).expect(404);
  });
});

describe('hiring', () => {
  it('hires a Sales Manager with validated settings and refuses a mailbox from another workspace', async () => {
    const a = await hired('hirea');
    const b = await workspace('hireb');
    await t
      .http()
      .post('/v1/staff')
      .set(b.as)
      .send({ roleKey: 'sales_manager', displayName: 'Dee', settings: { mailboxId: a.mailbox.id } })
      .expect(400);
    const bad = await t
      .http()
      .post('/v1/staff')
      .set(b.as)
      .send({ roleKey: 'sales_manager', displayName: 'Dee', settings: { dailyNewContacts: 5000 } })
      .expect(400);
    expect(bad.body.errors[0].path).toMatch(/^settings\./);
    await t.http().post('/v1/staff').set(b.as).send({ roleKey: 'nope', displayName: 'X' }).expect(404);

    const roles = await t.http().get('/v1/roles').set(b.as).expect(200);
    expect(roles.body[0]).toMatchObject({ key: 'sales_manager' });
    expect(roles.body[0].interview).toHaveLength(5);
  });
});

describe('leads', () => {
  it('needs a Sales Manager first', async () => {
    const w = await workspace('lead0');
    await t.http().post('/v1/leads').set(w.as).send({ email: 'ada@buyer.test' }).expect(409);
  });

  it('adds a lead, hands it to the Sales Manager as an event, and refuses a duplicate', async () => {
    const w = await hired('lead1');
    const lead = (await t.http().post('/v1/leads').set(w.as).send({ name: 'Ada', email: 'Ada@Buyer.test' }).expect(201))
      .body as { id: string; email: string };
    expect(lead.email).toBe('ada@buyer.test');
    const events = await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.find(DomainEvent, { where: { workspaceId: w.workspaceId, type: 'lead.created' } }),
    );
    expect(events[0]?.payload).toMatchObject({ staffId: w.staff.id, leadId: lead.id });
    await t.http().post('/v1/leads').set(w.as).send({ email: 'ada@buyer.test' }).expect(409);
  });

  it('previews a CSV without saving, then imports only the good rows', async () => {
    const w = await hired('csv1');
    await t.http().post('/v1/suppressions').set(w.as).send({ value: 'stop@buyer.test' }).expect(201);
    const csv = [
      'Email,Name,Company,Website',
      'one@buyer.test,One,Buyer,buyer.test',
      'not-an-email,Two,,',
      'one@buyer.test,Again,,',
      'stop@buyer.test,Three,,',
      'four@gmail.com,Four,,',
    ].join('\n');
    const preview = await t.http().post('/v1/leads/import').set(w.as).send({ csv }).expect(200);
    expect(preview.body).toMatchObject({ committed: false, imported: 0, ready: 2, skipped: 3, withoutResearch: 1 });
    expect(preview.body.rows.map((row: { status: string }) => row.status)).toEqual([
      'ok',
      'invalid',
      'repeated',
      'suppressed',
      'ok',
    ]);
    expect((await t.http().get('/v1/leads').set(w.as).expect(200)).body).toHaveLength(0);

    const done = await t.http().post('/v1/leads/import').set(w.as).send({ csv, commit: true }).expect(200);
    expect(done.body).toMatchObject({ committed: true, imported: 2 });
    expect((await t.http().get('/v1/leads').set(w.as).expect(200)).body).toHaveLength(2);
    // Importing the same file again adds nothing.
    expect(
      (await t.http().post('/v1/leads/import').set(w.as).send({ csv, commit: true }).expect(200)).body.imported,
    ).toBe(0);
  });

  it('rejects a file with no email column', async () => {
    const w = await hired('csv2');
    await t.http().post('/v1/leads/import').set(w.as).send({ csv: 'name\nAda' }).expect(400);
  });
});

describe('inbound mail and unsubscribe', () => {
  it('refuses a wrong secret and an unknown mailbox with the same answer', async () => {
    const w = await hired('in1');
    const mail = { messageId: '<x@buyer.test>', from: { email: 'ada@buyer.test' }, text: 'hi' };
    const wrong = await t.http().post(`/v1/inbound/mail/${w.mailbox.id}/wrong-secret`).send(mail).expect(404);
    const unknown = await t
      .http()
      .post('/v1/inbound/mail/00000000-0000-7000-8000-000000000000/wrong-secret')
      .send(mail)
      .expect(404);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('accepts mail on the real forwarding URL', async () => {
    const w = await hired('in2');
    const path = new URL(w.mailbox.forwardingUrl).pathname;
    const res = await t
      .http()
      .post(path)
      .send({ messageId: '<x@buyer.test>', from: { email: 'ada@buyer.test' }, text: 'hi' })
      .expect(202);
    expect(res.body.outcome).toBe('unmatched');
    const box = await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.findOneByOrFail(Mailbox, { id: w.mailbox.id }),
    );
    expect(box.lastInboundAt).not.toBeNull();
  });

  it('rejects a forged unsubscribe token', async () => {
    await t.http().post('/v1/unsubscribe/not.a.token').expect(404);
  });
});

describe('suppressions', () => {
  it('adds and lifts a manual entry, but never an opt-out', async () => {
    const w = await workspace('sup1');
    const added = (await t.http().post('/v1/suppressions').set(w.as).send({ value: '@Competitor.test' }).expect(201))
      .body as { id: string; value: string };
    expect(added.value).toBe('@competitor.test');
    await t.http().post('/v1/suppressions').set(w.as).send({ value: 'nonsense' }).expect(400);
    await t.http().delete(`/v1/suppressions/${added.id}`).set(w.as).expect(204);

    await withTenant(db, { workspaceId: w.workspaceId, userId: null }, (m) =>
      m.query(
        `INSERT INTO suppressions (id, workspace_id, value, reason) VALUES ($1, $2, 'out@buyer.test', 'opt_out')`,
        [uuidv7(), w.workspaceId],
      ),
    );
    const list = (await t.http().get('/v1/suppressions').set(w.as).expect(200)).body as { id: string }[];
    await t.http().delete(`/v1/suppressions/${list[0]!.id}`).set(w.as).expect(409);
  });
});
