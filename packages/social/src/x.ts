import {
  type AuthUrlInput,
  callApi,
  type CommentInput,
  type ExchangeCodeInput,
  form,
  type FoundPost,
  type PostRef,
  ProviderError,
  type ProviderAccount,
  type ProviderComment,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  type SocialProvider,
} from './provider.js';

export interface XConfig {
  clientId: string;
  clientSecret: string;
}

const API = 'https://api.x.com/2';
const AUTHORIZE = 'https://x.com/i/oauth2/authorize';
const TOKEN = 'https://api.x.com/2/oauth2/token';

/** `offline.access` is what makes the refresh token appear; without it a connection dies in two hours. */
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

/**
 * X, API v2. OAuth 2.0 with PKCE and rotating refresh tokens: every refresh returns a new refresh token and the old
 * one stops working, so the caller must always store what it gets back. Media upload is not implemented: a post that
 * carries a picture or video is refused for X rather than being sent without it. Ported from KudiBooks; the paid tier
 * that allows posting at our volume is a Milestone 0 decision.
 */
export class XProvider implements SocialProvider {
  readonly network = 'x' as const;
  readonly label = 'X account';
  readonly supportsNativeScheduling = false;
  readonly usesPkce = true;

  constructor(
    private readonly config: XConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  isConfigured() {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured())
      throw new ProviderError('X is not set up yet. Add X_CLIENT_ID and X_CLIENT_SECRET.', this.network);
  }

  private call<T>(url: string, init?: RequestInit) {
    return callApi<T>(this.network, url, init, this.fetcher);
  }

  private bearer(token: string, json = false): Record<string, string> {
    return { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }

  /** X authenticates the token call with HTTP Basic, not a body field. */
  private get basic() {
    return `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`;
  }

  getAuthUrl({ redirectUri, state, codeChallenge }: AuthUrlInput) {
    this.assertConfigured();
    if (!codeChallenge) throw new ProviderError('X needs a PKCE challenge to start a connection.', this.network);
    return `${AUTHORIZE}?${form({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })}`;
  }

  async exchangeCode({ code, redirectUri, codeVerifier }: ExchangeCodeInput): Promise<ProviderTokens> {
    this.assertConfigured();
    if (!codeVerifier) throw new ProviderError('This X connection has expired. Start it again.', this.network);
    const tokens = await this.call<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: this.basic },
      body: form({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: this.config.clientId,
      }),
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresInSeconds: tokens.expires_in ?? 7200,
      scopes: tokens.scope?.split(' ') ?? SCOPES,
    };
  }

  async refreshToken(refreshToken: string): Promise<ProviderTokens> {
    this.assertConfigured();
    const tokens = await this.call<{ access_token: string; refresh_token?: string; expires_in?: number }>(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: this.basic },
      body: form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: this.config.clientId }),
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? refreshToken,
      expiresInSeconds: tokens.expires_in ?? 7200,
    };
  }

  /** An X connection is one account: the person who authorised it. */
  async listAccounts(tokens: ProviderTokens): Promise<ProviderAccount[]> {
    this.assertConfigured();
    const me = await this.call<{
      data: {
        id: string;
        name: string;
        username: string;
        profile_image_url?: string;
        public_metrics?: { followers_count?: number };
      };
    }>(`${API}/users/me?user.fields=profile_image_url,public_metrics`, { headers: this.bearer(tokens.accessToken) });
    return [
      {
        externalId: me.data.id,
        name: me.data.name,
        username: me.data.username,
        avatarUrl: me.data.profile_image_url ?? null,
        kind: 'profile',
        accessToken: tokens.accessToken,
        metadata: { followers: me.data.public_metrics?.followers_count },
      },
    ];
  }

  async publishPost(input: PublishInput): Promise<PublishResult> {
    this.assertConfigured();
    if (input.mediaUrls.length) {
      throw new ProviderError(
        'Posts to X are words and a link only for now. Take the picture off, or leave X off this post.',
        this.network,
      );
    }
    const text = input.linkUrl ? `${input.body}\n${input.linkUrl}`.trim() : input.body;
    const posted = await this.call<{ data: { id: string } }>(`${API}/tweets`, {
      method: 'POST',
      headers: this.bearer(input.accessToken, true),
      body: JSON.stringify({ text }),
    });
    const username = (input.metadata?.username as string | undefined) ?? 'i';
    return { externalPostId: posted.data.id, permalink: `https://x.com/${username}/status/${posted.data.id}` };
  }

  schedulePost(): Promise<PublishResult> {
    throw new ProviderError('X does not hold scheduled posts; we publish it at the time instead.', this.network);
  }

  async findRecentPost(input: {
    accessToken: string;
    externalId: string;
    bodyStart: string;
    since: Date;
  }): Promise<FoundPost | null> {
    this.assertConfigured();
    const query = form({
      max_results: '10',
      'tweet.fields': 'created_at',
      start_time: input.since.toISOString(),
      exclude: 'replies,retweets',
    });
    const response = await this.call<{ data?: { id: string; text: string; created_at?: string }[] }>(
      `${API}/users/${input.externalId}/tweets?${query}`,
      { headers: this.bearer(input.accessToken) },
    );
    const wanted = input.bodyStart.trim().slice(0, 60);
    const hit = (response.data ?? []).find((tweet) => wanted && tweet.text.trim().startsWith(wanted));
    return hit
      ? {
          externalPostId: hit.id,
          permalink: `https://x.com/i/status/${hit.id}`,
          publishedAt: new Date(hit.created_at ?? Date.now()),
        }
      : null;
  }

  /** A "first comment" on X is a reply from the same account, which shows under the post. */
  async addComment({ accessToken, externalPostId, message }: CommentInput): Promise<{ externalPostId?: string }> {
    this.assertConfigured();
    const sent = await this.call<{ data?: { id?: string } }>(`${API}/tweets`, {
      method: 'POST',
      headers: this.bearer(accessToken, true),
      body: JSON.stringify({ text: message, reply: { in_reply_to_tweet_id: externalPostId } }),
    });
    return { externalPostId: sent.data?.id };
  }

  /**
   * Replies to a post, found through the conversation search. X only offers that search on some API plans; where the
   * account's plan does not include it the call is refused and the caller reports it rather than showing zero.
   */
  async fetchComments({
    accessToken,
    externalId,
    externalPostId,
    limit = 25,
  }: PostRef & { limit?: number }): Promise<ProviderComment[]> {
    this.assertConfigured();
    const query = form({
      query: `conversation_id:${externalPostId}`,
      max_results: String(Math.min(100, Math.max(10, limit))),
      'tweet.fields': 'created_at,author_id,conversation_id',
      expansions: 'author_id',
      'user.fields': 'name,username',
    });
    const response = await this.call<{
      data?: { id: string; text: string; created_at?: string; author_id?: string }[];
      includes?: { users?: { id: string; name?: string; username?: string }[] };
    }>(`${API}/tweets/search/recent?${query}`, { headers: this.bearer(accessToken) });
    const users = new Map((response.includes?.users ?? []).map((user) => [user.id, user]));
    return (
      (response.data ?? [])
        // The account's own replies are in the same conversation; they are not something to answer.
        .filter((tweet) => tweet.author_id !== externalId && tweet.id !== externalPostId)
        .map((tweet) => {
          const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
          return {
            externalId: tweet.id,
            authorName: author?.name ?? author?.username ?? null,
            message: tweet.text,
            receivedAt: new Date(tweet.created_at ?? Date.now()),
            permalink: author?.username ? `https://x.com/${author.username}/status/${tweet.id}` : null,
          };
        })
    );
  }

  /** `externalPostId` is the reply being answered; the answer is a reply to it from the account. */
  async replyToComment({ accessToken, externalId, externalPostId, message }: CommentInput): Promise<void> {
    await this.addComment({ accessToken, externalId, externalPostId, message });
  }

  async lookupAccount({
    accessToken,
    handle,
  }: {
    accessToken: string;
    handle: string;
  }): Promise<{ handle: string; name: string } | null> {
    this.assertConfigured();
    const found = await this.call<{ data?: { username?: string; name?: string } }>(
      `${API}/users/by/username/${encodeURIComponent(handle)}?user.fields=name`,
      { headers: this.bearer(accessToken) },
    );
    return found.data?.username ? { handle: found.data.username, name: found.data.name ?? found.data.username } : null;
  }

  async fetchFollowers({ accessToken }: { accessToken: string }): Promise<number> {
    this.assertConfigured();
    const response = await this.call<{ data?: { public_metrics?: { followers_count?: number } } }>(
      `${API}/users/me?user.fields=public_metrics`,
      { headers: this.bearer(accessToken) },
    );
    const value = response.data?.public_metrics?.followers_count;
    if (typeof value !== 'number') throw new ProviderError('The network did not give a follower count.', this.network);
    return value;
  }

  async fetchMetrics({ accessToken, externalPostId }: PostRef): Promise<Record<string, number>> {
    this.assertConfigured();
    const response = await this.call<{ data?: { public_metrics?: Record<string, number> } }>(
      `${API}/tweets/${externalPostId}?tweet.fields=public_metrics`,
      { headers: this.bearer(accessToken) },
    );
    return response.data?.public_metrics ?? {};
  }
}
