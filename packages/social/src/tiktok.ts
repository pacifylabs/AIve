import {
  type AuthUrlInput,
  callApi,
  type CheckPublishInput,
  type CheckPublishResult,
  type ExchangeCodeInput,
  form,
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

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
}

const API = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'video.publish'];

/** TikTok answers 200 or an error with this shape. `ok` is success. */
interface Envelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

/** What TikTok's error codes mean to the person who has to fix them. */
const EXPLAINED: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    'TikTok has not approved this app yet, so it can only post to a private TikTok account. Make the account private, or finish the app audit.',
  url_ownership_unverified:
    'TikTok only fetches videos from a web address you have verified in your TikTok app. Verify the address the videos are stored at.',
  spam_risk_too_many_posts: 'TikTok says this account has posted too much today. Try again tomorrow.',
};

/**
 * TikTok, through the Content Posting API (direct post of a video fetched from a web address). Written from TikTok's
 * documentation (get started, direct post, post status, user access tokens; read 2026-11-06). Not yet run against a real
 * account, and two TikTok rules shape it:
 * - A video is pulled from a web address that must belong to a domain verified in the TikTok app.
 * - Until TikTok audits the app, it can only post to a private account, so a post is visible to the account's owner only.
 * TikTok takes videos only; a post with words alone is refused with a clear message. The video is fetched in the
 * background, so a post is handed back as a ticket and `checkPublish` waits for TikTok to finish.
 */
export class TikTokProvider implements SocialProvider {
  readonly network = 'tiktok' as const;
  readonly label = 'TikTok account';
  readonly supportsNativeScheduling = false;
  readonly usesPkce = false;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly config: TikTokConfig,
    options: { fetcher?: typeof fetch } = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
  }

  isConfigured() {
    return Boolean(this.config.clientKey && this.config.clientSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ProviderError(
        'TikTok is not set up yet. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.',
        this.network,
      );
    }
  }

  /** Calls TikTok and unwraps its envelope, turning a refusal into a message a person can act on. */
  private async call<T>(path: string, accessToken: string, body?: object, method = 'POST'): Promise<T> {
    let envelope: Envelope<T>;
    try {
      envelope = await callApi<Envelope<T>>(
        this.network,
        `${API}/${path}`,
        {
          method,
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
          body: body ? JSON.stringify(body) : undefined,
        },
        this.fetcher,
      );
    } catch (error) {
      throw this.explain(error);
    }
    if (envelope.error?.code && envelope.error.code !== 'ok') {
      throw this.explain(
        new ProviderError(
          envelope.error.message || envelope.error.code,
          this.network,
          'other',
          undefined,
          false,
          envelope.error.code,
        ),
      );
    }
    return envelope.data as T;
  }

  private explain(error: unknown): unknown {
    if (!(error instanceof ProviderError)) return error;
    const code = error.code ?? '';
    const known = EXPLAINED[code];
    if (known) return new ProviderError(known, this.network, error.kind, error.status);
    if (code === 'access_token_invalid' || code === 'scope_not_authorized') {
      return new ProviderError('TikTok needs this account connected again.', this.network, 'auth', error.status);
    }
    return error;
  }

  getAuthUrl({ redirectUri, state }: AuthUrlInput) {
    this.assertConfigured();
    const query = form({
      client_key: this.config.clientKey,
      scope: SCOPES.join(','),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${query}`;
  }

  private async token(fields: Record<string, string>): Promise<ProviderTokens> {
    const response = await callApi<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(
      this.network,
      `${API}/oauth/token/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
        body: form({ client_key: this.config.clientKey, client_secret: this.config.clientSecret, ...fields }),
      },
      this.fetcher,
    );
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? null,
      // An access token lasts a day; the refresh token behind it lasts a year and is replaced at each refresh.
      expiresInSeconds: response.expires_in ?? 86_400,
      scopes: response.scope?.split(',') ?? SCOPES,
    };
  }

  async exchangeCode({ code, redirectUri }: ExchangeCodeInput): Promise<ProviderTokens> {
    this.assertConfigured();
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  async refreshToken(refreshToken: string): Promise<ProviderTokens> {
    this.assertConfigured();
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** One login is one TikTok account. */
  async listAccounts(tokens: ProviderTokens): Promise<ProviderAccount[]> {
    this.assertConfigured();
    const info = await this.call<{ user?: { open_id: string; display_name?: string; avatar_url?: string } }>(
      'user/info/?fields=open_id,display_name,avatar_url',
      tokens.accessToken,
      undefined,
      'GET',
    );
    const user = info.user;
    if (!user?.open_id) throw new ProviderError('TikTok did not say which account this is.', this.network);
    return [
      {
        externalId: user.open_id,
        name: user.display_name ?? user.open_id,
        username: null,
        avatarUrl: user.avatar_url ?? null,
        kind: 'profile',
      },
    ];
  }

  schedulePost(): Promise<PublishResult> {
    return Promise.reject(
      new ProviderError('TikTok does not hold scheduled posts; we publish it at the time instead.', this.network),
    );
  }

  async publishPost(input: PublishInput): Promise<PublishResult | PendingPublishResult> {
    this.assertConfigured();
    const [video, ...rest] = input.mediaUrls;
    if (!video || mediaKindOf(video) !== 'video') {
      throw new ProviderError('TikTok takes videos only. Add a video to this post.', this.network);
    }
    if (rest.length) throw new ProviderError('TikTok takes one video in a post.', this.network);

    // The privacy choices an account may use are TikTok's to say. The most open one is used, which for an app TikTok has
    // not audited yet is private, and the person is told so when the post is up.
    const creator = await this.call<{ privacy_level_options?: string[] }>(
      'post/publish/creator_info/query/',
      input.accessToken,
    );
    const options = creator.privacy_level_options ?? [];
    const privacy = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : (options[0] ?? 'SELF_ONLY');

    const started = await this.call<{ publish_id: string }>('post/publish/video/init/', input.accessToken, {
      post_info: { title: input.body, privacy_level: privacy },
      source_info: { source: 'PULL_FROM_URL', video_url: video },
    });
    const notes = [
      privacy !== 'PUBLIC_TO_EVERYONE'
        ? 'TikTok has not approved this app for public posts yet, so only you can see it.'
        : null,
      input.linkUrl ? 'Links in a TikTok caption are not clickable, so the link was left out.' : null,
    ].filter((note): note is string => Boolean(note));
    return {
      pending: {
        ticket: started.publish_id,
        data: { note: notes.join(' ') || null },
        checkAfterSeconds: 20,
      },
    };
  }

  /** Looks at the post TikTok is fetching. It is never published a second time: this only asks how it is going. */
  async checkPublish(input: CheckPublishInput): Promise<CheckPublishResult> {
    const status = await this.call<{
      status?: string;
      fail_reason?: string;
      // TikTok's own spelling.
      publicaly_available_post_id?: (string | number)[];
    }>('post/publish/status/fetch/', input.accessToken, { publish_id: input.ticket });
    if (status.status === 'FAILED') {
      return {
        state: 'failed',
        message: `TikTok could not post the video${status.fail_reason ? `: ${status.fail_reason}` : '.'}`,
      };
    }
    if (status.status !== 'PUBLISH_COMPLETE') return { state: 'processing', checkAfterSeconds: 30 };
    const note = typeof input.data?.note === 'string' ? input.data.note : null;
    const publicId = status.publicaly_available_post_id?.[0];
    return {
      state: 'ready',
      // A private post has no public id yet, so the publish id stands in as its reference.
      result: { externalPostId: publicId ? String(publicId) : input.ticket, permalink: null, note },
    };
  }

  /** Numbers need the `video.list` permission, which this connection does not ask for yet. */
  fetchMetrics(_input: PostRef): Promise<Record<string, number>> {
    return Promise.resolve({});
  }
}
