import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signedInUser, startApp, type TestApp } from './helpers/app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startApp();
});

afterAll(async () => {
  await t.close();
});

async function ownerWithWorkspace(label: string) {
  const owner = await signedInUser(t, label, 'Owner');
  const created = await t
    .http()
    .post('/v1/workspaces')
    .set(owner.auth)
    .send({ name: 'Acme Ltd', timezone: 'Europe/London', country: 'gb' })
    .expect(201);
  return {
    owner,
    workspace: created.body as { id: string; slug: string },
    ws: { ...owner.auth, 'X-Workspace-Id': created.body.id },
  };
}

async function joinAs(
  workspaceId: string,
  inviterHeaders: Record<string, string>,
  role: 'admin' | 'member',
  label: string,
) {
  const user = await signedInUser(t, label, label);
  await t.http().post('/v1/workspace/invitations').set(inviterHeaders).send({ email: user.email, role }).expect(201);
  await t
    .http()
    .post('/v1/invitations/accept')
    .set(user.auth)
    .send({ token: t.mail.tokenFor(user.email) })
    .expect(200);
  return { ...user, ws: { ...user.auth, 'X-Workspace-Id': workspaceId } };
}

describe('workspaces', () => {
  it('creates a workspace with the creator as owner', async () => {
    const { owner, workspace, ws } = await ownerWithWorkspace('create');
    expect(workspace).toMatchObject({ name: 'Acme Ltd', timezone: 'Europe/London', country: 'GB', role: 'owner' });
    expect(workspace.slug).toMatch(/^acme-ltd-[0-9a-f]{6}$/);
    const me = await t.http().get('/v1/me').set(owner.auth).expect(200);
    expect(me.body.workspaces).toEqual([{ id: workspace.id, name: 'Acme Ltd', slug: workspace.slug, role: 'owner' }]);
    await t.http().get('/v1/workspace').set(ws).expect(200);
  });

  it('rejects an unknown time zone', async () => {
    const owner = await signedInUser(t, 'tz');
    const response = await t
      .http()
      .post('/v1/workspaces')
      .set(owner.auth)
      .send({ name: 'X', timezone: 'Mars/Olympus' })
      .expect(400);
    expect(response.body.errors[0].path).toBe('timezone');
  });

  it('lets admins update settings but not members', async () => {
    const { workspace, ws } = await ownerWithWorkspace('update');
    const member = await joinAs(workspace.id, ws, 'member', 'plainmember');
    await t.http().patch('/v1/workspace').set(member.ws).send({ name: 'Nope' }).expect(403);
    const updated = await t.http().patch('/v1/workspace').set(ws).send({ name: 'Acme Group' }).expect(200);
    expect(updated.body.name).toBe('Acme Group');
  });
});

describe('invitations', () => {
  it('invites by email, and the invitee joins with the invited role', async () => {
    const { workspace, ws } = await ownerWithWorkspace('invite');
    const admin = await joinAs(workspace.id, ws, 'admin', 'newadmin');
    const members = await t.http().get('/v1/workspace/members').set(ws).expect(200);
    expect(members.body.map((member: { email: string; role: string }) => [member.email, member.role])).toContainEqual([
      admin.email,
      'admin',
    ]);
    const me = await t.http().get('/v1/me').set(admin.auth).expect(200);
    expect(me.body.workspaces[0]).toMatchObject({ id: workspace.id, role: 'admin' });
  });

  it('refuses an invitation used by a different account', async () => {
    const { ws } = await ownerWithWorkspace('mismatch');
    const invitee = await signedInUser(t, 'invitee');
    const stranger = await signedInUser(t, 'stranger');
    await t.http().post('/v1/workspace/invitations').set(ws).send({ email: invitee.email, role: 'member' }).expect(201);
    const response = await t
      .http()
      .post('/v1/invitations/accept')
      .set(stranger.auth)
      .send({ token: t.mail.tokenFor(invitee.email) })
      .expect(403);
    expect(response.body.code).toBe('invitation_email_mismatch');
  });

  it('works only once, and not after being revoked or replaced', async () => {
    const { ws } = await ownerWithWorkspace('once');
    const invitee = await signedInUser(t, 'onceinvitee');
    await t.http().post('/v1/workspace/invitations').set(ws).send({ email: invitee.email, role: 'member' }).expect(201);
    const firstToken = t.mail.tokenFor(invitee.email);
    const second = await t
      .http()
      .post('/v1/workspace/invitations')
      .set(ws)
      .send({ email: invitee.email, role: 'admin' })
      .expect(201);
    const secondToken = t.mail.tokenFor(invitee.email);
    expect(
      (await t.http().post('/v1/invitations/accept').set(invitee.auth).send({ token: firstToken }).expect(400)).body
        .code,
    ).toBe('invitation_invalid');

    await t.http().delete(`/v1/workspace/invitations/${second.body.id}`).set(ws).expect(204);
    await t.http().post('/v1/invitations/accept').set(invitee.auth).send({ token: secondToken }).expect(400);
    expect((await t.http().get('/v1/workspace/invitations').set(ws).expect(200)).body).toEqual([]);
  });

  it('does not invite someone who is already a member', async () => {
    const { workspace, ws } = await ownerWithWorkspace('dupe');
    const member = await joinAs(workspace.id, ws, 'member', 'dupemember');
    expect(
      (
        await t
          .http()
          .post('/v1/workspace/invitations')
          .set(ws)
          .send({ email: member.email, role: 'admin' })
          .expect(409)
      ).body.code,
    ).toBe('conflict');
  });

  it('only lets admins and owners invite', async () => {
    const { workspace, ws } = await ownerWithWorkspace('whoinvites');
    const member = await joinAs(workspace.id, ws, 'member', 'cannotinvite');
    await t
      .http()
      .post('/v1/workspace/invitations')
      .set(member.ws)
      .send({ email: 'someone@example.test', role: 'member' })
      .expect(403);
  });
});

describe('roles and ownership', () => {
  it('lets owners change roles and keeps at least one owner', async () => {
    const { owner, workspace, ws } = await ownerWithWorkspace('roles');
    const me = await t.http().get('/v1/me').set(owner.auth).expect(200);
    const ownerId = me.body.id as string;
    const member = await joinAs(workspace.id, ws, 'member', 'promoted');
    const memberId = (await t.http().get('/v1/me').set(member.auth).expect(200)).body.id as string;

    expect(
      (await t.http().patch(`/v1/workspace/members/${ownerId}`).set(ws).send({ role: 'admin' }).expect(409)).body.code,
    ).toBe('last_owner');
    expect((await t.http().delete(`/v1/workspace/members/${ownerId}`).set(ws).expect(409)).body.code).toBe(
      'last_owner',
    );

    await t.http().patch(`/v1/workspace/members/${memberId}`).set(ws).send({ role: 'owner' }).expect(204);
    await t.http().patch(`/v1/workspace/members/${ownerId}`).set(member.ws).send({ role: 'admin' }).expect(204);
    // The original owner is an admin now and can no longer change roles.
    await t.http().patch(`/v1/workspace/members/${memberId}`).set(ws).send({ role: 'member' }).expect(403);
  });

  it('removes a member, who then loses access', async () => {
    const { workspace, ws } = await ownerWithWorkspace('remove');
    const member = await joinAs(workspace.id, ws, 'member', 'removed');
    const memberId = (await t.http().get('/v1/me').set(member.auth).expect(200)).body.id as string;
    await t.http().delete(`/v1/workspace/members/${memberId}`).set(ws).expect(204);
    await t.http().get('/v1/workspace').set(member.ws).expect(404);
  });
});
