const API_URL = process.env.API_URL ?? 'http://localhost:3100';

/** Plain HTML, no scripts, light and dark. Nothing in it comes from the request: the token is never echoed. */
const page = (title: string, message: string, form = false, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui,sans-serif;max-width:28rem;margin:6rem auto;padding:0 1rem}button{font:inherit;padding:.5rem 1rem;border:0;border-radius:.4rem;background:#4f46e5;color:#fff;cursor:pointer}p{opacity:.8}</style></head><body><h1>${title}</h1><p>${message}</p>${form ? '<form method="post"><button type="submit">Unsubscribe me</button></form>' : ''}</body></html>`,
    {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    },
  );

/**
 * Nothing happens on a GET, so a mail scanner that opens the link unsubscribes nobody. The person confirms with the
 * button, which POSTs back here.
 */
export function GET() {
  return page('Unsubscribe', 'Stop all emails from this sender to this address?', true);
}

/**
 * RFC 8058 one-click unsubscribe: mail clients POST (with no session) to the link in the List-Unsubscribe header, and
 * the confirm button above does the same. Either way the token is handed on to the API.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await fetch(`${API_URL}/v1/unsubscribe/${encodeURIComponent(token)}`, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response) return page('Try again', 'We could not reach the server. Please try again in a moment.', true, 503);
  if (response.status === 429) return page('Try again later', 'Too many attempts. Please try again later.', false, 429);
  if (!response.ok)
    return page('That link is not valid', 'It may have expired or been copied incompletely.', false, 404);
  return page('You are unsubscribed', 'You will not get any more emails from this sender.');
}
