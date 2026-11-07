import { request as requestHttp, type RequestOptions } from 'node:http';
import { request as requestHttps } from 'node:https';
import { Readable } from 'node:stream';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 300_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

/** Whether an address is somewhere a public web page has no business sending us: this machine, the local network, link-local, cloud metadata. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  return true;
}

export class UnsafeUrlError extends Error {}

/** Checks one address before it is fetched: web protocols only, no credentials in it, and the name must resolve to public addresses only. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('That is not a web address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new UnsafeUrlError('Only web addresses can be read.');
  if (url.username || url.password) throw new UnsafeUrlError('Addresses with a login in them are not read.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local'))
    throw new UnsafeUrlError('That address is not on the public internet.');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new UnsafeUrlError('That address could not be found.');
  if (addresses.some((entry) => isPrivateAddress(entry.address)))
    throw new UnsafeUrlError('That address is not on the public internet.');
  return url;
}

/** Validate the DNS answer used by the socket itself, rather than trusting an earlier lookup. */
const publicFetch = (async (input: string | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input));
  return new Promise((resolve, reject) => {
    const options: RequestOptions & { autoSelectFamily: boolean } = {
      method: 'GET',
      headers: init?.headers as Record<string, string>,
      signal: init?.signal ?? undefined,
      autoSelectFamily: false,
      lookup: (hostname, _options, callback) => {
        void lookup(hostname, { all: true })
          .then((addresses) => {
            const first = addresses[0];
            if (!first || addresses.some((entry) => isPrivateAddress(entry.address)))
              return callback(new UnsafeUrlError('That address is not on the public internet.'), '', 4);
            callback(null, first.address, first.family);
          })
          .catch((error) => callback(error, '', 4));
      },
    };
    const request = (url.protocol === 'https:' ? requestHttps : requestHttp)(url, options, (response) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers))
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const status = response.statusCode ?? 502;
      if (status < 200 || status > 599) {
        response.destroy();
        reject(new UnsafeUrlError('The page returned an invalid HTTP status.'));
        return;
      }
      const body = [204, 205, 304].includes(status) ? null : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
      if (!body) response.resume();
      resolve(new Response(body, { status, headers }));
    });
    request.on('error', reject);
    request.end();
  });
}) as typeof fetch;

interface FetchOptions {
  /** The Accept header, naming what is wanted. */
  accept: string;
  /** What the answer's content type must look like, or the body is refused. */
  contentType: RegExp;
  maxBytes: number;
  notTextMessage: string;
}

/**
 * Reads a public address. Every hop of a redirect is checked again, the answer is capped in size and time, and only the
 * expected kind of content comes back. What it says is data to weigh; it is never an instruction. `truncated` says the
 * cap was reached and the rest was dropped, which is fine for the start of a page and not for a picture.
 */
async function fetchPublic(
  raw: string,
  options: FetchOptions,
  fetcher: typeof fetch,
): Promise<{ url: string; bytes: Buffer; contentType: string; truncated: boolean }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicUrl(current);
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: options.accept, 'User-Agent': 'AIStaffResearch/1.0' },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) throw new UnsafeUrlError('That page redirected nowhere.');
      current = new URL(next, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`The page answered ${response.status}.`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!options.contentType.test(contentType)) throw new UnsafeUrlError(options.notTextMessage);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      chunks.push(value);
      if (total >= options.maxBytes) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
    return {
      url: url.toString(),
      bytes: Buffer.concat(chunks).subarray(0, options.maxBytes),
      contentType,
      truncated,
    };
  }
  throw new UnsafeUrlError('That page redirected too many times.');
}

async function fetchPublicText(
  raw: string,
  options: FetchOptions,
  fetcher: typeof fetch,
): Promise<{ url: string; text: string; contentType: string }> {
  const { url, bytes, contentType } = await fetchPublic(raw, options, fetcher);
  return { url, text: bytes.toString('utf8').slice(0, options.maxBytes), contentType };
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Reads a public picture (JPEG, PNG or GIF) for a network that has to be sent the file itself. Refuses one over 10 MB. */
export async function safeFetchImage(
  raw: string,
  fetcher: typeof fetch = publicFetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const { bytes, contentType, truncated } = await fetchPublic(
    raw,
    {
      accept: 'image/jpeg,image/png,image/gif',
      contentType: /^image\/(jpeg|jpg|png|gif)\b/i,
      maxBytes: MAX_IMAGE_BYTES,
      notTextMessage: 'That address is not a JPEG, PNG or GIF picture.',
    },
    fetcher,
  );
  if (truncated) throw new UnsafeUrlError('That picture is larger than 10 MB.');
  return { bytes: new Uint8Array(bytes), contentType: contentType.split(';')[0]!.trim() };
}

/** Reads a public web page as text. */
export function safeFetchText(
  raw: string,
  fetcher: typeof fetch = publicFetch,
): Promise<{ url: string; text: string; contentType: string }> {
  return fetchPublicText(
    raw,
    {
      accept: 'text/html,text/plain;q=0.9',
      contentType: /text\/|application\/xhtml/i,
      maxBytes: MAX_BYTES,
      notTextMessage: 'That is not a page of text.',
    },
    fetcher,
  );
}

/** Reads a public RSS or Atom feed. Feeds are bigger than a page's first screen, so the cap is higher. */
export function safeFetchFeed(
  raw: string,
  fetcher: typeof fetch = publicFetch,
): Promise<{ url: string; text: string; contentType: string }> {
  return fetchPublicText(
    raw,
    {
      accept: 'application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.9',
      contentType: /xml|rss|atom|text\/plain/i,
      maxBytes: 600_000,
      notTextMessage: 'That address is not a feed. Use the feed address, usually ending in /feed or /rss.',
    },
    fetcher,
  );
}

/** A page boiled down to what a person would read: title, description and the first run of text. */
export function summarisePage(html: string): { title: string | null; description: string | null; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  const description =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() ??
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1]?.trim() ??
    null;
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
  return { title: title?.slice(0, 300) ?? null, description: description?.slice(0, 400) ?? null, text };
}
