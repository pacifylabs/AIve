import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, signedInUser, startApp, type TestApp } from './helpers/app.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

async function team(label: string) {
  const owner = await signedInUser(t, label, 'Owner');
  const created = await t
    .http()
    .post('/v1/workspaces')
    .set(owner.auth)
    .send({ name: `${label} Co` })
    .expect(201);
  const workspaceId = created.body.id as string;
  const ws = { ...owner.auth, 'X-Workspace-Id': workspaceId };
  const member = await signedInUser(t, `${label}m`, 'Member');
  await t.http().post('/v1/workspace/invitations').set(ws).send({ email: member.email, role: 'member' }).expect(201);
  await t
    .http()
    .post('/v1/invitations/accept')
    .set(member.auth)
    .send({ token: t.mail.tokenFor(member.email) })
    .expect(200);
  return { owner, member, workspaceId, ws, memberWs: { ...member.auth, 'X-Workspace-Id': workspaceId } };
}

type Item = {
  action: string;
  target: string;
  ip: string | null;
  detail: Record<string, unknown>;
  user: { id: string; email: string } | null;
};
const log = async (as: Record<string, string>, query: Record<string, string> = {}) =>
  (await t.http().get('/v1/audit').set(as).query(query).expect(200)).body as { items: Item[]; next: string | null };

/** The entry is written after the response is sent, so wait for it instead of assuming it is there. */
async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

describe('the audit log', () => {
  it('records a change with who, what, which item, the answer and the IP, and never the request body', async () => {
    const w = await team('aud1');
    const created = await t
      .http()
      .post('/v1/social/tags')
      .set(w.memberWs)
      .send({ name: 'Secret-looking name', colour: 'blue' })
      .expect(201);
    const { items } = await eventually(
      () => log(w.ws),
      (r) => r.items.some((i) => i.action === 'POST /v1/social/tags'),
    );
    const entry = items.find((i) => i.action === 'POST /v1/social/tags')!;
    expect(entry.user).toMatchObject({ id: expect.any(String), email: w.member.email });
    expect(entry.detail).toEqual({ status: 201 });
    expect(entry.ip).toBeTruthy();
    expect(JSON.stringify(items)).not.toContain('Secret-looking name');

    await t
      .http()
      .patch(`/v1/social/tags/${created.body.id}`)
      .set(w.memberWs)
      .send({ name: 'Renamed', colour: 'red' })
      .expect(200);
    const after = await eventually(
      () => log(w.ws),
      (r) => r.items.some((i) => i.action === 'PATCH /v1/social/tags/:id'),
    );
    expect(after.items.find((i) => i.action === 'PATCH /v1/social/tags/:id')!.target).toBe(created.body.id);
  });

  it('records a refused change with the status it got, and leaves out reads', async () => {
    const w = await team('aud2');
    await t.http().post('/v1/social/tags').set(w.memberWs).send({ name: 'x', colour: 'chartreuse' }).expect(400);
    await t.http().get('/v1/social/tags').set(w.memberWs).expect(200);
    const { items } = await eventually(
      () => log(w.ws),
      (r) => r.items.some((i) => i.action === 'POST /v1/social/tags'),
    );
    expect(items.find((i) => i.action === 'POST /v1/social/tags')!.detail).toEqual({ status: 400 });
    expect(items.some((i) => i.action.startsWith('GET'))).toBe(false);
  });

  it('is readable by owners and admins only, and filters by person and text', async () => {
    const w = await team('aud3');
    await t.http().get('/v1/audit').set(w.memberWs).expect(403);
    await t.http().post('/v1/social/tags').set(w.memberWs).send({ name: 'A', colour: 'blue' }).expect(201);
    await t.http().post('/v1/social/templates').set(w.ws).send({ name: 'T', body: 'Hello' }).expect(201);
    await eventually(
      () => log(w.ws),
      (r) => r.items.filter((i) => i.action.startsWith('POST /v1/social/')).length >= 2,
    );
    const byMember = await log(w.ws, {
      user: (await log(w.ws)).items.find((i) => i.user?.email === w.member.email)!.user!.id,
    });
    expect(byMember.items.every((i) => i.user?.email === w.member.email)).toBe(true);
    const byText = await log(w.ws, { q: 'templates' });
    expect(byText.items.map((i) => i.action)).toEqual(['POST /v1/social/templates']);
    await t.http().get('/v1/audit').set(w.ws).query({ user: 'not-a-uuid' }).expect(400);
  });

  it('pages back through older entries', async () => {
    const w = await team('aud4');
    for (const name of ['a', 'b', 'c'])
      await t.http().post('/v1/social/tags').set(w.ws).send({ name, colour: 'teal' }).expect(201);
    await eventually(
      () => log(w.ws),
      (r) => r.items.filter((i) => i.action === 'POST /v1/social/tags').length >= 3,
    );
    const first = await log(w.ws, { limit: '2' });
    expect(first.items).toHaveLength(2);
    expect(first.next).toBeTruthy();
    const second = await log(w.ws, { limit: '2', before: first.next! });
    expect(second.items.every((i) => !first.items.some((seen) => seen === i))).toBe(true);
    expect(second.items.length).toBeGreaterThan(0);
  });

  it('keeps one workspace’s entries out of another’s', async () => {
    const a = await team('aud5a');
    const b = await team('aud5b');
    await t.http().post('/v1/social/tags').set(a.ws).send({ name: 'Mine', colour: 'blue' }).expect(201);
    await eventually(
      () => log(a.ws),
      (r) => r.items.some((i) => i.action === 'POST /v1/social/tags'),
    );
    expect((await log(b.ws)).items.some((i) => i.action === 'POST /v1/social/tags')).toBe(false);
  });

  it('records a failed sign-in for every workspace of that address, with the email and never the password', async () => {
    const w = await team('aud6');
    await t.http().post('/v1/auth/login').send({ email: w.owner.email, password: 'not the password' }).expect(401);
    const { items } = await eventually(
      () => log(w.ws),
      (r) => r.items.some((i) => i.action === 'POST /v1/auth/login'),
    );
    const entry = items.find((i) => i.action === 'POST /v1/auth/login')!;
    expect(entry.detail).toEqual({ status: 401, email: w.owner.email.toLowerCase() });
    expect(entry.user?.email).toBe(w.owner.email);
    expect(JSON.stringify(items)).not.toContain('not the password');
    // A good sign-in is recorded too.
    await t.http().post('/v1/auth/login').send({ email: w.owner.email, password: PASSWORD }).expect(200);
    const again = await eventually(
      () => log(w.ws),
      (r) => r.items.filter((i) => i.action === 'POST /v1/auth/login').length >= 2,
    );
    expect(
      again.items
        .filter((i) => i.action === 'POST /v1/auth/login')
        .map((i) => i.detail.status)
        .sort(),
    ).toEqual([200, 401]);
  });

  it('does not write a sign-in by an unknown address into any workspace', async () => {
    const w = await team('aud7');
    await t.http().post('/v1/auth/login').send({ email: 'nobody@example.test', password: 'x' }).expect(401);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await log(w.ws)).items.some((i) => i.detail.email === 'nobody@example.test')).toBe(false);
  });
});
