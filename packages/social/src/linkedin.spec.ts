import { describe, expect, it } from 'vitest';
import { escapeCommentary, LinkedInProvider } from './linkedin.js';

/** A fetch that answers from a script, with headers where a step needs them, and records every call. */
function scripted(...answers: ({ status?: number; body?: object; headers?: Record<string, string> } | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(
      new Response(next?.body ? JSON.stringify(next.body) : '', {
        status: next?.status ?? 200,
        headers: next?.headers,
      }),
    );
  }) as typeof fetch;
  return { fetcher, calls };
}
const config = { clientId: 'id1', clientSecret: 'secret1', pages: false, version: '202610' };
const login = { accessToken: 'AQ.tok', externalId: 'urn:li:person:abc' };
const headersOf = (call: { init: RequestInit | undefined }) => new Headers(call.init?.headers);
const bodyOf = (call: { init: RequestInit | undefined }) => JSON.parse(String(call.init?.body));

describe('escapeCommentary', () => {
  it('puts a backslash before every character LinkedIn reserves, so a bracket cannot cut a post off', () => {
    expect(escapeCommentary('Q3 results (up 40%) #growth [see] {x} <y> @me a|b *c* _d_ ~e\\f')).toBe(
      'Q3 results \\(up 40%\\) \\#growth \\[see\\] \\{x\\} \\<y\\> \\@me a\\|b \\*c\\* \\_d\\_ \\~e\\\\f',
    );
    expect(escapeCommentary('Plain words, 100% fine.')).toBe('Plain words, 100% fine.');
  });
});

describe('LinkedIn', () => {
  it('is not configured until it has its keys, and says so', () => {
    const bare = new LinkedInProvider({ ...config, clientId: '', clientSecret: '' });
    expect(bare.isConfigured()).toBe(false);
    expect(() => bare.getAuthUrl({ redirectUri: 'https://api.test/cb', state: 's' })).toThrow(/LINKEDIN_CLIENT_ID/);
    expect(bare.canRenewLogin).toBe(false);
  });

  it('asks only for member permissions, and for Page permissions only when switched on', () => {
    const member = new URL(
      new LinkedInProvider(config).getAuthUrl({ redirectUri: 'https://api.test/cb', state: 'st' }),
    );
    expect(member.origin + member.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(member.searchParams.get('scope')).toBe('openid profile w_member_social');
    expect(member.searchParams.get('state')).toBe('st');
    const pages = new URL(
      new LinkedInProvider({ ...config, pages: true }).getAuthUrl({ redirectUri: 'https://api.test/cb', state: 'st' }),
    );
    expect(pages.searchParams.get('scope')).toContain('w_organization_social');
    expect(pages.searchParams.get('scope')).toContain('rw_organization_admin');
  });

  it('trades the code for a login that lasts about sixty days', async () => {
    const { fetcher, calls } = scripted({
      body: { access_token: 'AQ.1', expires_in: 5_184_000, scope: 'openid,profile' },
    });
    const tokens = await new LinkedInProvider(config, { fetcher }).exchangeCode({
      code: 'c',
      redirectUri: 'https://api.test/cb',
    });
    expect(tokens).toMatchObject({ accessToken: 'AQ.1', refreshToken: null, expiresInSeconds: 5_184_000 });
    expect(calls[0]!.url).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    const sent = new URLSearchParams(String(calls[0]!.init?.body));
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('client_secret')).toBe('secret1');
  });

  it('keeps a refresh token when LinkedIn gives one, and says to connect again when there is nothing to renew with', async () => {
    const withRefresh = scripted({ body: { access_token: 'AQ.1', expires_in: 100, refresh_token: 'rt' } });
    expect(
      (
        await new LinkedInProvider(config, { fetcher: withRefresh.fetcher }).exchangeCode({
          code: 'c',
          redirectUri: 'x',
        })
      ).refreshToken,
    ).toBe('rt');
    const refused = scripted({ status: 400, body: { error: 'invalid_request' } });
    await expect(new LinkedInProvider(config, { fetcher: refused.fetcher }).refreshToken('AQ.old')).rejects.toThrow(
      /Connect it again/,
    );
  });

  it('lists the person’s own profile', async () => {
    const { fetcher, calls } = scripted({ body: { sub: 'abc', name: 'Ada Obi' } });
    const accounts = await new LinkedInProvider(config, { fetcher }).listAccounts({ accessToken: 'AQ.tok' });
    expect(accounts).toEqual([{ externalId: 'urn:li:person:abc', name: 'Ada Obi', username: null, kind: 'profile' }]);
    expect(calls[0]!.url).toBe('https://api.linkedin.com/v2/userinfo');
    expect(headersOf(calls[0]!).get('Authorization')).toBe('Bearer AQ.tok');
  });

  it('adds the Company Pages the person administers, with the versioned headers, and keeps the profile if Pages are refused', async () => {
    const { fetcher, calls } = scripted(
      { body: { sub: 'abc', name: 'Ada Obi' } },
      {
        body: {
          elements: [
            { organizationTarget: 'urn:li:organization:2414183' },
            { organizationTarget: 'urn:li:organization:2414183' },
          ],
        },
      },
      { body: { localizedName: 'Northfield Studio' } },
    );
    const accounts = await new LinkedInProvider({ ...config, pages: true }, { fetcher }).listAccounts({
      accessToken: 't',
    });
    expect(accounts.map((a) => [a.externalId, a.name, a.kind])).toEqual([
      ['urn:li:person:abc', 'Ada Obi', 'profile'],
      ['urn:li:organization:2414183', 'Northfield Studio', 'organization'],
    ]);
    expect(calls[1]!.url).toContain('/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED');
    expect(headersOf(calls[1]!).get('Linkedin-Version')).toBe('202610');
    expect(headersOf(calls[1]!).get('X-Restli-Protocol-Version')).toBe('2.0.0');

    const refused = scripted(
      { body: { sub: 'abc', name: 'Ada Obi' } },
      { status: 403, body: { message: 'Not enough permissions' } },
    );
    const only = await new LinkedInProvider({ ...config, pages: true }, { fetcher: refused.fetcher }).listAccounts({
      accessToken: 't',
    });
    expect(only).toHaveLength(1);
  });

  it('posts words with the link as plain text, escaped, and returns the post’s id and address', async () => {
    const { fetcher, calls } = scripted({ status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } });
    const result = await new LinkedInProvider(config, { fetcher }).publishPost({
      ...login,
      body: 'Our new guide (2026) is out #guide',
      linkUrl: 'https://northfield.test/a_b',
      mediaUrls: [],
    });
    expect(result).toEqual({
      externalPostId: 'urn:li:share:123',
      permalink: 'https://www.linkedin.com/feed/update/urn:li:share:123/',
    });
    expect(calls[0]!.url).toBe('https://api.linkedin.com/rest/posts');
    expect(bodyOf(calls[0]!)).toMatchObject({
      author: 'urn:li:person:abc',
      commentary: 'Our new guide \\(2026\\) is out \\#guide\n\nhttps://northfield.test/a\\_b',
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
      distribution: { feedDistribution: 'MAIN_FEED' },
    });
    expect(headersOf(calls[0]!).get('Linkedin-Version')).toBe('202610');
    expect(bodyOf(calls[0]!).content).toBeUndefined();
  });

  it('uploads one picture through LinkedIn’s own address, then attaches it to the post', async () => {
    const { fetcher, calls } = scripted(
      { body: { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', image: 'urn:li:image:C49' } } },
      { status: 201 },
      { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } },
    );
    const fetched: string[] = [];
    const provider = new LinkedInProvider(config, {
      fetcher,
      fetchMedia: (url) => {
        fetched.push(url);
        return Promise.resolve({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
      },
    });
    await provider.publishPost({ ...login, body: 'Look', mediaUrls: ['https://cdn.test/a.png'] });
    expect(fetched).toEqual(['https://cdn.test/a.png']);
    expect(calls[0]!.url).toBe('https://api.linkedin.com/rest/images?action=initializeUpload');
    expect(bodyOf(calls[0]!)).toEqual({ initializeUploadRequest: { owner: 'urn:li:person:abc' } });
    expect(calls[1]!.url).toBe('https://www.linkedin.com/dms-uploads/abc');
    expect(calls[1]!.init?.method).toBe('PUT');
    expect(bodyOf(calls[2]!).content).toEqual({ media: { id: 'urn:li:image:C49' } });
  });

  it('refuses what it cannot send yet, with a plain reason, before calling LinkedIn', async () => {
    const { fetcher, calls } = scripted();
    const provider = new LinkedInProvider(config, { fetcher });
    await expect(provider.publishPost({ ...login, body: 'x', mediaUrls: ['https://c.test/a.mp4'] })).rejects.toThrow(
      /Videos are not sent/,
    );
    await expect(
      provider.publishPost({ ...login, body: 'x', mediaUrls: ['https://c.test/1.png', 'https://c.test/2.png'] }),
    ).rejects.toThrow(/one picture/);
    await expect(provider.publishPost({ ...login, body: 'x', mediaUrls: ['https://c.test/1.png'] })).rejects.toThrow(
      /Pictures are not available/,
    );
    expect(calls).toHaveLength(0);
  });

  it('treats an expired login as a login problem, a limit as a wait, and a post never answered as unknown', async () => {
    const auth = scripted({ status: 401, body: { message: 'The token used in the request has expired', status: 401 } });
    await expect(
      new LinkedInProvider(config, { fetcher: auth.fetcher }).publishPost({ ...login, body: 'x', mediaUrls: [] }),
    ).rejects.toMatchObject({ kind: 'auth', status: 401 });
    const limited = scripted({ status: 429, body: { message: 'Too many requests' } });
    await expect(
      new LinkedInProvider(config, { fetcher: limited.fetcher }).publishPost({ ...login, body: 'x', mediaUrls: [] }),
    ).rejects.toMatchObject({ kind: 'rate_limit' });
    const dropped = scripted(new Error('socket hang up'));
    await expect(
      new LinkedInProvider(config, { fetcher: dropped.fetcher }).publishPost({ ...login, body: 'x', mediaUrls: [] }),
    ).rejects.toMatchObject({ unknownOutcome: true });
    const noId = scripted({ status: 201 });
    await expect(
      new LinkedInProvider(config, { fetcher: noId.fetcher }).publishPost({ ...login, body: 'x', mediaUrls: [] }),
    ).rejects.toMatchObject({ unknownOutcome: true });
  });

  it('finds a post made after a given time by its first words, for settling an unclear publish', async () => {
    const since = new Date('2026-11-07T10:00:00Z');
    const { fetcher } = scripted({
      body: {
        elements: [
          { id: 'urn:li:share:old', commentary: 'Our new guide', publishedAt: since.getTime() - 60_000 },
          { id: 'urn:li:share:1', commentary: 'Our new guide \\(2026\\) is out', publishedAt: since.getTime() + 5_000 },
        ],
      },
    });
    const found = await new LinkedInProvider(config, { fetcher }).findRecentPost({
      ...login,
      bodyStart: 'Our new guide (2026) is out',
      since,
    });
    expect(found?.externalPostId).toBe('urn:li:share:1');
  });

  it('reports likes and comments when LinkedIn allows it, and nothing when it does not', async () => {
    const ok = scripted({
      body: { likesSummary: { totalLikes: 12 }, commentsSummary: { aggregatedTotalComments: 3 } },
    });
    expect(
      await new LinkedInProvider(config, { fetcher: ok.fetcher }).fetchMetrics({
        ...login,
        externalPostId: 'urn:li:share:1',
      }),
    ).toEqual({ likes: 12, comments: 3 });
    const refused = scripted({ status: 403, body: { message: 'Not enough permissions' } });
    expect(
      await new LinkedInProvider(config, { fetcher: refused.fetcher }).fetchMetrics({ ...login, externalPostId: 'x' }),
    ).toEqual({});
  });
});
