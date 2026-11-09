import {
  type AuthUrlInput,
  type ExchangeCodeInput,
  form,
  type FoundPost,
  mediaKindOf,
  type MediaFetcher,
  type PostRef,
  type ProviderAccount,
  ProviderError,
  type ProviderErrorKind,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  type SocialProvider,
} from './provider.js';

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  /** Also ask to post as Company Pages the person administers. LinkedIn must have approved the app for this first. */
  pages: boolean;
  /** The month of the versioned API, YYYYMM, sent as `Linkedin-Version`. */
  version: string;
}

const API = 'https://api.linkedin.com';
// Member posting and sign-in are self-serve products. Page posting and the pages list need the Community Management product.
const MEMBER_SCOPES = ['openid', 'profile', 'w_member_social'];
const PAGE_SCOPES = ['w_organization_social', 'rw_organization_admin', 'r_organization_social'];

/**
 * LinkedIn's post text format reserves these characters, and every one must be escaped with a backslash even when it is
 * only punctuation: an unescaped bracket or parenthesis cuts the post off at that point.
 */
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
export const escapeCommentary = (text: string): string => text.replace(RESERVED, (character) => `\\${character}`);

/**
 * LinkedIn, through the versioned REST APIs (Posts, Images, Organization Access Control). Written from LinkedIn's
 * documentation (Posts API, Images API, little text format, authorization code flow, organization access control; read
 * 2026-11-07). Not yet run against a real account. Shaped by what LinkedIn allows:
 * - A login lasts about 60 days and cannot be renewed in the background (only a few partners get refresh tokens), so
 *   the person connects again, and account health warns ahead of the date.
 * - One login is one person's profile, plus every Company Page they administer when `pages` is on and approved.
 * - Words, up to twenty pictures, or one MP4 video, and a link. The Posts API does not read a link's title for a card, so
 *   a link goes into the text as a plain, clickable address.
 * - Numbers on a post need permissions LinkedIn restricts, so they are read when allowed and left out when not.
 */
export class LinkedInProvider implements SocialProvider {
  readonly network = 'linkedin' as const;
  readonly label = 'LinkedIn profile or Page';
  readonly supportsNativeScheduling = false;
  readonly usesPkce = false;
  readonly canRenewLogin = false;
  private readonly fetcher: typeof fetch;
  private readonly fetchMedia: MediaFetcher | undefined;

  constructor(
    private readonly config: LinkedInConfig,
    options: { fetcher?: typeof fetch; fetchMedia?: MediaFetcher | undefined } = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.fetchMedia = options.fetchMedia;
  }

  isConfigured() {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ProviderError(
        'LinkedIn is not set up yet. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
        this.network,
      );
    }
  }

  /** One request. A failure is turned into words for the person, and a request never answered is marked as unknown. */
  private async send(
    url: string,
    init: RequestInit & { accessToken?: string; versioned?: boolean },
  ): Promise<{ status: number; headers: Headers; json: unknown }> {
    const { accessToken, versioned, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (versioned) {
      headers.set('Linkedin-Version', this.config.version);
      headers.set('X-Restli-Protocol-Version', '2.0.0');
    }
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.timeout(30_000), ...rest, headers });
    } catch (error) {
      throw new ProviderError(
        `Could not reach linkedin: ${(error as Error).message}`,
        this.network,
        'other',
        undefined,
        true,
      );
    }
    const text = await response.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    if (!response.ok) {
      const body = json as { message?: string; error_description?: string; error?: string };
      const kind: ProviderErrorKind =
        response.status === 401 ? 'auth' : response.status === 429 ? 'rate_limit' : 'other';
      throw new ProviderError(
        body.message ?? body.error_description ?? body.error ?? `linkedin returned ${response.status}.`,
        this.network,
        kind,
        response.status,
        response.status >= 500,
      );
    }
    return { status: response.status, headers: response.headers, json };
  }

  getAuthUrl({ redirectUri, state }: AuthUrlInput) {
    this.assertConfigured();
    const scopes = this.config.pages ? [...MEMBER_SCOPES, ...PAGE_SCOPES] : MEMBER_SCOPES;
    const query = form({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      state,
      scope: scopes.join(' '),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${query}`;
  }

  async exchangeCode({ code, redirectUri }: ExchangeCodeInput): Promise<ProviderTokens> {
    this.assertConfigured();
    const { json } = await this.send('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const token = json as { access_token: string; expires_in?: number; refresh_token?: string; scope?: string };
    return {
      accessToken: token.access_token,
      // Only partners LinkedIn has enabled get one. Without it the login ends in about 60 days.
      refreshToken: token.refresh_token ?? null,
      expiresInSeconds: token.expires_in ?? 60 * 86_400,
      scopes: token.scope?.split(/[ ,]/).filter(Boolean) ?? [],
    };
  }

  /** Renews with a refresh token where LinkedIn gave one. Otherwise there is nothing to renew with: connect again. */
  async refreshToken(token: string): Promise<ProviderTokens> {
    this.assertConfigured();
    try {
      const { json } = await this.send('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          grant_type: 'refresh_token',
          refresh_token: token,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      });
      const next = json as { access_token: string; expires_in?: number; refresh_token?: string };
      return {
        accessToken: next.access_token,
        refreshToken: next.refresh_token ?? token,
        expiresInSeconds: next.expires_in ?? 60 * 86_400,
      };
    } catch {
      throw new ProviderError(
        'LinkedIn logins last about 60 days and cannot be renewed in the background. Connect it again.',
        this.network,
        'other',
      );
    }
  }

  /** The person's own profile, and the Company Pages they administer when that was asked for and approved. */
  async listAccounts(tokens: ProviderTokens): Promise<ProviderAccount[]> {
    this.assertConfigured();
    const accounts: ProviderAccount[] = [];
    const me = await this.send(`${API}/v2/userinfo`, { accessToken: tokens.accessToken });
    const profile = me.json as { sub?: string; name?: string };
    if (profile.sub) {
      accounts.push({
        externalId: `urn:li:person:${profile.sub}`,
        name: profile.name ?? 'LinkedIn profile',
        username: null,
        kind: 'profile',
      });
    }
    if (this.config.pages) accounts.push(...(await this.pages(tokens.accessToken)));
    if (!accounts.length) throw new ProviderError('LinkedIn did not say which account this is.', this.network);
    return accounts;
  }

  private async pages(accessToken: string): Promise<ProviderAccount[]> {
    try {
      const acls = await this.send(
        `${API}/rest/organizationAcls?${form({ q: 'roleAssignee', role: 'ADMINISTRATOR', state: 'APPROVED', count: '50' })}`,
        { accessToken, versioned: true },
      );
      const urns = [
        ...new Set(
          ((acls.json as { elements?: { organizationTarget?: string }[] }).elements ?? [])
            .map((element) => element.organizationTarget)
            .filter((urn): urn is string => Boolean(urn)),
        ),
      ];
      const pages: ProviderAccount[] = [];
      for (const urn of urns) {
        let name = `LinkedIn Page ${urn.split(':').pop()}`;
        try {
          const org = await this.send(`${API}/rest/organizations/${urn.split(':').pop()}`, {
            accessToken,
            versioned: true,
          });
          name = (org.json as { localizedName?: string }).localizedName ?? name;
        } catch {
          // The Page is still ours to post to; its name is only for the list.
        }
        pages.push({ externalId: urn, name, username: null, kind: 'organization' });
      }
      return pages;
    } catch {
      // Pages were asked for but this login cannot list them (the app is not approved for them yet). The person's own
      // profile still connects, which is what they can use today.
      return [];
    }
  }

  schedulePost(): Promise<PublishResult> {
    return Promise.reject(
      new ProviderError(
        'LinkedIn does not hold scheduled posts here; we publish it at the time instead.',
        this.network,
      ),
    );
  }

  async publishPost(input: PublishInput): Promise<PublishResult> {
    this.assertConfigured();
    const videos = input.mediaUrls.filter((url) => mediaKindOf(url) === 'video');
    if (videos.length && input.mediaUrls.length > 1) {
      throw new ProviderError('LinkedIn takes one video, or up to twenty pictures, in a post, not both.', this.network);
    }
    if (input.mediaUrls.length > 20)
      throw new ProviderError('LinkedIn takes up to twenty pictures in a post.', this.network);
    let content: Record<string, unknown> | null = null;
    if (videos.length) {
      content = { media: { id: await this.uploadVideo(input, videos[0]!) } };
    } else if (input.mediaUrls.length === 1) {
      content = { media: { id: await this.uploadImage(input, input.mediaUrls[0]!) } };
    } else if (input.mediaUrls.length > 1) {
      const images: { id: string }[] = [];
      for (const url of input.mediaUrls) images.push({ id: await this.uploadImage(input, url) });
      content = { multiImage: { images } };
    }

    // The link goes in the text as a plain address: LinkedIn does not read a link's title for a card through the API.
    const text = input.linkUrl ? `${input.body}\n\n${input.linkUrl}` : input.body;
    const created = await this.send(`${API}/rest/posts`, {
      method: 'POST',
      accessToken: input.accessToken,
      versioned: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: input.externalId,
        commentary: escapeCommentary(text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(content ? { content } : {}),
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });
    const urn = created.headers.get('x-restli-id');
    if (!urn)
      throw new ProviderError(
        'LinkedIn accepted the post but did not say which one it is.',
        this.network,
        'other',
        201,
        true,
      );
    return { externalPostId: urn, permalink: `https://www.linkedin.com/feed/update/${urn}/` };
  }

  /**
   * Registers a video with its size, sends each byte range LinkedIn asks for to its own address (keeping the ETag each part
   * answers with), then finalizes with those tags in order. Returns the video's id for the post. MP4 only; LinkedIn takes
   * 75 KB to 500 MB. Written from LinkedIn's Videos API documentation; not yet run against a real account.
   */
  private async uploadVideo(input: PublishInput, url: string): Promise<string> {
    if (!this.fetchMedia) throw new ProviderError('Video is not available for LinkedIn on this server.', this.network);
    let file: { bytes: Uint8Array; contentType: string };
    try {
      file = await this.fetchMedia(url);
    } catch (error) {
      throw new ProviderError(`LinkedIn could not be sent that video: ${(error as Error).message}`, this.network);
    }
    if (file.contentType !== 'video/mp4') throw new ProviderError('LinkedIn takes MP4 video only.', this.network);
    const start = await this.send(`${API}/rest/videos?action=initializeUpload`, {
      method: 'POST',
      accessToken: input.accessToken,
      versioned: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: input.externalId,
          fileSizeBytes: file.bytes.length,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    });
    const { video, uploadToken, uploadInstructions } =
      (
        start.json as {
          value?: {
            video?: string;
            uploadToken?: string;
            uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[];
          };
        }
      ).value ?? {};
    if (!video || !uploadInstructions?.length)
      throw new ProviderError('LinkedIn did not accept the video.', this.network);
    const partIds: string[] = [];
    for (const part of uploadInstructions) {
      const sent = await this.send(part.uploadUrl, {
        method: 'PUT',
        accessToken: input.accessToken,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file.bytes.slice(part.firstByte, part.lastByte + 1) as unknown as RequestInit['body'],
      });
      const etag = sent.headers.get('etag');
      if (!etag) throw new ProviderError('LinkedIn did not confirm a part of the video.', this.network);
      partIds.push(etag);
    }
    await this.send(`${API}/rest/videos?action=finalizeUpload`, {
      method: 'POST',
      accessToken: input.accessToken,
      versioned: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finalizeUploadRequest: { video, uploadToken: uploadToken ?? '', uploadedPartIds: partIds },
      }),
    });
    return video;
  }

  /** Registers a picture, then sends its bytes to the address LinkedIn gives. Returns the picture's id for the post. */
  private async uploadImage(input: PublishInput, url: string): Promise<string> {
    if (!this.fetchMedia)
      throw new ProviderError('Pictures are not available for LinkedIn on this server.', this.network);
    let file: { bytes: Uint8Array; contentType: string };
    try {
      file = await this.fetchMedia(url);
    } catch (error) {
      throw new ProviderError(`LinkedIn could not be sent that picture: ${(error as Error).message}`, this.network);
    }
    const start = await this.send(`${API}/rest/images?action=initializeUpload`, {
      method: 'POST',
      accessToken: input.accessToken,
      versioned: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initializeUploadRequest: { owner: input.externalId } }),
    });
    const { uploadUrl, image } = (start.json as { value?: { uploadUrl?: string; image?: string } }).value ?? {};
    if (!uploadUrl || !image) throw new ProviderError('LinkedIn did not accept the picture.', this.network);
    await this.send(uploadUrl, {
      method: 'PUT',
      accessToken: input.accessToken,
      headers: { 'Content-Type': file.contentType },
      body: file.bytes as unknown as RequestInit['body'],
    });
    return image;
  }

  /**
   * Finds a post made just before a publish that was never answered, so it is not posted twice. Reading a person's
   * own posts is restricted by LinkedIn to approved apps, so where it is refused the person is asked instead.
   */
  async findRecentPost(input: {
    accessToken: string;
    externalId: string;
    bodyStart: string;
    since: Date;
  }): Promise<FoundPost | null> {
    this.assertConfigured();
    const list = await this.send(
      `${API}/rest/posts?${form({ author: input.externalId, q: 'author', count: '10', sortBy: 'LAST_MODIFIED' })}`,
      { accessToken: input.accessToken, versioned: true, headers: { 'X-RestLi-Method': 'FINDER' } },
    );
    const wanted = escapeCommentary(input.bodyStart.trim().slice(0, 60));
    const hit = (
      (list.json as { elements?: { id: string; commentary?: string; publishedAt?: number }[] }).elements ?? []
    ).find(
      (post) =>
        post.publishedAt && post.publishedAt >= input.since.getTime() && (post.commentary ?? '').startsWith(wanted),
    );
    return hit
      ? {
          externalPostId: hit.id,
          permalink: `https://www.linkedin.com/feed/update/${hit.id}/`,
          publishedAt: new Date(hit.publishedAt!),
        }
      : null;
  }

  /** Likes and comments, where LinkedIn lets the app read them. Anything it refuses is left out, not guessed. */
  async fetchMetrics({ accessToken, externalPostId }: PostRef): Promise<Record<string, number>> {
    this.assertConfigured();
    try {
      const actions = await this.send(`${API}/rest/socialActions/${encodeURIComponent(externalPostId)}`, {
        accessToken,
        versioned: true,
      });
      const body = actions.json as {
        likesSummary?: { totalLikes?: number };
        commentsSummary?: { aggregatedTotalComments?: number; totalFirstLevelComments?: number };
      };
      return {
        likes: body.likesSummary?.totalLikes ?? 0,
        comments: body.commentsSummary?.aggregatedTotalComments ?? body.commentsSummary?.totalFirstLevelComments ?? 0,
      };
    } catch {
      return {};
    }
  }
}
