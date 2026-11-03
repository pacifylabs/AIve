import {
  type AuthUrlInput,
  type ExchangeCodeInput,
  type FoundPost,
  type PostRef,
  ProviderError,
  type ProviderAccount,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  type SocialNetwork,
  type SocialProvider,
  type CommentInput,
  type ProviderComment,
} from './provider.js';

/**
 * A network that records what it is asked to post, for tests and local development, and for networks we do not have
 * access to yet (LinkedIn until Community Management API access is granted). `next` makes the following publish fail
 * the way a real network can: `auth`, `rate_limit`, `refuse`, or `drop` (the request was sent and never answered, but
 * the post did go up, which is the case uncertain-outcome handling exists for).
 */
export class FixtureSocialProvider implements SocialProvider {
  readonly label: string;
  readonly supportsNativeScheduling = false;
  readonly usesPkce = false;
  readonly posts: (PublishInput & { externalPostId: string; at: Date })[] = [];
  readonly comments: CommentInput[] = [];
  next: 'auth' | 'rate_limit' | 'refuse' | 'drop' | 'drop_and_lose' | null = null;
  incoming: ProviderComment[] = [];
  private counter = 0;

  constructor(readonly network: SocialNetwork) {
    this.label = `${network} (fixture)`;
  }

  isConfigured() {
    return true;
  }

  getAuthUrl({ state }: AuthUrlInput) {
    return `https://fixture.test/oauth?state=${encodeURIComponent(state)}`;
  }

  exchangeCode(_input: ExchangeCodeInput): Promise<ProviderTokens> {
    return Promise.resolve({ accessToken: 'fixture-token', expiresInSeconds: 3600 });
  }

  refreshToken(): Promise<ProviderTokens> {
    return Promise.resolve({ accessToken: 'fixture-token-2', expiresInSeconds: 3600 });
  }

  listAccounts(): Promise<ProviderAccount[]> {
    return Promise.resolve([{ externalId: 'fixture-account', name: 'Fixture account', kind: 'page' }]);
  }

  publishPost(input: PublishInput): Promise<PublishResult> {
    const behaviour = this.next;
    this.next = null;
    if (behaviour === 'auth')
      return Promise.reject(new ProviderError('The token is invalid.', this.network, 'auth', 401));
    if (behaviour === 'rate_limit')
      return Promise.reject(new ProviderError('Too many requests.', this.network, 'rate_limit', 429));
    if (behaviour === 'refuse')
      return Promise.reject(new ProviderError('The network refused this post.', this.network, 'other', 400));
    const externalPostId = `fixture-post-${(this.counter += 1)}`;
    if (behaviour === 'drop') {
      this.posts.push({ ...input, externalPostId, at: new Date() });
      return Promise.reject(
        new ProviderError('Connection closed before the network answered.', this.network, 'other', undefined, true),
      );
    }
    if (behaviour === 'drop_and_lose') {
      return Promise.reject(
        new ProviderError('Connection closed before the network answered.', this.network, 'other', undefined, true),
      );
    }
    this.posts.push({ ...input, externalPostId, at: new Date() });
    return Promise.resolve({ externalPostId, permalink: `https://fixture.test/${externalPostId}` });
  }

  schedulePost(input: PublishInput) {
    return this.publishPost(input);
  }

  findRecentPost(input: { bodyStart: string; since: Date }): Promise<FoundPost | null> {
    const wanted = input.bodyStart.trim().slice(0, 60);
    const hit = this.posts.find((post) => post.at >= input.since && post.body.trim().startsWith(wanted));
    return Promise.resolve(
      hit
        ? {
            externalPostId: hit.externalPostId,
            permalink: `https://fixture.test/${hit.externalPostId}`,
            publishedAt: hit.at,
          }
        : null,
    );
  }

  fetchMetrics(_input: PostRef): Promise<Record<string, number>> {
    return Promise.resolve({ reactions: 3, comments: 1 });
  }

  addComment(input: CommentInput): Promise<void> {
    this.comments.push(input);
    return Promise.resolve();
  }

  fetchComments(): Promise<ProviderComment[]> {
    return Promise.resolve(this.incoming);
  }

  replyToComment(input: CommentInput): Promise<void> {
    this.comments.push(input);
    return Promise.resolve();
  }
}
