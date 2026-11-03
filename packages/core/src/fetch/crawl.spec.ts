import { lookup } from 'node:dns/promises';
import { describe, expect, it, vi } from 'vitest';
import { crawlSite } from './crawl.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

const html = (title: string, body: string) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function site(pages: Record<string, string>): typeof fetch {
  return (async (input: string | URL) => {
    const url = new URL(String(input));
    const page = pages[url.toString()];
    if (!page) return new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } });
    return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
}

describe('crawlSite', () => {
  it('reads the start page and same-host pages, useful paths first, up to the limit', async () => {
    const fetcher = site({
      'https://northfield.studio/': html(
        'Home',
        '<a href="/blog/post">Blog</a><a href="https://other.example/x">Other</a><a href="/pricing">Pricing</a><a href="/about">About</a><a href="/logo.png">Logo</a>',
      ),
      'https://northfield.studio/pricing': html('Pricing', 'Starter $1,200'),
      'https://northfield.studio/about': html('About', 'We onboard clients'),
      'https://northfield.studio/blog/post': html('Blog', 'A post'),
    });
    const pages = await crawlSite('https://northfield.studio/', { maxPages: 3, fetcher });
    expect(pages.map((page) => page.title)).toEqual(['Home', 'Pricing', 'About']);
  });

  it('skips pages that fail and never leaves the host', async () => {
    const fetcher = site({
      'https://northfield.studio/': html(
        'Home',
        '<a href="/about">About</a><a href="https://other.example/">Other</a>',
      ),
    });
    const pages = await crawlSite('https://northfield.studio/', { maxPages: 5, fetcher });
    expect(pages.map((page) => page.url)).toEqual(['https://northfield.studio/']);
  });

  it('fails when the start page cannot be read', async () => {
    await expect(crawlSite('https://northfield.studio/', { fetcher: site({}) })).rejects.toThrow();
  });
});
