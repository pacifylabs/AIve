import {
  ActivityEvent,
  asSystem,
  ConnectedAccount,
  ContentFeed,
  type DataSource,
  DomainEvent,
  type EntityManager,
  FeedItem,
  In,
  withTenant,
} from '@ai-staff/db';
import { XMLParser } from 'fast-xml-parser';
import { v7 as uuidv7 } from 'uuid';
import { safeFetchFeed } from '../fetch/safe-fetch.js';

/** One article as a feed describes it, cleaned up. */
export interface FeedArticle {
  guid: string;
  title: string;
  link: string;
  /** Plain text, cut short. What the feed says is material to write from, never instructions. */
  summary: string;
  publishedAt: Date | null;
}

export interface ParsedFeed {
  title: string | null;
  articles: FeedArticle[];
}

/** The address is not a readable feed, or could not be read. The message is for the person who added it. */
export class FeedError extends Error {}

const MAX_ARTICLES = 20;
const SUMMARY_CHARS = 1200;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Entities in a feed are the feed's own text; nothing in it is fetched or expanded into other files.
  processEntities: true,
  trimValues: true,
});

const list = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** The text of a node that may be a plain string, a number, or an object with attributes. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) return text((value as Record<string, unknown>)['#text']);
  return '';
}

/** Markup removed and entities decoded, so a model and a person read the same words. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function webLink(value: unknown): string | null {
  const raw = text(value).trim();
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

type AtomLink = string | { [key: string]: unknown };

/** An Atom entry has several <link> elements; the article is the one that is not a feed, comments page or file. */
function atomLink(links: unknown): string | null {
  const all: AtomLink[] = Array.isArray(links) ? (links as AtomLink[]) : links === undefined ? [] : [links as AtomLink];
  const rel = (link: AtomLink) => (typeof link === 'string' ? undefined : link['@_rel']);
  const chosen = all.find((link) => rel(link) === undefined || rel(link) === 'alternate') ?? all[0];
  if (chosen === undefined) return null;
  return typeof chosen === 'string' ? webLink(chosen) : webLink(chosen['@_href']);
}

const date = (value: unknown): Date | null => {
  const raw = text(value);
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

/** Reads RSS 2.0, Atom and RSS 1.0 (RDF). Items with no usable web link are dropped. */
export function parseFeed(xml: string): ParsedFeed {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new FeedError('That address did not give a readable feed.');
  }
  const rss = doc.rss as { channel?: Record<string, unknown> } | undefined;
  const atom = doc.feed as Record<string, unknown> | undefined;
  const rdf = doc['rdf:RDF'] as Record<string, unknown> | undefined;

  let title: string | null = null;
  const articles: FeedArticle[] = [];
  const add = (article: Omit<FeedArticle, 'guid'> & { guid?: string }) => {
    const guid = (article.guid?.trim() || article.link).slice(0, 1000);
    if (!article.title) return;
    articles.push({ ...article, guid, title: article.title.slice(0, 500) });
  };

  if (rss?.channel) {
    const channel = rss.channel;
    title = text(channel.title) || null;
    for (const item of list(channel.item as Record<string, unknown> | Record<string, unknown>[])) {
      const link = webLink(item.link) ?? webLink(item.guid);
      if (!link) continue;
      add({
        guid: text(item.guid),
        title: stripHtml(text(item.title)),
        link,
        summary: stripHtml(text(item['content:encoded']) || text(item.description)).slice(0, SUMMARY_CHARS),
        publishedAt: date(item.pubDate ?? item['dc:date']),
      });
    }
  } else if (atom) {
    title = text(atom.title) || null;
    for (const entry of list(atom.entry as Record<string, unknown> | Record<string, unknown>[])) {
      const link = atomLink(entry.link);
      if (!link) continue;
      add({
        guid: text(entry.id),
        title: stripHtml(text(entry.title)),
        link,
        summary: stripHtml(text(entry.summary) || text(entry.content)).slice(0, SUMMARY_CHARS),
        publishedAt: date(entry.published ?? entry.updated),
      });
    }
  } else if (rdf) {
    title = text((rdf.channel as Record<string, unknown> | undefined)?.title) || null;
    for (const item of list(rdf.item as Record<string, unknown> | Record<string, unknown>[])) {
      const link = webLink(item.link);
      if (!link) continue;
      add({
        title: stripHtml(text(item.title)),
        link,
        summary: stripHtml(text(item.description)).slice(0, SUMMARY_CHARS),
        publishedAt: date(item['dc:date']),
      });
    }
  } else {
    throw new FeedError(
      'That address is a web page, not a feed. Use the feed address, usually ending in /feed or /rss.',
    );
  }
  // Newest first, whatever order the feed used.
  articles.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return { title: title ? stripHtml(title).slice(0, 300) : null, articles: articles.slice(0, MAX_ARTICLES) };
}

export interface FeedPollerOptions {
  /** Replaced in tests so no network is touched. */
  fetcher?: typeof fetch;
  now?: () => Date;
}

const CHECK_EVERY_MS = 30 * 60_000;
/** After this many failed checks in a row the feed stops being tried until a person looks at it. */
const MAX_FAILURES = 5;
/** One check drafts for at most this many new articles. A feed that dumps a month of posts does not flood the inbox. */
const MAX_DRAFTED_PER_CHECK = 3;
/** An article older than this when first seen is background, not news. */
const STALE_AFTER_MS = 14 * 86_400_000;

export const ARTICLE_FOUND = 'content.article_found';

/**
 * Reads the feeds people added. Articles are stored once per feed, and each new one is handed to the staff member as an
 * event for every account the feed posts to; the staff member writes the draft and a person approves it. Articles that
 * were already on the feed when it was added are noted and left alone, apart from the newest, so the first check gives
 * the person something to look at without drafting the whole archive.
 */
export class FeedPoller {
  private readonly now: () => Date;
  private readonly fetcher: typeof fetch | undefined;

  constructor(
    private readonly db: DataSource,
    options: FeedPollerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.fetcher = options.fetcher;
  }

  /** Reads a feed without saving anything, so an address is checked before it is added. */
  async preview(url: string): Promise<ParsedFeed> {
    return this.read(url);
  }

  private async read(url: string): Promise<ParsedFeed> {
    let body: string;
    try {
      body = (await safeFetchFeed(url, this.fetcher)).text;
    } catch (error) {
      throw new FeedError(error instanceof Error ? error.message.slice(0, 300) : 'The feed could not be read.');
    }
    return parseFeed(body);
  }

  /** Active feeds whose next check has come. */
  async due(limit = 50): Promise<{ id: string; workspaceId: string }[]> {
    return asSystem(this.db, 'feeds: list feeds that are due to be read', async (m) => {
      const rows = (await m.query(
        `SELECT id, workspace_id FROM content_feeds WHERE state = 'active' AND next_check_at <= $1
          ORDER BY next_check_at LIMIT $2`,
        [this.now(), limit],
      )) as { id: string; workspace_id: string }[];
      return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id }));
    });
  }

  /** Reads one feed and queues drafts for what is new. Returns how many articles were handed to the staff member. */
  async poll(workspaceId: string, feedId: string): Promise<{ queued: number } | 'skipped'> {
    const feed = await withTenant(this.db, { workspaceId, userId: null }, (m) =>
      m.findOneBy(ContentFeed, { workspaceId, id: feedId }),
    );
    if (!feed || feed.state === 'paused') return 'skipped';

    let parsed: ParsedFeed;
    try {
      parsed = await this.read(feed.url);
    } catch (error) {
      await this.recordFailure(
        workspaceId,
        feed,
        error instanceof Error ? error.message : 'The feed could not be read.',
      );
      return { queued: 0 };
    }
    return withTenant(this.db, { workspaceId, userId: null }, (m) => this.save(m, feed, parsed));
  }

  private async save(m: EntityManager, feed: ContentFeed, parsed: ParsedFeed): Promise<{ queued: number }> {
    const now = this.now();
    const firstCheck = feed.lastCheckedAt === null;
    const existing = new Set(
      (await m.find(FeedItem, { where: { feedId: feed.id }, select: { guid: true } })).map((item) => item.guid),
    );
    const fresh = parsed.articles.filter((article) => !existing.has(article.guid));

    // Which of the new ones are drafted: on the first check only the newest, afterwards up to a few recent ones.
    const draftable = fresh.filter(
      (article) => !article.publishedAt || now.getTime() - article.publishedAt.getTime() < STALE_AFTER_MS || firstCheck,
    );
    const toDraft = new Set(draftable.slice(0, firstCheck ? 1 : MAX_DRAFTED_PER_CHECK).map((article) => article.guid));

    // Only accounts that still exist and work are drafted for.
    const accounts = feed.accountIds.length
      ? await m.find(ConnectedAccount, { where: { workspaceId: feed.workspaceId, id: In(feed.accountIds) } })
      : [];
    const usable = accounts.filter((account) => account.health !== 'broken');

    let queued = 0;
    for (const article of fresh) {
      const state = toDraft.has(article.guid) ? 'queued' : 'backlog';
      const id = uuidv7();
      const inserted = (await m.query(
        `INSERT INTO feed_items (id, workspace_id, feed_id, guid, title, link, summary, published_at, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (feed_id, guid) DO NOTHING RETURNING id`,
        [
          id,
          feed.workspaceId,
          feed.id,
          article.guid,
          article.title,
          article.link,
          article.summary || null,
          article.publishedAt,
          state,
        ],
      )) as { id: string }[];
      if (!inserted.length || state === 'backlog') continue;
      for (const account of usable) {
        await m.save(
          m.create(DomainEvent, {
            workspaceId: feed.workspaceId,
            type: ARTICLE_FOUND,
            // `staffId` sends the event to this staff member only.
            payload: {
              staffId: feed.staffId,
              feedItemId: id,
              accountId: account.id,
              network: account.network,
              handle: account.username,
            },
            sourceRunId: null,
            dispatchedAt: null,
          }),
        );
        queued += 1;
      }
    }

    await m.save(
      Object.assign(feed, {
        title: feed.title ?? parsed.title,
        state: 'active' as const,
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + CHECK_EVERY_MS),
        failures: 0,
        lastError: null,
      }),
    );
    return { queued };
  }

  /** A check that failed backs off, and after five in a row the feed stops and the person is told why. */
  private async recordFailure(workspaceId: string, feed: ContentFeed, message: string) {
    const now = this.now();
    const failures = feed.failures + 1;
    const stop = failures >= MAX_FAILURES;
    await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      await m.save(
        Object.assign(feed, {
          failures,
          lastError: message.slice(0, 400),
          lastCheckedAt: now,
          nextCheckAt: new Date(now.getTime() + Math.min(CHECK_EVERY_MS * 2 ** failures, 12 * 3_600_000)),
          state: stop ? ('error' as const) : feed.state,
        }),
      );
      if (stop) {
        await m.save(
          m.create(ActivityEvent, {
            workspaceId,
            staffId: feed.staffId,
            actor: 'system',
            type: 'feed.stopped',
            summary: `The feed ${feed.title ?? feed.url} stopped working: ${message}`.slice(0, 300),
            detail: { feedId: feed.id },
            costUsd: null,
          }),
        );
      }
    });
  }
}
