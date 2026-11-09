import { describe, expect, it } from 'vitest';
import { DiscordProvider } from './discord.js';
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

  it('turns the member-list refusal into the same plain instruction, since only admins may read that list', async () => {
    const { fetcher } = scripted(
      { ok: true, result: { id: 42, username: 'ourbot' } },
      { ok: true, result: chat },
      { status: 400, body: { ok: false, error_code: 400, description: 'Bad Request: member list is inaccessible' } },
    );
    const error = await new TelegramProvider(fetcher)
      .connectWithCredentials({ botToken: '1:a', chat: '@ournews' })
      .catch((caught: unknown) => caught);
    expect((error as Error).message).toMatch(/not an administrator of that channel/);
  });

  it('counts the people in the channel, and replies under the message before it', async () => {
    const { fetcher, calls } = scripted({ ok: true, result: 1204 }, { ok: true, result: { message_id: 77 } });
    const provider = new TelegramProvider(fetcher);
    expect(await provider.fetchFollowers({ accessToken: '1:a', externalId: '-100' })).toBe(1204);
    const reply = await provider.addComment({
      accessToken: '1:a',
      externalId: '-100',
      externalPostId: '76',
      message: 'Part two',
    });
    expect(reply).toEqual({ externalPostId: '77' });
    expect(calls[0]!.url).toBe('https://api.telegram.org/bot1:a/getChatMemberCount');
    expect(sent(calls[1]!)).toMatchObject({ chat_id: '-100', text: 'Part two', reply_parameters: { message_id: 76 } });
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
  it('lists the login-based networks as ready to connect with a login, with the boxes to fill in', () => {
    const catalogue = new SocialProviders().catalogue();
    for (const network of ['telegram', 'discord']) {
      const entry = catalogue.find((item) => item.network === network)!;
      expect(entry).toMatchObject({ configured: true, auth: 'credentials' });
      expect(entry.fields.length).toBeGreaterThan(0);
      expect(entry.fields.every((box) => box.hint.length > 10)).toBe(true);
    }
    expect(catalogue.find((item) => item.network === 'x')).toMatchObject({ auth: 'oauth', fields: [] });
  });
});
