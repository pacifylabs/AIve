import { describe, expect, it, vi } from 'vitest';
import { BlueskyProvider, facetsFor } from './bluesky.js';
import { graphemeCount, plainText } from './credential.js';
import { DiscordProvider } from './discord.js';
import { MastodonProvider, normalizeInstance } from './mastodon.js';
import { ProviderError } from './provider.js';
import { SocialProviders } from './registry.js';
import { TelegramProvider } from './telegram.js';

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

interface Sent {
  record: { text: string; facets: unknown[] };
  media: unknown[];
  [field: string]: unknown;
}
const sent = (call: { init: RequestInit | undefined }) => JSON.parse(String(call.init?.body)) as Sent;
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;

describe('helpers', () => {
  it('counts what a person sees as one character', () => {
    expect(graphemeCount('héllo')).toBe(5);
    expect(graphemeCount('hi 👩‍👩‍👧')).toBe(4);
  });

  it('turns a post returned as HTML into its words', () => {
    expect(plainText('<p>Hello &amp; welcome<br>to <a href="x">us</a></p>')).toBe('Hello & welcome\nto us');
  });
});

describe('Bluesky', () => {
  const account = { accessToken: 'jwt', externalId: 'did:plc:abc', body: '', mediaUrls: [] as string[] };

  it('connects with a handle and an app password and keeps only the session', async () => {
    const exp = Math.floor(Date.now() / 1000) + 7200;
    const { fetcher, calls } = scripted({
      accessJwt: jwt(exp),
      refreshJwt: 'refresh',
      handle: 'me.bsky.social',
      did: 'did:plc:abc',
    });
    const result = await new BlueskyProvider(fetcher).connectWithCredentials({
      handle: '@Me.Bsky.Social',
      appPassword: 'abcd-efgh-ijkl-mnop',
    });
    expect(calls[0]!.url).toBe('https://bsky.social/xrpc/com.atproto.server.createSession');
    expect(sent(calls[0]!)).toEqual({ identifier: 'me.bsky.social', password: 'abcd-efgh-ijkl-mnop' });
    expect(result.accounts).toEqual([
      { externalId: 'did:plc:abc', name: 'me.bsky.social', username: 'me.bsky.social', kind: 'profile' },
    ]);
    expect(result.tokens.refreshToken).toBe('refresh');
    expect(result.tokens.expiresInSeconds).toBeGreaterThan(7000);
    expect(JSON.stringify(result)).not.toContain('abcd-efgh');
  });

  it('names the box that was left empty', async () => {
    await expect(
      new BlueskyProvider(scripted().fetcher).connectWithCredentials({ handle: 'me', appPassword: ' ' }),
    ).rejects.toThrow('Fill in "App password".');
  });

  it('says where links and hashtags are, in bytes, so they work as links', () => {
    const text = 'Café 🎉 see https://example.com/a. #launch';
    const [link, tag] = facetsFor(text);
    const bytes = new TextEncoder().encode(text);
    const slice = (facet: { index: { byteStart: number; byteEnd: number } }) =>
      new TextDecoder().decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd));
    expect(slice(link!)).toBe('https://example.com/a');
    expect(link!.features[0]).toMatchObject({ uri: 'https://example.com/a' });
    expect(slice(tag!)).toBe('#launch');
    expect(tag!.features[0]).toMatchObject({ tag: 'launch' });
  });

  it('posts the words and links as a record on the account, and returns a link to it', async () => {
    const { fetcher, calls } = scripted({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', cid: 'c' });
    const result = await new BlueskyProvider(fetcher).publishPost({
      ...account,
      body: 'Hello',
      linkUrl: 'https://example.com',
      metadata: { username: 'me.bsky.social' },
    });
    const body = sent(calls[0]!);
    expect(body).toMatchObject({ repo: 'did:plc:abc', collection: 'app.bsky.feed.post' });
    expect(body.record.text).toBe('Hello\nhttps://example.com');
    expect(body.record.facets).toHaveLength(1);
    expect(result).toEqual({
      externalPostId: 'at://did:plc:abc/app.bsky.feed.post/3kxyz',
      permalink: 'https://bsky.app/profile/me.bsky.social/post/3kxyz',
    });
  });

  it('refuses pictures and long posts before calling the network', async () => {
    const { fetcher, calls } = scripted();
    const provider = new BlueskyProvider(fetcher);
    await expect(provider.publishPost({ ...account, body: 'x', mediaUrls: ['https://i.test/a.jpg'] })).rejects.toThrow(
      /words and a link only/,
    );
    await expect(provider.publishPost({ ...account, body: '🙂'.repeat(301) })).rejects.toThrow(/300 characters/);
    await expect(provider.publishPost({ ...account, body: '🙂'.repeat(300) })).rejects.toThrow(); // reaches the (empty) fake
    expect(calls).toHaveLength(1);
  });

  it('treats an expired session as a login problem, even when Bluesky answers 400', async () => {
    const { fetcher } = scripted({ status: 400, body: { error: 'ExpiredToken', message: 'Token has expired' } });
    await expect(new BlueskyProvider(fetcher).publishPost({ ...account, body: 'hi' })).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('renews the session with its refresh token and stores the rotated one', async () => {
    const { fetcher, calls } = scripted({
      accessJwt: jwt(Math.floor(Date.now() / 1000) + 7200),
      refreshJwt: 'next',
      handle: 'h',
      did: 'd',
    });
    const tokens = await new BlueskyProvider(fetcher).refreshToken('old-refresh');
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe('Bearer old-refresh');
    expect(tokens.refreshToken).toBe('next');
  });

  it('finds a post that went up, so an uncertain publish is never repeated', async () => {
    const since = new Date('2026-11-06T10:00:00Z');
    const { fetcher } = scripted({
      records: [
        {
          uri: 'at://d/app.bsky.feed.post/old',
          value: { text: 'Launch day is here', createdAt: '2026-11-05T10:00:00Z' },
        },
        {
          uri: 'at://d/app.bsky.feed.post/new',
          value: { text: 'Launch day is here, join us', createdAt: '2026-11-06T10:05:00Z' },
        },
      ],
    });
    const found = await new BlueskyProvider(fetcher).findRecentPost({
      accessToken: 't',
      externalId: 'did:plc:abc',
      bodyStart: 'Launch day is here',
      since,
    });
    expect(found?.externalPostId).toBe('at://d/app.bsky.feed.post/new');
  });

  it('reads likes, reposts and replies', async () => {
    const { fetcher } = scripted({ posts: [{ likeCount: 3, repostCount: 1, replyCount: 2 }] });
    expect(
      await new BlueskyProvider(fetcher).fetchMetrics({ accessToken: 't', externalId: 'd', externalPostId: 'at://x' }),
    ).toEqual({
      likes: 3,
      reposts: 1,
      replies: 2,
      quotes: 0,
    });
  });
});

describe('Mastodon', () => {
  it('accepts a server written the ways people write it, and nothing else', () => {
    expect(normalizeInstance('https://Mastodon.Social/')).toBe('mastodon.social');
    expect(normalizeInstance('@me@fosstodon.org')).toBe('fosstodon.org');
    for (const bad of [
      'localhost',
      '169.254.169.254',
      '10.0.0.1',
      'intranet.internal',
      'x.local',
      'nodot',
      'a b.com',
      '',
    ]) {
      expect(() => normalizeInstance(bad), bad).toThrow(ProviderError);
    }
  });

  it('checks the token with the server and keeps the account apart by server and number', async () => {
    const { fetcher, calls } = scripted({ id: '109', username: 'me', display_name: 'Me Myself' });
    const guard = vi.fn(async () => {});
    const result = await new MastodonProvider({ hostGuard: guard }, fetcher).connectWithCredentials({
      instance: 'https://fosstodon.org',
      accessToken: 'tok',
    });
    expect(guard).toHaveBeenCalledWith('fosstodon.org');
    expect(calls[0]!.url).toBe('https://fosstodon.org/api/v1/accounts/verify_credentials');
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(result.accounts[0]).toMatchObject({
      externalId: 'fosstodon.org/109',
      name: 'Me Myself',
      username: '@me@fosstodon.org',
    });
    expect(result.tokens.expiresInSeconds).toBeNull();
  });

  it('never calls a server the guard refuses', async () => {
    const { fetcher, calls } = scripted();
    const guard = vi.fn(async () => {
      throw new ProviderError('That server is not allowed.', 'mastodon');
    });
    await expect(
      new MastodonProvider({ hostGuard: guard }, fetcher).connectWithCredentials({
        instance: 'evil.example.com',
        accessToken: 't',
      }),
    ).rejects.toThrow('not allowed');
    expect(calls).toHaveLength(0);
  });

  it('posts to the account’s own server with a key that stops a second copy', async () => {
    const { fetcher, calls } = scripted({ id: '777', url: 'https://fosstodon.org/@me/777' });
    const result = await new MastodonProvider({}, fetcher).publishPost({
      accessToken: 'tok',
      externalId: 'fosstodon.org/109',
      body: 'Hello',
      linkUrl: 'https://example.com',
      mediaUrls: [],
      idempotencyKey: 'post:abc',
    });
    expect(calls[0]!.url).toBe('https://fosstodon.org/api/v1/statuses');
    expect((calls[0]!.init?.headers as Record<string, string>)['Idempotency-Key']).toBe('post:abc');
    expect(sent(calls[0]!)).toEqual({ status: 'Hello\nhttps://example.com', visibility: 'public' });
    expect(result).toEqual({ externalPostId: '777', permalink: 'https://fosstodon.org/@me/777' });
  });

  it('replies as the first comment and reads its numbers', async () => {
    const { fetcher, calls } = scripted({}, { favourites_count: 4, reblogs_count: 2, replies_count: 1 });
    const provider = new MastodonProvider({}, fetcher);
    await provider.addComment({ accessToken: 't', externalId: 'h.org/1', externalPostId: '777', message: 'More here' });
    expect(sent(calls[0]!)).toMatchObject({ status: 'More here', in_reply_to_id: '777' });
    expect(await provider.fetchMetrics({ accessToken: 't', externalId: 'h.org/1', externalPostId: '777' })).toEqual({
      likes: 4,
      reposts: 2,
      replies: 1,
    });
  });

  it('finds a post that went up by its words, ignoring markup', async () => {
    const { fetcher } = scripted([
      { id: '5', url: 'u', content: '<p>Big <b>news</b> today</p>', created_at: '2026-11-06T10:05:00Z' },
    ]);
    const found = await new MastodonProvider({}, fetcher).findRecentPost({
      accessToken: 't',
      externalId: 'h.org/1',
      bodyStart: 'Big news today',
      since: new Date('2026-11-06T10:00:00Z'),
    });
    expect(found?.externalPostId).toBe('5');
  });

  it('refuses pictures', async () => {
    await expect(
      new MastodonProvider({}, scripted().fetcher).publishPost({
        accessToken: 't',
        externalId: 'h.org/1',
        body: 'x',
        mediaUrls: ['https://i.test/a.jpg'],
      }),
    ).rejects.toThrow(/words and a link only/);
  });
});

describe('Telegram', () => {
  const chat = { id: -1001234, title: 'Our news', username: 'ournews', type: 'channel' };
  const connectScript = (member: object) =>
    scripted(
      { ok: true, result: { id: 42, username: 'ourbot' } },
      { ok: true, result: chat },
      { ok: true, result: member },
    );

  it('connects a bot to a channel it can post in', async () => {
    const { fetcher, calls } = connectScript({ status: 'administrator', can_post_messages: true });
    const result = await new TelegramProvider(fetcher).connectWithCredentials({ botToken: '123:abc', chat: 'ournews' });
    expect(calls.map((call) => call.url.split('/').pop())).toEqual(['getMe', 'getChat', 'getChatMember']);
    expect(sent(calls[1]!)).toEqual({ chat_id: '@ournews' });
    expect(result.accounts[0]).toMatchObject({ externalId: '-1001234', name: 'Our news', username: '@ournews' });
    expect(result.tokens.accessToken).toBe('123:abc');
  });

  it('asks for the bot to be made an administrator when it is not one', async () => {
    const { fetcher } = connectScript({ status: 'member' });
    await expect(
      new TelegramProvider(fetcher).connectWithCredentials({ botToken: '1:a', chat: '@ournews' }),
    ).rejects.toThrow(/administrator/);
  });

  it('sends the text as plain text, so nothing in it is taken for formatting', async () => {
    const { fetcher, calls } = scripted({ ok: true, result: { message_id: 9 } });
    const result = await new TelegramProvider(fetcher).publishPost({
      accessToken: '1:a',
      externalId: '-1001234',
      body: 'Sale *today* [click](x)',
      mediaUrls: [],
      metadata: { username: '@ournews' },
    });
    expect(calls[0]!.url).toBe('https://api.telegram.org/bot1:a/sendMessage');
    expect(sent(calls[0]!)).toEqual({ chat_id: '-1001234', text: 'Sale *today* [click](x)' });
    expect(result).toEqual({ externalPostId: '9', permalink: 'https://t.me/ournews/9' });
  });

  it('sends pictures with the words as the caption, and refuses what it cannot send', async () => {
    const { fetcher, calls } = scripted({ ok: true, result: [{ message_id: 3 }, { message_id: 4 }] });
    const provider = new TelegramProvider(fetcher);
    const base = { accessToken: '1:a', externalId: '-100', body: 'Two photos' };
    await provider.publishPost({ ...base, mediaUrls: ['https://i.test/a.jpg', 'https://i.test/b.png'] });
    expect(calls[0]!.url.endsWith('sendMediaGroup')).toBe(true);
    expect(sent(calls[0]!).media).toEqual([
      { type: 'photo', media: 'https://i.test/a.jpg', caption: 'Two photos' },
      { type: 'photo', media: 'https://i.test/b.png' },
    ]);
    await expect(provider.publishPost({ ...base, mediaUrls: ['https://i.test/v.mp4'] })).rejects.toThrow(/Videos/);
    await expect(
      provider.publishPost({ ...base, body: 'x'.repeat(1025), mediaUrls: ['https://i.test/a.jpg'] }),
    ).rejects.toThrow(/1024/);
    expect(calls).toHaveLength(1);
  });

  it('treats a removed bot as a login problem and never puts the token in the message', async () => {
    const { fetcher } = scripted({
      status: 403,
      body: { ok: false, error_code: 403, description: 'Forbidden: bot was kicked' },
    });
    const error = await new TelegramProvider(fetcher)
      .publishPost({ accessToken: '999:secret-token', externalId: '-100', body: 'x', mediaUrls: [] })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: 'auth' });
    expect((error as Error).message).not.toContain('secret-token');
  });

  it('says how long to wait when Telegram asks for a pause', async () => {
    const { fetcher } = scripted({ status: 429, body: { ok: false, description: 'Too Many Requests: retry after 5' } });
    await expect(
      new TelegramProvider(fetcher).publishPost({ accessToken: '1:a', externalId: '-1', body: 'x', mediaUrls: [] }),
    ).rejects.toMatchObject({ kind: 'rate_limit' });
  });
});

describe('Discord', () => {
  const hook = 'https://discord.com/api/webhooks/123456/abc-DEF_ghi';

  it('only ever calls Discord’s own webhook address', async () => {
    const { fetcher, calls } = scripted();
    const provider = new DiscordProvider(fetcher);
    for (const bad of [
      'http://169.254.169.254/latest/meta-data',
      'https://discord.com.evil.example/api/webhooks/1/a',
      'https://evil.example/https://discord.com/api/webhooks/1/a',
      'https://discord.com/api/webhooks/1/a/extra',
      'https://discord.com/api/webhooks/abc/a',
    ]) {
      await expect(provider.connectWithCredentials({ webhookUrl: bad }), bad).rejects.toThrow(/not a Discord webhook/);
    }
    expect(calls).toHaveLength(0);
  });

  it('connects a webhook and keeps its address as the secret', async () => {
    const { fetcher } = scripted({ id: '123456', name: 'AI Staff', guild_id: 'g1', channel_id: 'c1' });
    const result = await new DiscordProvider(fetcher).connectWithCredentials({ webhookUrl: hook });
    expect(result.accounts[0]).toMatchObject({ externalId: '123456', name: 'AI Staff (Discord channel)' });
    expect(result.tokens.accessToken).toBe(hook);
  });

  it('posts without pinging anyone, with pictures embedded', async () => {
    const { fetcher, calls } = scripted({ id: 'm1', channel_id: 'c1', guild_id: 'g1' });
    const result = await new DiscordProvider(fetcher).publishPost({
      accessToken: hook,
      externalId: '123456',
      body: 'Hello @everyone',
      mediaUrls: ['https://i.test/a.jpg'],
    });
    expect(calls[0]!.url).toBe(`${hook}?wait=true`);
    expect(sent(calls[0]!)).toEqual({
      content: 'Hello @everyone',
      allowed_mentions: { parse: [] },
      embeds: [{ image: { url: 'https://i.test/a.jpg' } }],
    });
    expect(result.permalink).toBe('https://discord.com/channels/g1/c1/m1');
  });

  it('treats a deleted webhook as a login problem and refuses what it cannot send', async () => {
    const { fetcher } = scripted({ status: 404, body: { message: 'Unknown Webhook', code: 10015 } });
    const provider = new DiscordProvider(fetcher);
    await expect(
      provider.publishPost({ accessToken: hook, externalId: '1', body: 'x', mediaUrls: [] }),
    ).rejects.toMatchObject({
      kind: 'auth',
    });
    await expect(
      provider.publishPost({ accessToken: hook, externalId: '1', body: 'x'.repeat(2001), mediaUrls: [] }),
    ).rejects.toThrow(/2000/);
    await expect(
      provider.publishPost({ accessToken: hook, externalId: '1', body: 'x', mediaUrls: ['https://i.test/v.mov'] }),
    ).rejects.toThrow(/Videos/);
  });
});

describe('the network list', () => {
  it('lists the new networks as ready to connect with a login, with the boxes to fill in', () => {
    const catalogue = new SocialProviders().catalogue();
    for (const network of ['bluesky', 'mastodon', 'telegram', 'discord']) {
      const entry = catalogue.find((item) => item.network === network)!;
      expect(entry).toMatchObject({ configured: true, auth: 'credentials' });
      expect(entry.fields.length).toBeGreaterThan(0);
      expect(entry.fields.every((box) => box.hint.length > 10)).toBe(true);
    }
    expect(catalogue.find((item) => item.network === 'x')).toMatchObject({ auth: 'oauth', fields: [] });
  });
});
