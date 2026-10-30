import {
  asSystem,
  createDataSource,
  type DataSource,
  Invitation,
  Membership,
  Workspace,
  withTenant,
} from '@ai-staff/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signedInUser, startApp, type TestApp } from './helpers/app.js';

let t: TestApp;
let appDb: DataSource;

beforeAll(async () => {
  t = await startApp();
  appDb = await createDataSource({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME!,
    username: process.env.DB_APP_USER!,
    password: process.env.DB_APP_PASSWORD!,
    poolSize: 2,
  }).initialize();
});

afterAll(async () => {
  await appDb.destroy();
  await t.close();
});

async function workspaceFor(label: string) {
  const owner = await signedInUser(t, label);
  const workspace = (
    await t
      .http()
      .post('/v1/workspaces')
      .set(owner.auth)
      .send({ name: `${label} Co` })
      .expect(201)
  ).body as { id: string };
  await t
    .http()
    .post('/v1/workspace/invitations')
    .set({ ...owner.auth, 'X-Workspace-Id': workspace.id })
    .send({ email: `${label}-invitee@example.test`, role: 'member' })
    .expect(201);
  const userId = (await t.http().get('/v1/me').set(owner.auth).expect(200)).body.id as string;
  return { owner, workspace, userId };
}

describe('tenant isolation through the API', () => {
  it('answers 404 for every workspace route when the caller is not a member', async () => {
    const a = await workspaceFor('tenanta');
    const b = await workspaceFor('tenantb');
    const intruder = { ...b.owner.auth, 'X-Workspace-Id': a.workspace.id };
    await t.http().get('/v1/workspace').set(intruder).expect(404);
    await t.http().patch('/v1/workspace').set(intruder).send({ name: 'Hijacked' }).expect(404);
    await t.http().get('/v1/workspace/members').set(intruder).expect(404);
    await t.http().get('/v1/workspace/invitations').set(intruder).expect(404);
    await t
      .http()
      .post('/v1/workspace/invitations')
      .set(intruder)
      .send({ email: 'x@example.test', role: 'admin' })
      .expect(404);
    await t.http().delete(`/v1/workspace/members/${a.userId}`).set(intruder).expect(404);
  });

  it('treats a malformed or missing workspace header as not found', async () => {
    const user = await signedInUser(t, 'noheader');
    await t.http().get('/v1/workspace').set(user.auth).expect(404);
    await t
      .http()
      .get('/v1/workspace')
      .set({ ...user.auth, 'X-Workspace-Id': 'not-a-uuid' })
      .expect(404);
  });
});

describe('row-level security in Postgres', () => {
  it('hides other workspaces even from a query with no workspace filter', async () => {
    const a = await workspaceFor('rlsa');
    const b = await workspaceFor('rlsb');
    const seen = await withTenant(appDb, { workspaceId: a.workspace.id, userId: a.userId }, async (m) => ({
      workspaces: (await m.find(Workspace)).map((workspace) => workspace.id),
      memberships: (await m.find(Membership)).map((membership) => membership.workspaceId),
      invitations: (await m.find(Invitation)).map((invitation) => invitation.workspaceId),
    }));
    expect(seen.workspaces).toEqual([a.workspace.id]);
    expect(new Set(seen.memberships)).toEqual(new Set([a.workspace.id]));
    expect(new Set(seen.invitations)).toEqual(new Set([a.workspace.id]));
    expect(seen.workspaces).not.toContain(b.workspace.id);
  });

  it('shows nothing tenant-owned without a tenant context', async () => {
    await workspaceFor('rlsnone');
    const counts = await appDb.transaction(async (m) => [
      await m.count(Workspace),
      await m.count(Membership),
      await m.count(Invitation),
    ]);
    expect(counts).toEqual([0, 0, 0]);
  });

  it('refuses to write a row into another workspace', async () => {
    const a = await workspaceFor('rlswritea');
    const b = await workspaceFor('rlswriteb');
    await expect(
      withTenant(appDb, { workspaceId: a.workspace.id, userId: a.userId }, (m) =>
        m.save(m.create(Membership, { workspaceId: b.workspace.id, userId: a.userId, role: 'owner' })),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('lets a user see the workspaces they belong to, and only those', async () => {
    const a = await workspaceFor('rlsmine');
    await workspaceFor('rlsother');
    const ids = await withTenant(appDb, { workspaceId: null, userId: a.userId }, async (m) =>
      (await m.find(Workspace)).map((workspace) => workspace.id),
    );
    expect(ids).toEqual([a.workspace.id]);
  });

  it('requires a reason for system operations', async () => {
    await expect(asSystem(appDb, ' ', async () => 1)).rejects.toThrow(/reason/);
  });

  it('rejects non-UUID context values', async () => {
    await expect(withTenant(appDb, { workspaceId: "x' OR 1=1 --", userId: null }, async () => 1)).rejects.toThrow(
      /UUIDs/,
    );
  });
});
