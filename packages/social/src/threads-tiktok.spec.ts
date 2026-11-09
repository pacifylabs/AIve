import { describe, expect, it } from 'vitest';
import { isPendingPublish } from './provider.js';
import { SocialProviders } from './registry.js';
import { ThreadsProvider } from './threads.js';
import { TikTokProvider } from './tiktok.js';

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
const query = (call: { url: string }) => new URL(call.url).searchParams;
const body = (call: { init: RequestInit | undefined }) => new URLSearchParams(String(call.init?.body));

describe('Threads', () => {
  const config = { appId: 'app1', appSecret: 'secret1' };
  const login = { accessToken: 'tok', externalId: '77' };

  it('is not configured until it has its own app id and secret, and says so when asked to connect', () => {
    const bare = new ThreadsProvider({ appId: '', appSecret: '' });
    expect(bare.isConfigured()).toBe(false);
    expect(() => bare.getAuthUrl({ redirectUri: 'https://api.test/cb', state: 's' })).toThrow(/THREADS_APP_ID/);
  });

  it('sends the person to Threads with the permissions it needs', () => {
    const url = new URL(new ThreadsProvider(config).getAuthUrl({ redirectUri: 'https://api.test/cb', state: 'st' }));
    expect(url.origin + url.pathname).toBe('https://threads.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('threads_basic,threads_content_publish,threads_manage_insights');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('trades the code for a short token and that for one that lasts', async () => {
    const { fetcher, calls } = scripted(
      { access_token: 'short', user_id: 77 },
      { access_token: 'long', expires_in: 5_183_944 },
    );
    const tokens = await new ThreadsProvider(config, { fetcher }).exchangeCode({
      code: 'c',
      redirectUri: 'https://api.test/cb',
    });
    expect(tokens).toMatchObject({ accessToken: 'long', expiresInSeconds: 5_183_944 });
    expect(calls[0]!.url).toBe('https://graph.threads.com/oauth/access_token');
    expect(body(calls[0]!).get('grant_type')).toBe('authorization_code');
    expect(query(calls[1]!).get('grant_type')).toBe('th_exchange_token');
    expect(query(calls[1]!).get('access_token')).toBe('short');
  });

  it('refreshes a long token with the refresh call, not a new sign-in', async () => {
    const { fetcher, calls } = scripted({ access_token: 'renewed', expires_in: 5_000_000 });
    const tokens = await new ThreadsProvider(config, { fetcher }).refreshToken('old');
    expect(tokens.accessToken).toBe('renewed');
    expect(calls[0]!.url).toContain('https://graph.threads.com/refresh_access_token');
    expect(query(calls[0]!).get('grant_type')).toBe('th_refresh_token');
  });

  it('lists the one profile the login belongs to', async () => {
    const { fetcher } = scripted({ id: '77', username: 'northfield' });
    const [account] = await new ThreadsProvider(config, { fetcher }).listAccounts({ accessToken: 'tok' });
    expect(account).toMatchObject({ externalId: '77', name: '@northfield', username: 'northfield' });
  });

  it('makes a text container with the link as a card, then hands back a ticket instead of waiting', async () => {
    const { fetcher, calls } = scripted({ id: 'container-1' });
    const result = await new ThreadsProvider(config, { fetcher }).publishPost({
      ...login,
      body: 'A new article',
      mediaUrls: [],
      linkUrl: 'https://northfield.test/a',
    });
    expect(isPendingPublish(result) && result.pending.ticket).toBe('container-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://graph.threads.com/v1.0/77/threads');
    expect(body(calls[0]!).get('media_type')).toBe('TEXT');
    expect(body(calls[0]!).get('link_attachment')).toBe('https://northfield.test/a');
  });

  it('says a link cannot ride on a picture, and refuses more than one picture', async () => {
    const { fetcher, calls } = scripted({ id: 'container-2' });
    const provider = new ThreadsProvider(config, { fetcher });
    const result = await provider.publishPost({
      ...login,
      body: 'Look',
      mediaUrls: ['https://cdn.test/a.jpg'],
      linkUrl: 'https://northfield.test/a',
    });
    expect(body(calls[0]!).get('media_type')).toBe('IMAGE');
    expect(body(calls[0]!).get('image_url')).toBe('https://cdn.test/a.jpg');
    expect(body(calls[0]!).get('link_attachment')).toBeNull();
    expect(isPendingPublish(result) && result.pending.data?.note).toMatch(/link was left out/);
    await expect(
      provider.publishPost({ ...login, body: 'x', mediaUrls: ['https://c.test/1.jpg', 'https://c.test/2.jpg'] }),
    ).rejects.toThrow(/one picture or one video/);
  });

  it('waits while the container works, publishes it when finished, and never publishes twice', async () => {
    const { fetcher, calls } = scripted(
      { status: 200, body: { status: 'IN_PROGRESS' } },
      { status: 200, body: { status: 'FINISHED' } },
      { id: 'media-9' },
      { permalink: 'https://www.threads.com/@northfield/post/abc' },
    );
    const provider = new ThreadsProvider(config, { fetcher });
    const check = { ...login, ticket: 'container-1', body: 'x', data: { note: null } };
    expect(await provider.checkPublish(check)).toMatchObject({ state: 'processing' });
    const ready = await provider.checkPublish(check);
    expect(ready).toMatchObject({
      state: 'ready',
      result: { externalPostId: 'media-9', permalink: 'https://www.threads.com/@northfield/post/abc' },
    });
    expect(calls[2]!.url).toBe('https://graph.threads.com/v1.0/77/threads_publish');
    expect(body(calls[2]!).get('creation_id')).toBe('container-1');
  });

  it('reports a failed container, and an already-published one as unclear rather than posting again', async () => {
    const { fetcher, calls } = scripted(
      { status: 200, body: { status: 'ERROR', error_message: 'FAILED_DOWNLOADING_VIDEO' } },
      { status: 200, body: { status: 'PUBLISHED' } },
    );
    const provider = new ThreadsProvider(config, { fetcher });
    const check = { ...login, ticket: 'c', body: 'x' };
    expect(await provider.checkPublish(check)).toMatchObject({ state: 'failed' });
    expect(await provider.checkPublish(check)).toMatchObject({ state: 'uncertain' });
    expect(calls.every((call) => !call.url.includes('threads_publish'))).toBe(true);
  });

  it('reads the follower count, and posts a reply by naming the post it answers', async () => {
    const counts = scripted({ body: { data: [{ name: 'followers_count', total_value: { value: 812 } }] } });
    expect(await new ThreadsProvider(config, { fetcher: counts.fetcher }).fetchFollowers(login)).toBe(812);
    expect(counts.calls[0]!.url).toContain('/77/threads_insights');
    const reply = scripted({ body: { id: 'container-9' } }, { body: { id: 'reply-9' } });
    const sent = await new ThreadsProvider(config, { fetcher: reply.fetcher }).addComment({
      ...login,
      externalPostId: 'post-1',
      message: 'Part two',
    });
    expect(sent).toEqual({ externalPostId: 'reply-9' });
    expect(body(reply.calls[0]!).get('reply_to_id')).toBe('post-1');
    expect(body(reply.calls[1]!).get('creation_id')).toBe('container-9');
  });

  it('reads a day of views for the account, and says nothing when the network gave none', async () => {
    const views = scripted({ body: { data: [{ name: 'views', total_value: { value: 4200 } }] } });
    expect(
      await new ThreadsProvider(config, { fetcher: views.fetcher }).fetchReach({ ...login, day: '2026-11-08' }),
    ).toBe(4200);
    const url = new URL(views.calls[0]!.url);
    expect(url.pathname).toContain('/77/threads_insights');
    expect(url.searchParams.get('metric')).toBe('views');
    expect(url.searchParams.get('since')).toBe(String(Date.parse('2026-11-08T00:00:00Z') / 1000));
    const empty = scripted({ body: { data: [] } });
    expect(
      await new ThreadsProvider(config, { fetcher: empty.fetcher }).fetchReach({ ...login, day: '2026-11-08' }),
    ).toBeNull();
  });

  it('keeps going when one number is not available for a post', async () => {
    const { fetcher } = scripted(
      { data: [{ name: 'views', values: [{ value: 40 }] }] },
      { status: 400, body: { error: { message: 'not available' } } },
      { data: [{ name: 'replies', values: [{ value: 3 }] }] },
    );
    const metrics = await new ThreadsProvider(config, { fetcher }).fetchMetrics({ ...login, externalPostId: 'p' });
    expect(metrics).toMatchObject({ views: 40, replies: 3 });
  });
});

describe('TikTok', () => {
  const config = { clientKey: 'key1', clientSecret: 'secret1' };
  const login = { accessToken: 'act.tok', externalId: 'open-1' };
  const ok = { error: { code: 'ok', message: '' } };

  it('sends the person to TikTok asking only to post videos', () => {
    const url = new URL(new TikTokProvider(config).getAuthUrl({ redirectUri: 'https://api.test/cb', state: 'st' }));
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe('key1');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
  });

  it('trades the code for tokens, and keeps the refresh token that comes back', async () => {
    const { fetcher, calls } = scripted({
      access_token: 'act.1',
      refresh_token: 'rft.1',
      expires_in: 86_400,
      scope: 'user.info.basic,video.publish',
    });
    const tokens = await new TikTokProvider(config, { fetcher }).exchangeCode({
      code: 'c',
      redirectUri: 'https://api.test/cb',
    });
    expect(tokens).toMatchObject({ accessToken: 'act.1', refreshToken: 'rft.1', expiresInSeconds: 86_400 });
    expect(calls[0]!.url).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    expect(body(calls[0]!).get('client_secret')).toBe('secret1');
    expect(body(calls[0]!).get('grant_type')).toBe('authorization_code');
  });

  it('refreshes with the refresh token', async () => {
    const { fetcher, calls } = scripted({ access_token: 'act.2', refresh_token: 'rft.2', expires_in: 86_400 });
    const tokens = await new TikTokProvider(config, { fetcher }).refreshToken('rft.1');
    expect(tokens).toMatchObject({ accessToken: 'act.2', refreshToken: 'rft.2' });
    expect(body(calls[0]!).get('grant_type')).toBe('refresh_token');
    expect(body(calls[0]!).get('refresh_token')).toBe('rft.1');
  });

  it('lists the account the login belongs to', async () => {
    const { fetcher, calls } = scripted({ data: { user: { open_id: 'open-1', display_name: 'Northfield' } }, ...ok });
    const [account] = await new TikTokProvider(config, { fetcher }).listAccounts({ accessToken: 'act.tok' });
    expect(account).toMatchObject({ externalId: 'open-1', name: 'Northfield' });
    expect(calls[0]!.init?.method).toBe('GET');
  });

  it('takes videos only', async () => {
    const provider = new TikTokProvider(config, { fetcher: scripted().fetcher });
    await expect(provider.publishPost({ ...login, body: 'words', mediaUrls: [] })).rejects.toThrow(/videos only/);
    await expect(provider.publishPost({ ...login, body: 'x', mediaUrls: ['https://c.test/a.jpg'] })).rejects.toThrow(
      /videos only/,
    );
  });

  it('starts a post from a web address, using the most open privacy TikTok allows, and tells the person when it is private', async () => {
    const { fetcher, calls } = scripted(
      { data: { privacy_level_options: ['SELF_ONLY'] }, ...ok },
      { data: { publish_id: 'v_pub_url~v2.1' }, ...ok },
    );
    const result = await new TikTokProvider(config, { fetcher }).publishPost({
      ...login,
      body: 'Our new video #launch',
      mediaUrls: ['https://videos.northfield.test/a.mp4'],
      linkUrl: 'https://northfield.test',
    });
    expect(isPendingPublish(result) && result.pending.ticket).toBe('v_pub_url~v2.1');
    expect(isPendingPublish(result) && result.pending.data?.note).toMatch(/only you can see it/);
    expect(calls[0]!.url).toBe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/');
    expect(calls[1]!.url).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/');
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({
      post_info: { title: 'Our new video #launch', privacy_level: 'SELF_ONLY' },
      source_info: { source: 'PULL_FROM_URL', video_url: 'https://videos.northfield.test/a.mp4' },
    });
    expect((calls[1]!.init?.headers as Record<string, string>).Authorization).toBe('Bearer act.tok');
  });

  it('explains the two refusals people will hit before the app is approved', async () => {
    const unaudited = scripted(
      { data: { privacy_level_options: ['SELF_ONLY'] }, ...ok },
      {
        status: 403,
        body: { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'blocked' } },
      },
    );
    await expect(
      new TikTokProvider(config, { fetcher: unaudited.fetcher }).publishPost({
        ...login,
        body: 'x',
        mediaUrls: ['https://c.test/a.mp4'],
      }),
    ).rejects.toThrow(/has not approved this app yet/);
    const unverified = scripted(
      { data: { privacy_level_options: ['SELF_ONLY'] }, ...ok },
      { error: { code: 'url_ownership_unverified', message: 'no' } },
    );
    await expect(
      new TikTokProvider(config, { fetcher: unverified.fetcher }).publishPost({
        ...login,
        body: 'x',
        mediaUrls: ['https://c.test/a.mp4'],
      }),
    ).rejects.toThrow(/verified in your TikTok app/);
  });

  it('waits while TikTok fetches the video, then reports it posted, or failed with the reason', async () => {
    const { fetcher, calls } = scripted(
      { data: { status: 'PROCESSING_DOWNLOAD' }, ...ok },
      { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [] }, ...ok },
      { data: { status: 'FAILED', fail_reason: 'video_pull_failed' }, ...ok },
    );
    const provider = new TikTokProvider(config, { fetcher });
    const check = { ...login, ticket: 'v_pub_url~v2.1', body: 'x', data: { note: 'Only you can see it.' } };
    expect(await provider.checkPublish(check)).toMatchObject({ state: 'processing' });
    expect(await provider.checkPublish(check)).toMatchObject({
      state: 'ready',
      result: { externalPostId: 'v_pub_url~v2.1', note: 'Only you can see it.' },
    });
    expect(await provider.checkPublish(check)).toMatchObject({
      state: 'failed',
      message: expect.stringMatching(/video_pull_failed/),
    });
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ publish_id: 'v_pub_url~v2.1' });
  });
});

describe('the network list', () => {
  it('lists both as sign-in networks that are not configured until their keys are set', () => {
    const catalogue = new SocialProviders().catalogue();
    for (const network of ['threads', 'tiktok']) {
      expect(catalogue.find((entry) => entry.network === network)).toMatchObject({ configured: false, auth: 'oauth' });
    }
    const set = new SocialProviders({
      threads: { appId: 'a', appSecret: 'b' },
      tiktok: { clientKey: 'a', clientSecret: 'b' },
    }).catalogue();
    expect(
      set.filter((entry) => ['threads', 'tiktok'].includes(entry.network)).every((entry) => entry.configured),
    ).toBe(true);
  });
});
