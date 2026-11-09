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

  it('hands a Reel back as a ticket instead of waiting, and carries the link note along', async () => {
    const { fetcher, calls } = scripted({ id: 'container-7' });
    const result = await new MetaProvider('instagram', meta, { fetcher }).publishPost({
      accessToken: 't',
      externalId: 'ig',
      body: 'x',
      linkUrl: 'https://example.com',
      mediaUrls: ['https://cdn.test/a.mp4'],
    });
    expect(result).toEqual({
      pending: {
        ticket: 'container-7',
        data: { note: 'Links in an Instagram caption are not clickable.' },
        checkAfterSeconds: 15,
      },
    });
    // One call, to make the container. Nothing was published and nothing was waited for.
    expect(calls).toHaveLength(1);
    expect(body(calls[0]!)).toMatchObject({ video_url: 'https://cdn.test/a.mp4', media_type: 'REELS' });
  });

  it('looks at a Reel’s container: still processing, then publishes it once it is finished', async () => {
    const input = { accessToken: 't', externalId: 'ig', ticket: 'container-7', data: { note: null }, body: 'x' };

    const waiting = scripted({ status_code: 'IN_PROGRESS' });
    expect(await new MetaProvider('instagram', meta, { fetcher: waiting.fetcher }).checkPublish(input)).toEqual({
      state: 'processing',
    });
    expect(waiting.calls).toHaveLength(1);

    const done = scripted(
      { status_code: 'FINISHED' },
      { id: 'media-9' },
      { permalink: 'https://instagram.com/reel/abc' },
    );
    expect(await new MetaProvider('instagram', meta, { fetcher: done.fetcher }).checkPublish(input)).toEqual({
      state: 'ready',
      result: { externalPostId: 'media-9', permalink: 'https://instagram.com/reel/abc', note: null },
    });
    expect(body(done.calls[1]!)).toMatchObject({ creation_id: 'container-7' });
  });

  it('reports a Reel Instagram could not process as failed, and an expired one too', async () => {
    const input = { accessToken: 't', externalId: 'ig', ticket: 'c', data: null, body: 'x' };
    for (const code of ['ERROR', 'EXPIRED']) {
      const { fetcher } = scripted({ status: 200, body: { status_code: code, status: 'Video is too long' } });
      await expect(new MetaProvider('instagram', meta, { fetcher }).checkPublish(input)).resolves.toMatchObject({
        state: 'failed',
        message: expect.stringContaining('could not process the video'),
      });
    }
  });

  it('never repeats the publish step: an unanswered one is uncertain, a failed look is only thrown', async () => {
    const input = { accessToken: 't', externalId: 'ig', ticket: 'c', data: null, body: 'x' };
    const lost = scripted({ status_code: 'FINISHED' }, new Error('socket hang up'));
    expect(await new MetaProvider('instagram', meta, { fetcher: lost.fetcher }).checkPublish(input)).toMatchObject({
      state: 'uncertain',
    });
    expect(lost.calls).toHaveLength(2);

    // The look itself failing says nothing about the post: it is thrown so the caller can look again.
    const noLook = scripted(new Error('socket hang up'));
    await expect(
      new MetaProvider('instagram', meta, { fetcher: noLook.fetcher }).checkPublish(input),
    ).rejects.toMatchObject({
      unknownOutcome: true,
    });
    expect(noLook.calls).toHaveLength(1);
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

  it('posts text and a link', async () => {
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
  });

  describe('pictures and video', () => {
    const png = new Uint8Array(5 * 1024 * 1024 + 10); // three pieces of 2 MB
    const fetchMedia = (url: string) =>
      Promise.resolve(
        url.endsWith('.mp4')
          ? { bytes: png, contentType: 'video/mp4' }
          : { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' },
      );
    const withMedia = (fetcher: typeof fetch, waits: number[] = []) =>
      new XProvider({ clientId: 'id', clientSecret: 'secret' }, fetcher, {
        fetchMedia,
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      });
    const login = { accessToken: 't', externalId: 'u', body: 'Look', metadata: { username: 'north' } };

    it('uploads each picture in pieces, then attaches the ids to the post', async () => {
      const { fetcher, calls } = scripted(
        { data: { id: 'm1' } },
        {},
        {},
        { data: { id: 'm2' } },
        {},
        {},
        { data: { id: '77' } },
      );
      const result = await withMedia(fetcher).publishPost({
        ...login,
        mediaUrls: ['https://c.test/a.png', 'https://c.test/b.png'],
      });
      expect(result.externalPostId).toBe('77');
      expect(calls[0]!.url).toBe('https://api.x.com/2/media/upload/initialize');
      expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
        media_type: 'image/png',
        total_bytes: 3,
        media_category: 'tweet_image',
      });
      expect(calls[1]!.url).toBe('https://api.x.com/2/media/upload/m1/append');
      expect(calls[2]!.url).toBe('https://api.x.com/2/media/upload/m1/finalize');
      expect(JSON.parse(String(calls.at(-1)!.init?.body))).toEqual({
        text: 'Look',
        media: { media_ids: ['m1', 'm2'] },
      });
    });

    it('sends a video in 2 MB pieces and waits until X has processed it', async () => {
      const waits: number[] = [];
      const { fetcher, calls } = scripted(
        { data: { id: 'v1' } },
        {},
        {},
        {},
        { data: { processing_info: { state: 'pending', check_after_secs: 3 } } },
        { data: { processing_info: { state: 'in_progress', check_after_secs: 2 } } },
        { data: { processing_info: { state: 'succeeded' } } },
        { data: { id: '88' } },
      );
      await withMedia(fetcher, waits).publishPost({ ...login, mediaUrls: ['https://c.test/a.mp4'] });
      const appends = calls.filter((call) => call.url.endsWith('/append'));
      expect(appends).toHaveLength(3);
      expect(JSON.parse(String(calls[0]!.init?.body)).media_category).toBe('tweet_video');
      expect(waits).toEqual([3000, 2000]);
      expect(calls.some((call) => call.url.includes('media/upload?command=STATUS&media_id=v1'))).toBe(true);
    });

    it('stops with X’s reason when processing fails, and posts nothing', async () => {
      const { fetcher, calls } = scripted(
        { data: { id: 'v1' } },
        {},
        {},
        {},
        { data: { processing_info: { state: 'failed', error: { message: 'Unsupported codec' } } } },
      );
      await expect(withMedia(fetcher).publishPost({ ...login, mediaUrls: ['https://c.test/a.mp4'] })).rejects.toThrow(
        /Unsupported codec/,
      );
      expect(calls.some((call) => call.url.endsWith('/tweets'))).toBe(false);
    });

    it('refuses what X cannot take, before uploading anything', async () => {
      const { fetcher, calls } = scripted();
      const provider = withMedia(fetcher);
      await expect(
        provider.publishPost({ ...login, mediaUrls: Array(5).fill('https://c.test/a.png') }),
      ).rejects.toThrow(/up to four pictures/);
      await expect(
        provider.publishPost({ ...login, mediaUrls: ['https://c.test/a.mp4', 'https://c.test/a.png'] }),
      ).rejects.toThrow(/not both/);
      await expect(
        new XProvider({ clientId: 'id', clientSecret: 'secret' }, fetcher).publishPost({
          ...login,
          mediaUrls: ['https://c.test/a.png'],
        }),
      ).rejects.toThrow(/not available for X on this server/);
      expect(calls).toHaveLength(0);
    });
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
  it('lists every network, saying which are configured, and lets a fixture stand in for X', () => {
    const providers = new SocialProviders({}, [new FixtureSocialProvider('x')]);
    expect(providers.catalogue().map((entry) => [entry.network, entry.configured])).toEqual([
      ['facebook', false],
      ['instagram', false],
      ['linkedin', false],
      ['threads', false],
      ['tiktok', false],
      ['x', true],
      // Connected with a token or webhook, so there is no app of ours to configure.
      ['telegram', true],
      ['discord', true],
    ]);
    expect(new SocialProviders().get('linkedin').isConfigured()).toBe(false);
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

describe('MetaProvider accounts', () => {
  it('keeps the Meta user id on every Page and Instagram account, for the removal callbacks', async () => {
    const answers = [
      {
        data: [
          {
            id: 'p1',
            name: 'Northfield',
            access_token: 'pt',
            instagram_business_account: { id: 'ig1', username: 'northfield' },
          },
        ],
      },
      { id: 'user-77' },
      {
        data: [
          {
            id: 'p1',
            name: 'Northfield',
            access_token: 'pt',
            instagram_business_account: { id: 'ig1', username: 'northfield' },
          },
        ],
      },
      { id: 'user-77' },
    ];
    const fetcher = (async () => new Response(JSON.stringify(answers.shift()), { status: 200 })) as typeof fetch;
    const config = { appId: 'a', appSecret: 's', graphVersion: 'v21.0', messaging: false };
    const [page] = await new MetaProvider('facebook', config, { fetcher }).listAccounts({ accessToken: 't' });
    const [insta] = await new MetaProvider('instagram', config, { fetcher }).listAccounts({ accessToken: 't' });
    expect(page?.metadata).toMatchObject({ metaUserId: 'user-77' });
    expect(insta?.metadata).toMatchObject({ metaUserId: 'user-77' });
  });
});

describe('follower counts and replies on Meta and X', () => {
  const answer = (...bodies: object[]) => {
    const calls: string[] = [];
    const fetcher = (async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify(bodies.shift()), { status: 200 });
    }) as typeof fetch;
    return { fetcher, calls };
  };

  it('reads followers_count from a Page, an Instagram account and an X profile', async () => {
    const meta = answer({ followers_count: 4321 });
    const config = { appId: 'a', appSecret: 's', graphVersion: 'v21.0', messaging: false };
    expect(
      await new MetaProvider('facebook', config, { fetcher: meta.fetcher }).fetchFollowers({
        accessToken: 't',
        externalId: 'p1',
      }),
    ).toBe(4321);
    expect(meta.calls[0]).toContain('/p1?fields=followers_count');
    const x = answer({ data: { public_metrics: { followers_count: 77 } } });
    expect(
      await new XProvider({ clientId: 'id', clientSecret: 'secret' }, x.fetcher).fetchFollowers({ accessToken: 't' }),
    ).toBe(77);
    const none = answer({});
    await expect(
      new XProvider({ clientId: 'id', clientSecret: 'secret' }, none.fetcher).fetchFollowers({ accessToken: 't' }),
    ).rejects.toThrow(/follower count/);
  });

  it('returns the id of an X reply, so the next part can answer it', async () => {
    const { fetcher } = answer({ data: { id: 'tweet-2' } });
    const reply = await new XProvider({ clientId: 'id', clientSecret: 'secret' }, fetcher).addComment({
      accessToken: 't',
      externalId: 'me',
      externalPostId: 'tweet-1',
      message: 'Part two',
    });
    expect(reply).toEqual({ externalPostId: 'tweet-2' });
  });
});
