import { safeFetchText, summarisePage } from './safe-fetch.js';

export interface CrawledPage {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
}

/** Paths that usually describe what a business sells and to whom, read before anything else. */
const USEFUL_PATH =
  /\/(about|company|pricing|prices|plans|products?|services?|solutions|features|faq|contact|who-we-are)\b/i;
const SKIP_PATH =
  /\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|mp3|css|js|xml|json)$|\/(login|signin|sign-in|signup|cart|checkout|account|wp-admin|feed)\b/i;

function linksOn(html: string, base: URL): URL[] {
  const found: URL[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1]!, base);
      url.hash = '';
      url.search = '';
      found.push(url);
    } catch {
      // A malformed href is simply not followed.
    }
  }
  return found;
}

/**
 * Reads a company's own website: the start page, then up to `maxPages - 1` more pages on the same host, useful paths
 * first. Every page goes through safeFetchText, so redirects to other hosts or private addresses are refused. A page
 * that fails is skipped; the crawl only fails if the start page cannot be read.
 */
export async function crawlSite(
  start: string,
  options: { maxPages?: number; fetcher?: typeof fetch } = {},
): Promise<CrawledPage[]> {
  const maxPages = options.maxPages ?? 6;
  const first = await safeFetchText(start, options.fetcher);
  const home = new URL(first.url);
  const host = home.hostname.replace(/^www\./, '');
  const pages: CrawledPage[] = [{ url: first.url, ...summarisePage(first.text) }];

  const seen = new Set([home.toString()]);
  const queue = linksOn(first.text, home)
    .filter((url) => url.hostname.replace(/^www\./, '') === host && !SKIP_PATH.test(url.pathname))
    .filter((url) => {
      const key = url.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(USEFUL_PATH.test(b.pathname)) - Number(USEFUL_PATH.test(a.pathname)));

  for (const url of queue) {
    if (pages.length >= maxPages) break;
    try {
      const page = await safeFetchText(url.toString(), options.fetcher);
      // A redirect to another host means the page is not the company's own.
      if (new URL(page.url).hostname.replace(/^www\./, '') !== host) continue;
      pages.push({ url: page.url, ...summarisePage(page.text) });
    } catch {
      continue;
    }
  }
  return pages;
}
