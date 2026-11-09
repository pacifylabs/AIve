import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { sign } from '../src/media/cloudinary.client.js';
import { FakeCloudinary, signedInUser, startApp, type TestApp } from './helpers/app.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

async function workspace(label: string) {
  const owner = await signedInUser(t, label);
  const created = await t
    .http()
    .post('/v1/workspaces')
    .set(owner.auth)
    .send({ name: `${label} Co` })
    .expect(201);
  return { workspaceId: created.body.id as string, as: { ...owner.auth, 'X-Workspace-Id': created.body.id as string } };
}

/** What a browser does: upload to Cloudinary (here, the fake), then record the file. */
async function upload(
  w: { workspaceId: string; as: Record<string, string> },
  name = 'logo.png',
  kind: 'image' | 'video' = 'image',
) {
  const publicId = `ai-staff/${w.workspaceId}/${uuidv7()}`;
  t.cloudinary.files.set(publicId, {
    public_id: publicId,
    resource_type: kind,
    secure_url: `https://res.cloudinary.com/testcloud/${kind}/upload/${publicId}`,
    width: 1600,
    height: 900,
    bytes: 120_000,
  });
  const response = await t.http().post('/v1/social/media').set(w.as).send({ publicId, type: kind, name });
  return { publicId, response };
}

describe('the media library', () => {
  it('signs an upload for this workspace’s own folder', async () => {
    const w = await workspace('media1');
    const ticket = (await t.http().post('/v1/social/media/ticket').set(w.as).expect(200)).body as {
      folder: string;
      timestamp: number;
      signature: string;
    };
    expect(ticket.folder).toBe(`ai-staff/${w.workspaceId}`);
    expect(ticket.signature).toBe(
      FakeCloudinary.sha1(`folder=${ticket.folder}&timestamp=${ticket.timestamp}test-secret`),
    );
  });

  it('records an uploaded picture and lists it with the original and three cut shapes', async () => {
    const w = await workspace('media2');
    const { publicId, response } = await upload(w);
    expect(response.status).toBe(201);
    const list = (await t.http().get('/v1/social/media').set(w.as).expect(200)).body as {
      configured: boolean;
      items: { name: string; kind: string; width: number; urls: Record<string, string> }[];
    };
    expect(list.configured).toBe(true);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ name: 'logo.png', kind: 'image', width: 1600 });
    expect(Object.keys(list.items[0]!.urls)).toEqual(['original', 'square', 'portrait', 'landscape']);
    expect(list.items[0]!.urls.square).toContain(`square/${publicId}`);
  });

  it('lists a video with its own address only', async () => {
    const w = await workspace('media3');
    await upload(w, 'promo.mp4', 'video');
    const [item] = (await t.http().get('/v1/social/media').set(w.as).expect(200)).body.items as { urls: object }[];
    expect(Object.keys(item!.urls)).toEqual(['original']);
  });

  it('refuses a file from another workspace’s folder, one Cloudinary does not have, and a repeat', async () => {
    const w = await workspace('media4');
    const other = await workspace('media4b');
    const theirs = await upload(other);
    const stolen = await t
      .http()
      .post('/v1/social/media')
      .set(w.as)
      .send({ publicId: theirs.publicId, type: 'image', name: 'x' })
      .expect(400);
    expect(stolen.body.errors[0].path).toBe('publicId');
    await t
      .http()
      .post('/v1/social/media')
      .set(w.as)
      .send({ publicId: `ai-staff/${w.workspaceId}/nothing`, type: 'image', name: 'x' })
      .expect(404);
    const mine = await upload(w);
    await t
      .http()
      .post('/v1/social/media')
      .set(w.as)
      .send({ publicId: mine.publicId, type: 'image', name: 'again' })
      .expect(409);
    expect((await t.http().get('/v1/social/media').set(other.as).expect(200)).body.items).toHaveLength(1);
  });

  it('deletes a file and removes it from Cloudinary, but not one a scheduled post still uses', async () => {
    const w = await workspace('media5');
    const { publicId } = await upload(w);
    const [item] = (await t.http().get('/v1/social/media').set(w.as).expect(200)).body.items as {
      id: string;
      urls: { original: string };
    }[];
    // A post that uses the file.
    t.social.facebook.accounts = [{ externalId: 'p', name: 'Page', kind: 'page' }];
    const start = await t.http().post('/v1/social/accounts/connect/facebook').set(w.as).expect(200);
    const state = new URL(start.body.authUrl).searchParams.get('state')!;
    const landed = new URL(
      (await t.http().get('/v1/social/callback/facebook').query({ code: 'abc', state }).expect(302)).headers.location!,
    );
    const [account] = (
      await t
        .http()
        .post(`/v1/social/pending/${landed.searchParams.get('pending')}/select`)
        .set(w.as)
        .send({ externalIds: ['p'] })
        .expect(200)
    ).body as { id: string }[];
    await t
      .http()
      .post('/v1/staff')
      .set(w.as)
      .send({ roleKey: 'social_media', displayName: 'Sam', settings: { accountIds: [account!.id] } })
      .expect(201);
    await t
      .http()
      .post('/v1/social/posts')
      .set(w.as)
      .send({
        requestId: uuidv7(),
        accountIds: [account!.id],
        body: 'With picture',
        mediaUrls: [item!.urls.original],
        scheduledLocal: `${new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)}T09:00`,
      })
      .expect(201);
    await t.http().delete(`/v1/social/media/${item!.id}`).set(w.as).expect(409);
    const [post] = (await t.http().get('/v1/social/posts').set(w.as).expect(200)).body as { id: string }[];
    await t.http().post(`/v1/social/posts/${post!.id}/cancel`).set(w.as).expect(200);
    await t.http().delete(`/v1/social/media/${item!.id}`).set(w.as).expect(204);
    expect(t.cloudinary.destroyed).toContain(publicId);
    expect((await t.http().get('/v1/social/media').set(w.as).expect(200)).body.items).toEqual([]);
  });

  it('keeps one workspace from deleting another’s file', async () => {
    const w = await workspace('media6');
    const other = await workspace('media6b');
    await upload(w);
    const [item] = (await t.http().get('/v1/social/media').set(w.as).expect(200)).body.items as { id: string }[];
    await t.http().delete(`/v1/social/media/${item!.id}`).set(other.as).expect(404);
  });
});

describe('Cloudinary signatures', () => {
  it('sort the parameters and put the secret last before hashing', () => {
    expect(sign({ timestamp: 5, folder: 'a/b' }, 'sec')).toBe(FakeCloudinary.sha1('folder=a/b&timestamp=5sec'));
  });
});
