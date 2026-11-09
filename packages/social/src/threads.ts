import {
  type AuthUrlInput,
  callApi,
  type CheckPublishInput,
  type CheckPublishResult,
  type CommentInput,
  type ExchangeCodeInput,
  form,
  type FoundPost,
  mediaKindOf,
  type PendingPublishResult,
  type PostRef,
  type ProviderAccount,
  ProviderError,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  type SocialProvider,
} from './provider.js';

/** Threads has its own app id and secret, shown under the Threads use case of a Meta app. */
export interface ThreadsConfig {
  appId: string;
  appSecret: string;
}

const GRAPH = 'https://graph.threads.com';
const VERSION = 'v1.0';
// threads_manage_insights is for the numbers on each post's report.
const SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_insights'];
const METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'];

/**
 * Threads, through Meta's Threads API. Written from Meta's documentation (posts, access tokens, long-lived tokens,
 * insights and troubleshooting pages, read 2026-11-06). Not yet run against a real account: until Meta approves the app
 * for `threads_content_publish` it posts only for the app's listed Threads testers.
 *
 * A post is a container made first and published second. The container is handed back as a ticket and published by
 * `checkPublish` once Threads says it is finished, so a picture or video that needs time is never waited for here.
 * Text with a link attaches the link as a card; a post with a picture or video cannot carry one, and says so.
 */
export class ThreadsProvider implements SocialProvider {
  readonly network = 'threads' as const;
  readonly label = 'Threads profile';
  readonly supportsNativeScheduling = false;
  readonly usesPkce = false;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly config: ThreadsConfig,
    options: { fetcher?: typeof fetch } = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
  }

  isConfigured() {
    return Boolean(this.config.appId && this.config.appSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ProviderError('Threads is not set up yet. Add THREADS_APP_ID and THREADS_APP_SECRET.', this.network);
    }
  }

  private call<T>(url: string, init?: RequestInit) {
    return callApi<T>(this.network, url, init, this.fetcher);
  }

  private url(path: string) {
    return `${GRAPH}/${VERSION}/${path}`;
  }

  getAuthUrl({ redirectUri, state }: AuthUrlInput) {
    this.assertConfigured();
    const query = form({
      client_id: this.config.appId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(','),
      response_type: 'code',
      state,
    });
    return `https://threads.com/oauth/authorize?${query}`;
  }

  async exchangeCode({ code, redirectUri }: ExchangeCodeInput): Promise<ProviderTokens> {
    this.assertConfigured();
    const short = await this.call<{ access_token: string }>(`${GRAPH}/oauth/access_token`, {
      method: 'POST',
      body: form({
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });
    // A short-lived token lasts an hour. Trade up at once for one that lasts 60 days.
    const query = form({
      grant_type: 'th_exchange_token',
      client_secret: this.config.appSecret,
      access_token: short.access_token,
    });
    const long = await this.call<{ access_token: string; expires_in?: number }>(`${GRAPH}/access_token?${query}`);
    return { accessToken: long.access_token, expiresInSeconds: long.expires_in ?? 60 * 24 * 3600, scopes: SCOPES };
  }

  /** Threads has no refresh token: an unexpired long-lived token, at least a day old, is traded for a new one. */
  async refreshToken(token: string): Promise<ProviderTokens> {
    this.assertConfigured();
    const query = form({ grant_type: 'th_refresh_token', access_token: token });
    const next = await this.call<{ access_token: string; expires_in?: number }>(
      `${GRAPH}/refresh_access_token?${query}`,
    );
    return { accessToken: next.access_token, expiresInSeconds: next.expires_in ?? 60 * 24 * 3600 };
  }

  /** One login is one profile. */
  async listAccounts(tokens: ProviderTokens): Promise<ProviderAccount[]> {
    this.assertConfigured();
    const me = await this.call<{ id: string; username?: string }>(
      this.url(`me?${form({ fields: 'id,username', access_token: tokens.accessToken })}`),
    );
    return [
      {
        externalId: me.id,
        name: me.username ? `@${me.username}` : me.id,
        username: me.username ?? null,
        kind: 'profile',
      },
    ];
  }

  schedulePost(): Promise<PublishResult> {
    return Promise.reject(
      new ProviderError('Threads does not hold scheduled posts; we publish it at the time instead.', this.network),
    );
  }

  async publishPost(input: PublishInput): Promise<PublishResult | PendingPublishResult> {
    this.assertConfigured();
    if (input.mediaUrls.length > 1) {
      throw new ProviderError('Threads posts here take one picture or one video; pick one.', this.network);
    }
    const [media] = input.mediaUrls;
    const kind = media ? mediaKindOf(media) : null;
    const fields: Record<string, string | undefined> = {
      access_token: input.accessToken,
      media_type: kind === 'video' ? 'VIDEO' : kind === 'image' ? 'IMAGE' : 'TEXT',
      text: input.body,
      image_url: kind === 'image' ? media : undefined,
      video_url: kind === 'video' ? media : undefined,
      link_attachment: !kind && input.linkUrl ? input.linkUrl : undefined,
    };
    const container = await this.call<{ id: string }>(this.url(`${input.externalId}/threads`), {
      method: 'POST',
      body: form(fields),
    });
    const note =
      kind && input.linkUrl
        ? 'Threads cannot show a link card on a post with a picture or video, so the link was left out.'
        : null;
    // Meta suggests about half a minute for a picture or video to be fetched; words alone are ready almost at once.
    return { pending: { ticket: container.id, data: { note }, checkAfterSeconds: kind ? 30 : 5 } };
  }

  /**
   * Looks at the container. Still working: wait. Finished: publish it. Failed or expired: nothing went up. If the publish
   * request is sent and never answered the post may be up, so that is reported as uncertain and is never repeated.
   */
  async checkPublish(input: CheckPublishInput): Promise<CheckPublishResult> {
    const status = await this.call<{ status?: string; error_message?: string }>(
      this.url(`${input.ticket}?${form({ fields: 'status,error_message', access_token: input.accessToken })}`),
    );
    if (status.status === 'ERROR' || status.status === 'EXPIRED') {
      return {
        state: 'failed',
        message: `Threads could not process the post${status.error_message ? `: ${status.error_message}` : '.'}`,
      };
    }
    if (status.status === 'PUBLISHED') {
      return { state: 'uncertain', message: 'Threads says this post is already published. Check the profile.' };
    }
    if (status.status !== 'FINISHED') return { state: 'processing', checkAfterSeconds: 30 };
    try {
      const published = await this.call<{ id: string }>(this.url(`${input.externalId}/threads_publish`), {
        method: 'POST',
        body: form({ access_token: input.accessToken, creation_id: input.ticket }),
      });
      let permalink: string | null = null;
      try {
        const details = await this.call<{ permalink?: string }>(
          this.url(`${published.id}?${form({ fields: 'permalink', access_token: input.accessToken })}`),
        );
        permalink = details.permalink ?? null;
      } catch {
        // The post is up; a missing link is not worth failing it for.
      }
      const note = typeof input.data?.note === 'string' ? input.data.note : null;
      return { state: 'ready', result: { externalPostId: published.id, permalink, note } };
    } catch (error) {
      if (error instanceof ProviderError && error.unknownOutcome) return { state: 'uncertain', message: error.message };
      throw error;
    }
  }

  /**
   * A reply on Threads is a post that names the one it answers: the container is made with `reply_to_id`, then published.
   * Used for a first comment and for each part of a chain. Not yet run against a real account.
   */
  async addComment({
    accessToken,
    externalId,
    externalPostId,
    message,
  }: CommentInput): Promise<{ externalPostId: string }> {
    this.assertConfigured();
    const container = await this.call<{ id: string }>(this.url(`${externalId}/threads`), {
      method: 'POST',
      body: form({ access_token: accessToken, media_type: 'TEXT', text: message, reply_to_id: externalPostId }),
    });
    const published = await this.call<{ id: string }>(this.url(`${externalId}/threads_publish`), {
      method: 'POST',
      body: form({ access_token: accessToken, creation_id: container.id }),
    });
    return { externalPostId: published.id };
  }

  /** Meta's profile insights, as a single total (`followers_count` takes no date range). */
  async fetchFollowers({ accessToken, externalId }: { accessToken: string; externalId: string }): Promise<number> {
    this.assertConfigured();
    const response = await this.call<{ data?: { total_value?: { value?: number } }[] }>(
      this.url(`${externalId}/threads_insights?${form({ metric: 'followers_count', access_token: accessToken })}`),
    );
    const value = response.data?.[0]?.total_value?.value;
    if (typeof value !== 'number') throw new ProviderError('The network did not give a follower count.', this.network);
    return value;
  }

  async findRecentPost(input: {
    accessToken: string;
    externalId: string;
    bodyStart: string;
    since: Date;
  }): Promise<FoundPost | null> {
    this.assertConfigured();
    const list = await this.call<{ data?: { id: string; text?: string; permalink?: string; timestamp?: string }[] }>(
      this.url(
        `${input.externalId}/threads?${form({
          fields: 'id,text,permalink,timestamp',
          since: input.since.toISOString().slice(0, 10),
          limit: '25',
          access_token: input.accessToken,
        })}`,
      ),
    );
    const wanted = input.bodyStart.trim().slice(0, 60);
    const hit = (list.data ?? []).find(
      (post) =>
        post.timestamp && new Date(post.timestamp) >= input.since && (post.text ?? '').trim().startsWith(wanted),
    );
    return hit
      ? { externalPostId: hit.id, permalink: hit.permalink ?? null, publishedAt: new Date(hit.timestamp!) }
      : null;
  }

  async fetchMetrics({ accessToken, externalPostId }: PostRef): Promise<Record<string, number>> {
    this.assertConfigured();
    const result: Record<string, number> = {};
    for (const metric of METRICS) {
      try {
        const response = await this.call<{
          data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[];
        }>(this.url(`${externalPostId}/insights?${form({ metric, access_token: accessToken })}`));
        for (const row of response.data ?? [])
          result[row.name] = Number(row.values?.[0]?.value ?? row.total_value?.value ?? 0);
      } catch {
        // `views` and `shares` are still in development on Threads, and a metric can be missing for one post.
      }
    }
    return result;
  }
}
