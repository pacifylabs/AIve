import { describe, expect, it } from 'vitest';
import { FixtureSocialProvider } from './fixture.js';
import { MetaProvider } from './meta.js';
import { callApi, ProviderError } from './provider.js';
import { SocialProviders } from './registry.js';
import { XProvider } from './x.js';

const meta = { appId: 'app', appSecret: 'secret', graphVersion: 'v21.0', messaging: false };

/** A fetch that answers from a script and records every call. */
function scripted(...answers: (object | { status: number; body: object } | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (next instanceof Error) return Promise.reject(next);
    const status = next && 'status' in next ? (next as { status: number }).status : 200;
    const body = next && 'body' in next ? (next as { body: object }).body : (next ?? {});
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
  return { fetcher, calls };
}

const body = (call: { init: RequestInit | undefined }) =>
  Object.fromEntries(new URLSearchParams(String(call.init?.body)));

describe('callApi error classification', () => {
  it('treats Meta token errors as auth and limit errors as rate limits', async () => {
    const auth = scripted({ status: 400, body: { error: { message: 'Invalid OAuth access token.', code: 190 } } });
    await expect(callApi('facebook', 'https://x.test', {}, auth.fetcher)).rejects.toMatchObject({
      kind: 'auth',
      unknownOutcome: false,
    });
    const limited = scripted({ status: 400, body: { error: { message: 'Too many calls', code: 4 } } });
    await expect(callApi('facebook', 'https://x.test', {}, limited.fetcher)).rejects.toMatchObject({
      kind: 'rate_limit',
    });
    const http429 = scripted({ status: 429, body: {} });
    await expect(callApi('x', 'https://x.test', {}, http429.fetcher)).rejects.toMatchObject({ kind: 'rate_limit' });
  });

  it('marks a dropped connection and a server error as an unknown outcome, but a refusal as definite', async () => {
    await expect(
      callApi('x', 'https://x.test', {}, scripted(new Error('socket hang up')).fetcher),
    ).rejects.toMatchObject({ unknownOutcome: true });
    await expect(callApi('x', 'https://x.test', {}, scripted({ status: 502, body: {} }).fetcher)).rejects.toMatchObject(
      { unknownOutcome: true },
    );
    await expect(
      callApi('x', 'https://x.test', {}, scripted({ status: 400, body: { detail: 'Duplicate content' } }).fetcher),
    ).rejects.toMatchObject({
      unknownOutcome: false,
      message: 'Duplicate content',
    });
  });
});

describe('MetaProvider', () => {
  it('posts text and a link to a Page feed with the page token', async () => {
    const { fetcher, calls } = scripted({ id: '123_456' });
    const result = await new MetaProvider('facebook', meta, { fetcher }).publishPost({
      accessToken: 'page-token',
      externalId: '123',
      body: 'Hello',
      mediaUrls: [],
      linkUrl: 'https://northfield.test',
    });
    expect(result).toMatchObject({ externalPostId: '123_456', permalink: 'https://www.facebook.com/123_456' });
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v21.0/123/feed');
    expect(body(calls[0]!)).toMatchObject({
      access_token: 'page-token',
      message: 'Hello',
      link: 'https://northfield.test',
    });
  });

  it('refuses a Facebook post that mixes pictures and a video, before calling the network', async () => {
    const { fetcher, calls } = scripted();
    await expect(
      new MetaProvider('facebook', meta, { fetcher }).publishPost({
        accessToken: 't',
        externalId: '1',
        body: 'x',
        mediaUrls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.mp4'],
      }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toHaveLength(0);
  });

  it('Instagram needs media, and publishes a picture as a container then a publish', async () => {
    const instagram = (fetcher: typeof fetch) => new MetaProvider('instagram', meta, { fetcher });
    await expect(
      instagram(scripted().fetcher).publishPost({ accessToken: 't', externalId: 'ig', body: 'x', mediaUrls: [] }),
    ).rejects.toThrow(/needs an image or a video/);

    const { fetcher, calls } = scripted(
      { id: 'container-1' },
      { id: 'media-9' },
      { permalink: 'https://instagram.com/p/abc' },
    );
    const result = await instagram(fetcher).publishPost({
      accessToken: 't',
      externalId: 'ig',
      body: 'Caption',
      mediaUrls: ['https://cdn.test/a.jpg'],
    });
    expect(result).toMatchObject({ externalPostId: 'media-9', permalink: 'https://instagram.com/p/abc' });
    expect(calls[0]!.url).toContain('/ig/media');
    expect(body(calls[0]!)).toMatchObject({ image_url: 'https://cdn.test/a.jpg', caption: 'Caption' });
    expect(body(calls[1]!)).toMatchObject({ creation_id: 'container-1' });
  });

  it('a Reel waits for the container, and gives up as retryable if it never finishes', async () => {
    const ready = scripted({ id: 'c' }, { status_code: 'IN_PROGRESS' }, { status_code: 'FINISHED' }, { id: 'm' }, {});
    const ok = await new MetaProvider('instagram', meta, {
      fetcher: ready.fetcher,
      sleep: () => Promise.resolve(),
    }).publishPost({
      accessToken: 't',
      externalId: 'ig',
      body: 'x',
      mediaUrls: ['https://cdn.test/a.mp4'],
    });
    expect(ok.externalPostId).toBe('m');

    const stuck = scripted({ id: 'c' }, ...Array.from({ length: 12 }, () => ({ status_code: 'IN_PROGRESS' })));
    await expect(
      new MetaProvider('instagram', meta, { fetcher: stuck.fetcher, sleep: () => Promise.resolve() }).publishPost({
        accessToken: 't',
        externalId: 'ig',
        body: 'x',
        mediaUrls: ['https://cdn.test/a.mp4'],
      }),
    ).rejects.toMatchObject({ kind: 'rate_limit', unknownOutcome: false });
  });

  it('finds a post that went up by its first words, but not an older or different one', async () => {
    const posts = {
      data: [
        { id: 'a', message: 'Hello from Northfield, our new plan', created_time: '2026-11-03T10:00:30Z' },
        { id: 'b', message: 'Hello from Northfield, our new plan', created_time: '2026-11-01T10:00:00Z' },
      ],
    };
    const found = await new MetaProvider('facebook', meta, { fetcher: scripted(posts).fetcher }).findRecentPost({
      accessToken: 't',
      externalId: '1',
      bodyStart: 'Hello from Northfield',
      since: new Date('2026-11-03T10:00:00Z'),
    });
    expect(found?.externalPostId).toBe('a');
    const none = await new MetaProvider('facebook', meta, { fetcher: scripted(posts).fetcher }).findRecentPost({
      accessToken: 't',
      externalId: '1',
      bodyStart: 'A different post',
      since: new Date('2026-11-03T10:00:00Z'),
    });
    expect(none).toBeNull();
  });

  it('says plainly when the app is not configured', async () => {
    const unset = new MetaProvider('facebook', { ...meta, appId: '' });
    expect(unset.isConfigured()).toBe(false);
    expect(() => unset.getAuthUrl({ redirectUri: 'https://x.test', state: 's' })).toThrow(/META_APP_ID/);
  });
});

describe('XProvider', () => {
  const x = (fetcher: typeof fetch) => new XProvider({ clientId: 'id', clientSecret: 'secret' }, fetcher);

  it('posts text and a link, and refuses media rather than dropping it', async () => {
    const { fetcher, calls } = scripted({ data: { id: '42' } });
    const result = await x(fetcher).publishPost({
      accessToken: 't',
      externalId: 'u',
      body: 'Hi',
      mediaUrls: [],
      linkUrl: 'https://n.test',
      metadata: { username: 'north' },
    });
    expect(result).toMatchObject({ externalPostId: '42', permalink: 'https://x.com/north/status/42' });
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ text: 'Hi\nhttps://n.test' });
    await expect(
      x(scripted().fetcher).publishPost({
        accessToken: 't',
        externalId: 'u',
        body: 'Hi',
        mediaUrls: ['https://c.test/a.jpg'],
      }),
    ).rejects.toThrow(/words and a link only/);
  });

  it('needs a PKCE challenge, and keeps the old refresh token if X does not rotate it', async () => {
    expect(() => x(scripted().fetcher).getAuthUrl({ redirectUri: 'https://a.test', state: 's' })).toThrow(/PKCE/);
    const tokens = await x(scripted({ access_token: 'new' }).fetcher).refreshToken('old-refresh');
    expect(tokens).toMatchObject({ accessToken: 'new', refreshToken: 'old-refresh' });
  });

  it('does not list the account’s own replies as comments to answer', async () => {
    const comments = await x(
      scripted({
        data: [
          { id: '1', text: 'Nice!', author_id: 'other' },
          { id: '2', text: 'Thanks!', author_id: 'me' },
        ],
        includes: { users: [{ id: 'other', name: 'Ada', username: 'ada' }] },
      }).fetcher,
    ).fetchComments({ accessToken: 't', externalId: 'me', externalPostId: '99' });
    expect(comments.map((comment) => comment.externalId)).toEqual(['1']);
  });
});

describe('SocialProviders', () => {
  it('lists every network, saying which are configured, and lets a fixture stand in for LinkedIn', () => {
    const providers = new SocialProviders({}, [new FixtureSocialProvider('linkedin')]);
    expect(providers.catalogue().map((entry) => [entry.network, entry.configured])).toEqual([
      ['facebook', false],
      ['instagram', false],
      ['linkedin', true],
      ['x', false],
    ]);
    expect(() => new SocialProviders().get('linkedin')).toThrow(/cannot post to linkedin/);
  });
});

describe('FixtureSocialProvider', () => {
  const post = { accessToken: 't', externalId: 'a', body: 'Hello world', mediaUrls: [] };

  it('can fail each way, and can post while reporting an unknown outcome', async () => {
    const fixture = new FixtureSocialProvider('facebook');
    fixture.next = 'auth';
    await expect(fixture.publishPost(post)).rejects.toMatchObject({ kind: 'auth' });
    fixture.next = 'drop';
    await expect(fixture.publishPost(post)).rejects.toMatchObject({ unknownOutcome: true });
    expect(fixture.posts).toHaveLength(1);
    const found = await fixture.findRecentPost({ bodyStart: 'Hello world', since: new Date(Date.now() - 1000) });
    expect(found?.externalPostId).toBe(fixture.posts[0]!.externalPostId);
  });
});
