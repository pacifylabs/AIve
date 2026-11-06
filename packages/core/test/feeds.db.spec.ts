import { ConnectedAccount, ContentFeed, type DataSource, FeedItem, StaffMember } from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARTICLE_FOUND, FeedPoller } from '../src/index.js';
import { clock, connect, events, inWorkspace, seedWorkspace } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

// A literal public address, so no name is looked up and nothing leaves the machine.
const URL_OF_FEED = 'https://93.184.216.34/feed.xml';

const rss = (items: { n: number; date: string }[]) =>
  `<rss version="2.0"><channel><title>Blog</title>${items
    .map(
      ({ n, date }) =>
        `<item><title>Article ${n}</title><link>https://example.com/${n}</link><guid>g-${n}</guid><pubDate>${date}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;

async function setup(xml: { body: string }) {
  const ws = await seedWorkspace(db);
  const time = clock('2026-11-06T10:00:00Z');
  const fetcher = (() =>
    Promise.resolve(
      new Response(xml.body, { headers: { 'content-type': 'application/rss+xml' } }),
    )) as unknown as typeof fetch;
  const poller = new FeedPoller(db, { fetcher, now: time.now });
  const makeAccount = (health: 'ok' | 'broken', name: string) =>
    inWorkspace(db, ws.workspaceId, async (m) =>
      m.save(
        m.create(ConnectedAccount, {
          id: uuidv7(),
          workspaceId: ws.workspaceId,
          network: 'facebook',
          externalId: name,
          name,
          username: 'handle',
          parentExternalId: null,
          secretEnc: 'x',
          tokenExpiresAt: null,
          scopes: [],
          health,
          healthReason: null,
          lastCheckedAt: null,
          metadata: {},
        }),
      ),
    );
  const staff = await inWorkspace(db, ws.workspaceId, (m) =>
    m.save(
      m.create(StaffMember, {
        workspaceId: ws.workspaceId,
        roleKey: 'social_media',
        roleVersion: 1,
        displayName: 'Sam',
        signature: null,
        disclosure: 'ai_labelled',
        settings: {},
        state: 'active',
        pausedReason: null,
        dailyCapUsd: null,
      }),
    ),
  );
  const addFeed = (accountIds: string[], state: 'active' | 'paused' = 'active', url = URL_OF_FEED) =>
    inWorkspace(db, ws.workspaceId, (m) =>
      m.save(
        m.create(ContentFeed, {
          workspaceId: ws.workspaceId,
          staffId: staff.id,
          url,
          title: null,
          accountIds,
          note: null,
          state,
          lastCheckedAt: null,
          nextCheckAt: time.now(),
          failures: 0,
          lastError: null,
          createdBy: null,
        }),
      ),
    );
  const items = () =>
    inWorkspace(db, ws.workspaceId, (m) => m.find(FeedItem, { where: { workspaceId: ws.workspaceId } }));
  const found = async () => (await events(db, ws.workspaceId)).filter((event) => event.type === ARTICLE_FOUND);
  return { ...ws, time, poller, makeAccount, addFeed, items, found };
}

describe('feed polling', () => {
  it('drafts only the newest article the first time, and the rest are remembered but left alone', async () => {
    const s = await setup({
      body: rss([
        { n: 3, date: 'Thu, 05 Nov 2026 09:00:00 GMT' },
        { n: 2, date: 'Wed, 04 Nov 2026 09:00:00 GMT' },
        { n: 1, date: 'Tue, 03 Nov 2026 09:00:00 GMT' },
      ]),
    });
    const account = await s.makeAccount('ok', 'Page');
    const feed = await s.addFeed([account.id]);

    expect(await s.poller.poll(s.workspaceId, feed.id)).toEqual({ queued: 1 });
    const stored = await s.items();
    expect(stored.filter((item) => item.state === 'queued').map((item) => item.title)).toEqual(['Article 3']);
    expect(stored.filter((item) => item.state === 'backlog')).toHaveLength(2);

    const [event] = await s.found();
    expect(event?.payload).toMatchObject({
      staffId: feed.staffId,
      accountId: account.id,
      network: 'facebook',
      handle: 'handle',
    });
  });

  it('later checks draft up to three new articles, and nothing is drafted twice', async () => {
    const xml = { body: rss([{ n: 1, date: 'Thu, 05 Nov 2026 09:00:00 GMT' }]) };
    const s = await setup(xml);
    const account = await s.makeAccount('ok', 'Page');
    const feed = await s.addFeed([account.id]);
    await s.poller.poll(s.workspaceId, feed.id);

    xml.body = rss([6, 5, 4, 3, 2, 1].map((n) => ({ n, date: `Fri, 06 Nov 2026 0${n}:00:00 GMT` })));
    s.time.advance(31 * 60_000);
    expect(await s.poller.poll(s.workspaceId, feed.id)).toEqual({ queued: 3 });
    s.time.advance(31 * 60_000);
    expect(await s.poller.poll(s.workspaceId, feed.id)).toEqual({ queued: 0 });
    expect(await s.found()).toHaveLength(4);
    expect((await s.items()).filter((item) => item.state === 'backlog')).toHaveLength(2);
  });

  it('skips an old article on a later check, and an account that needs reconnecting', async () => {
    const xml = { body: rss([{ n: 1, date: 'Thu, 05 Nov 2026 09:00:00 GMT' }]) };
    const s = await setup(xml);
    const good = await s.makeAccount('ok', 'Good');
    const broken = await s.makeAccount('broken', 'Broken');
    const feed = await s.addFeed([good.id, broken.id]);
    await s.poller.poll(s.workspaceId, feed.id);

    xml.body = rss([
      { n: 2, date: 'Fri, 06 Nov 2026 08:00:00 GMT' },
      { n: 1, date: 'Thu, 05 Nov 2026 09:00:00 GMT' },
      { n: 9, date: 'Sun, 01 Mar 2026 09:00:00 GMT' },
    ]);
    s.time.advance(31 * 60_000);
    expect(await s.poller.poll(s.workspaceId, feed.id)).toEqual({ queued: 1 });
    const old = (await s.items()).find((item) => item.title === 'Article 9');
    expect(old?.state).toBe('backlog');
    const accounts = (await s.found()).map((event) => event.payload.accountId);
    expect(new Set(accounts)).toEqual(new Set([good.id]));
  });

  it('a paused feed is left alone, and only active feeds that are due are listed', async () => {
    const s = await setup({ body: rss([{ n: 1, date: 'Thu, 05 Nov 2026 09:00:00 GMT' }]) });
    const account = await s.makeAccount('ok', 'Page');
    const paused = await s.addFeed([account.id], 'paused');
    const active = await s.addFeed([account.id], 'active', `${URL_OF_FEED}?second`);

    expect(await s.poller.poll(s.workspaceId, paused.id)).toBe('skipped');
    const due = (await s.poller.due(500)).filter((feed) => feed.workspaceId === s.workspaceId);
    expect(due.map((feed) => feed.id)).toEqual([active.id]);
    expect(await s.found()).toHaveLength(0);
  });

  it('refuses a page that is not a feed, in words a person can act on', async () => {
    const s = await setup({ body: '<html><body>Hello</body></html>' });
    await expect(s.poller.preview(URL_OF_FEED)).rejects.toThrow(/feed/);
  });
});
