import {
  type AuthUrlInput,
  callApi,
  type CommentInput,
  type ExchangeCodeInput,
  form,
  type FoundPost,
  mediaKindOf,
  type MessageReplyInput,
  type PostRef,
  ProviderError,
  type ProviderAccount,
  type ProviderComment,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  sleep,
  type SocialProvider,
} from './provider.js';

export interface MetaConfig {
  appId: string;
  appSecret: string;
  /** Pinned so a Graph API change cannot break posting unannounced. Confirm against Meta's current changelog when upgrading. */
  graphVersion: string;
  /** Messages need an approved app and a webhook; until then none of it is switched on. */
  messaging: boolean;
}

export interface MetaOptions {
  fetcher?: typeof fetch;
  /** Replaced in tests so polling a video container does not wait for real. */
  sleep?: (ms: number) => Promise<void>;
}

const GRAPH = 'https://graph.facebook.com';
const PAGE_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'];
const FACEBOOK_MESSAGING_SCOPES = ['pages_messaging'];
const INSTAGRAM_MESSAGING_SCOPES = ['instagram_manage_messages', 'pages_messaging'];
// Discover the linked Page without requesting permission to publish Facebook posts.
const INSTAGRAM_SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'];

interface MetaComment {
  id: string;
  message?: string;
  text?: string;
  created_time?: string;
  timestamp?: string;
  permalink_url?: string;
  username?: string;
  from?: { name?: string };
}

interface GraphPage {
  id: string;
  name: string;
  access_token?: string;
  category?: string;
  picture?: { data?: { url?: string } };
  followers_count?: number;
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
    followers_count?: number;
  };
}

/**
 * Facebook Pages and Instagram business accounts, both through the Graph API and both behind one Meta app. They share
 * a login, a token exchange and an account list, and differ only at the moment of publishing, so they share a class.
 * Ported from KudiBooks. Permission names and endpoints are to be re-confirmed during Meta app review (Milestone 0).
 */
export class MetaProvider implements SocialProvider {
  readonly supportsNativeScheduling: boolean;
  readonly usesPkce = false;
  private readonly fetcher: typeof fetch;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(
    readonly network: 'facebook' | 'instagram',
    private readonly config: MetaConfig,
    options: MetaOptions = {},
  ) {
    this.supportsNativeScheduling = network === 'facebook';
    this.fetcher = options.fetcher ?? fetch;
    this.wait = options.sleep ?? sleep;
  }

  get label() {
    return this.network === 'facebook' ? 'Facebook Page' : 'Instagram business account';
  }

  isConfigured() {
    return Boolean(this.config.appId && this.config.appSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ProviderError(
        'Facebook and Instagram are not set up yet. Add META_APP_ID and META_APP_SECRET.',
        this.network,
        'other',
      );
    }
  }

  private url(path: string) {
    return `${GRAPH}/${this.config.graphVersion}/${path}`;
  }

  private call<T>(url: string, init?: RequestInit) {
    return callApi<T>(this.network, url, init, this.fetcher);
  }

  getAuthUrl({ redirectUri, state }: AuthUrlInput) {
    this.assertConfigured();
    const base = this.network === 'instagram' ? INSTAGRAM_SCOPES : PAGE_SCOPES;
    const scopes = this.config.messaging
      ? [...base, ...(this.network === 'instagram' ? INSTAGRAM_MESSAGING_SCOPES : FACEBOOK_MESSAGING_SCOPES)]
      : base;
    const query = form({
      client_id: this.config.appId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: scopes.join(','),
    });
    return `https://www.facebook.com/${this.config.graphVersion}/dialog/oauth?${query}`;
  }

  async exchangeCode({ code, redirectUri }: ExchangeCodeInput): Promise<ProviderTokens> {
    this.assertConfigured();
    const query = form({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const short = await this.call<{ access_token: string }>(
      `${GRAPH}/${this.config.graphVersion}/oauth/access_token?${query}`,
    );
    // Short-lived tokens die in an hour. Trade up immediately so a connection survives the week.
    return this.exchangeForLongLived(short.access_token);
  }

  private async exchangeForLongLived(accessToken: string): Promise<ProviderTokens> {
    const query = form({
      grant_type: 'fb_exchange_token',
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: accessToken,
    });
    const long = await this.call<{ access_token: string; expires_in?: number }>(
      `${GRAPH}/${this.config.graphVersion}/oauth/access_token?${query}`,
    );
    return { accessToken: long.access_token, expiresInSeconds: long.expires_in ?? 60 * 60 * 24 * 60 };
  }

  /** Meta has no refresh token: a long-lived token is traded for another long-lived one. */
  async refreshToken(refreshToken: string): Promise<ProviderTokens> {
    this.assertConfigured();
    return this.exchangeForLongLived(refreshToken);
  }

  async listAccounts(tokens: ProviderTokens): Promise<ProviderAccount[]> {
    this.assertConfigured();
    const pageFields = 'id,name,category,access_token,followers_count,picture{url}';
    const fields =
      this.network === 'instagram'
        ? `${pageFields},instagram_business_account{id,username,profile_picture_url,followers_count}`
        : pageFields;
    const response = await this.call<{ data: GraphPage[] }>(
      `${GRAPH}/${this.config.graphVersion}/me/accounts?${form({ access_token: tokens.accessToken, fields, limit: '100' })}`,
    );
    const pages = response.data ?? [];

    if (this.network === 'facebook') {
      return pages.map((page) => ({
        externalId: page.id,
        name: page.name,
        username: null,
        avatarUrl: page.picture?.data?.url ?? null,
        kind: 'page' as const,
        accessToken: page.access_token ?? tokens.accessToken,
        // A page token taken from a long-lived login does not expire. Treating it as if it had the login's 60 days would
        // send it to be "refreshed" with a call that only works for user tokens, and mark a good connection expired.
        expiresInSeconds: page.access_token ? null : undefined,
        metadata: { category: page.category, followers: page.followers_count },
      }));
    }
    // An Instagram business account is only reachable through the Page it is linked to, so the Page's token is stored.
    return pages
      .filter((page) => page.instagram_business_account?.id)
      .map((page) => ({
        externalId: page.instagram_business_account!.id,
        name: page.instagram_business_account!.username ?? page.name,
        username: page.instagram_business_account!.username ?? null,
        avatarUrl: page.instagram_business_account!.profile_picture_url ?? null,
        kind: 'business' as const,
        accessToken: page.access_token ?? tokens.accessToken,
        expiresInSeconds: page.access_token ? null : undefined,
        parentExternalId: page.id,
        metadata: { pageName: page.name, followers: page.instagram_business_account!.followers_count },
      }));
  }

  publishPost(input: PublishInput): Promise<PublishResult> {
    this.assertConfigured();
    return this.network === 'instagram' ? this.publishToInstagram(input) : this.publishToPage(input, null);
  }

  schedulePost(input: PublishInput): Promise<PublishResult> {
    this.assertConfigured();
    if (this.network === 'instagram') {
      throw new ProviderError(
        'Instagram does not hold scheduled posts; we publish it at the time instead.',
        this.network,
      );
    }
    return this.publishToPage(input, input.scheduledFor ?? null);
  }

  /** One image, several images, one video, or words and a link: each is a different Graph call. */
  private async publishToPage(input: PublishInput, scheduledFor: Date | null): Promise<PublishResult> {
    const when = scheduledFor
      ? { published: 'false', scheduled_publish_time: String(Math.floor(scheduledFor.getTime() / 1000)) }
      : {};
    const videos = input.mediaUrls.filter((url) => mediaKindOf(url) === 'video');
    const images = input.mediaUrls.filter((url) => mediaKindOf(url) === 'image');
    if (videos.length && images.length)
      throw new ProviderError('Facebook takes pictures or a video in one post, not both.', this.network);
    if (videos.length > 1) throw new ProviderError('Facebook takes one video in a post.', this.network);
    const post = (edge: string, fields: Record<string, string | undefined>) =>
      this.call<{ id: string; post_id?: string }>(this.url(`${input.externalId}/${edge}`), {
        method: 'POST',
        body: form({ access_token: input.accessToken, ...fields }),
      });
    const link = input.linkUrl ? { link: input.linkUrl } : {};

    let postId: string;
    let permalink: string;
    if (videos.length) {
      const video = await post('videos', { file_url: videos[0], description: input.body, ...when });
      postId = video.id;
      permalink = `https://www.facebook.com/watch/?v=${video.id}`;
    } else if (images.length === 1) {
      const photo = await post('photos', { url: images[0], caption: input.body, ...when });
      postId = photo.post_id ?? photo.id;
      permalink = `https://www.facebook.com/${postId}`;
    } else if (images.length > 1) {
      // Each picture is uploaded unpublished, then one post is made that carries all of them.
      const attached: Record<string, string> = {};
      for (const [index, image] of images.entries()) {
        const photo = await post('photos', { url: image, published: 'false' });
        attached[`attached_media[${index}]`] = JSON.stringify({ media_fbid: photo.id });
      }
      const feed = await post('feed', { message: input.body, ...attached, ...link, ...when });
      postId = feed.id;
      permalink = `https://www.facebook.com/${postId}`;
    } else {
      const feed = await post('feed', { message: input.body, ...link, ...when });
      postId = feed.id;
      permalink = `https://www.facebook.com/${postId}`;
    }
    return { externalPostId: postId, permalink, scheduled: Boolean(scheduledFor) };
  }

  /**
   * Instagram is containers: one per picture or video, then one to publish. A video (a Reel) is fetched in the
   * background, so the container is polled until Instagram says it is ready; publishing before that is refused.
   */
  private async publishToInstagram(input: PublishInput): Promise<PublishResult> {
    const media = input.mediaUrls;
    if (!media.length)
      throw new ProviderError('Instagram needs an image or a video. Add one before publishing.', this.network);
    const videos = media.filter((url) => mediaKindOf(url) === 'video');
    if (videos.length && media.length > 1)
      throw new ProviderError('Instagram takes one video, or up to ten pictures, in a post.', this.network);
    if (media.length > 10) throw new ProviderError('Instagram takes up to ten pictures in a post.', this.network);

    const create = (fields: Record<string, string>) =>
      this.call<{ id: string }>(this.url(`${input.externalId}/media`), {
        method: 'POST',
        body: form({ access_token: input.accessToken, ...fields }),
      });

    let creationId: string;
    if (media.length === 1) {
      const isVideo = videos.length === 1;
      creationId = (
        await create({
          caption: input.body,
          ...(isVideo ? { video_url: media[0]!, media_type: 'REELS' } : { image_url: media[0]! }),
        })
      ).id;
      if (isVideo) await this.waitUntilReady(creationId, input.accessToken);
    } else {
      const children: string[] = [];
      for (const image of media) children.push((await create({ image_url: image, is_carousel_item: 'true' })).id);
      creationId = (await create({ media_type: 'CAROUSEL', children: children.join(','), caption: input.body })).id;
    }

    const published = await this.call<{ id: string }>(this.url(`${input.externalId}/media_publish`), {
      method: 'POST',
      body: form({ access_token: input.accessToken, creation_id: creationId }),
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
    return {
      externalPostId: published.id,
      permalink,
      note: input.linkUrl ? 'Links in an Instagram caption are not clickable.' : null,
    };
  }

  private async waitUntilReady(containerId: string, accessToken: string) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const status = await this.call<{ status_code?: string; status?: string }>(
        this.url(`${containerId}?${form({ fields: 'status_code,status', access_token: accessToken })}`),
      );
      if (status.status_code === 'FINISHED') return;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new ProviderError(
          `Instagram could not process the video${status.status ? `: ${status.status}` : '.'}`,
          this.network,
        );
      }
      await this.wait(5000);
    }
    // Nothing was published yet, so this is a definite failure and safe to retry later.
    throw new ProviderError(
      'Instagram is still processing the video. Nothing was posted; try again in a few minutes.',
      this.network,
      'rate_limit',
    );
  }

  async findRecentPost(input: {
    accessToken: string;
    externalId: string;
    bodyStart: string;
    since: Date;
  }): Promise<FoundPost | null> {
    this.assertConfigured();
    const facebook = this.network === 'facebook';
    const edge = facebook ? 'posts' : 'media';
    const fields = facebook ? 'id,message,created_time,permalink_url' : 'id,caption,timestamp,permalink';
    const response = await this.call<{
      data?: {
        id: string;
        message?: string;
        caption?: string;
        created_time?: string;
        timestamp?: string;
        permalink_url?: string;
        permalink?: string;
      }[];
    }>(this.url(`${input.externalId}/${edge}?${form({ fields, limit: '10', access_token: input.accessToken })}`));
    const wanted = input.bodyStart.trim().slice(0, 60);
    for (const item of response.data ?? []) {
      const at = new Date(item.created_time ?? item.timestamp ?? 0);
      const text = (item.message ?? item.caption ?? '').trim();
      if (at >= input.since && wanted && text.startsWith(wanted)) {
        return { externalPostId: item.id, permalink: item.permalink_url ?? item.permalink ?? null, publishedAt: at };
      }
    }
    return null;
  }

  /** Facebook and Instagram both take a comment on the post, as the same account. */
  async addComment({ accessToken, externalPostId, message }: CommentInput): Promise<void> {
    this.assertConfigured();
    await this.call(this.url(`${externalPostId}/comments`), {
      method: 'POST',
      body: form({ access_token: accessToken, message }),
    });
  }

  async fetchComments({
    accessToken,
    externalPostId,
    limit = 25,
  }: PostRef & { limit?: number }): Promise<ProviderComment[]> {
    this.assertConfigured();
    const fields =
      this.network === 'facebook' ? 'id,message,created_time,permalink_url,from{name}' : 'id,text,timestamp,username';
    const response = await this.call<{ data?: MetaComment[] }>(
      this.url(
        `${externalPostId}/comments?${form({ fields, limit: String(limit), order: 'reverse_chronological', access_token: accessToken })}`,
      ),
    );
    return (response.data ?? []).map((comment) => ({
      externalId: comment.id,
      authorName: comment.from?.name ?? comment.username ?? null,
      message: comment.message ?? comment.text ?? '',
      receivedAt: new Date(comment.created_time ?? comment.timestamp ?? Date.now()),
      permalink: comment.permalink_url ?? null,
    }));
  }

  /** A reply hangs off the comment: a Page comments on it, Instagram has a replies edge of its own. */
  async replyToComment({ accessToken, externalPostId, message }: CommentInput): Promise<void> {
    this.assertConfigured();
    const edge = this.network === 'instagram' ? 'replies' : 'comments';
    await this.call(this.url(`${externalPostId}/${edge}`), {
      method: 'POST',
      body: form({ access_token: accessToken, message }),
    });
  }

  /** Sends a message from the page (or Instagram account) to someone who wrote to it, inside Meta's reply window. */
  async replyToMessage({ accessToken, externalId, recipientId, message }: MessageReplyInput): Promise<void> {
    this.assertConfigured();
    const path = this.network === 'instagram' ? `${externalId}/messages` : 'me/messages';
    await this.call(this.url(`${path}?${form({ access_token: accessToken })}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text: message } }),
    });
  }

  async fetchSenderName({ accessToken, senderId }: { accessToken: string; senderId: string }): Promise<string | null> {
    this.assertConfigured();
    const fields = this.network === 'instagram' ? 'name,username' : 'name';
    const person = await this.call<{ name?: string; username?: string }>(
      this.url(`${senderId}?${form({ fields, access_token: accessToken })}`),
    );
    return person.name ?? person.username ?? null;
  }

  /**
   * Reactions, comments and shares come from the post itself, which is stable. Reach and views come from Insights,
   * whose metric names Meta changes from time to time, so each is asked for on its own: one being retired does not
   * take the others down with it.
   */
  async fetchMetrics({ accessToken, externalPostId }: PostRef): Promise<Record<string, number>> {
    this.assertConfigured();
    const result: Record<string, number> = {};
    if (this.network === 'facebook') {
      const post = await this.call<{
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
        shares?: { count?: number };
      }>(
        this.url(
          `${externalPostId}?${form({ fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares', access_token: accessToken })}`,
        ),
      );
      result.reactions = post.reactions?.summary?.total_count ?? 0;
      result.comments = post.comments?.summary?.total_count ?? 0;
      result.shares = post.shares?.count ?? 0;
    } else {
      const media = await this.call<{ like_count?: number; comments_count?: number }>(
        this.url(`${externalPostId}?${form({ fields: 'like_count,comments_count', access_token: accessToken })}`),
      );
      result.likes = media.like_count ?? 0;
      result.comments = media.comments_count ?? 0;
    }
    const insights =
      this.network === 'instagram' ? ['reach', 'saved', 'shares', 'views'] : ['post_impressions', 'post_clicks'];
    for (const metric of insights) {
      try {
        const response = await this.call<{ data: { name: string; values: { value: number }[] }[] }>(
          this.url(`${externalPostId}/insights?${form({ metric, access_token: accessToken })}`),
        );
        for (const row of response.data ?? [])
          result[row.name.replace(/^post_/, '')] = Number(row.values?.[0]?.value ?? 0);
      } catch {
        // This metric is not available for this post or has been retired; the rest still count.
      }
    }
    return result;
  }
}
