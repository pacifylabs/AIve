import {
  type AuthUrlInput,
  type CheckPublishInput,
  type CheckPublishResult,
  type PendingPublishResult,
  isPendingPublish,
  type CredentialConnection,
  type CredentialField,
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
  type MessageReplyInput,
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
  /** `credentials` makes the fixture stand in for a network with no sign-in page (Telegram, Discord and the like). */
  readonly authKind: 'oauth' | 'credentials';
  readonly credentialFields: readonly CredentialField[];
  readonly posts: (PublishInput & { externalPostId: string; at: Date })[] = [];
  readonly comments: CommentInput[] = [];
  readonly messages: MessageReplyInput[] = [];
  /** Makes the next reply fail like a real network: `auth`, `rate_limit` or `drop` (sent, never answered). */
  nextReply: 'auth' | 'rate_limit' | 'drop' | null = null;
  /** Makes the next renewal of a login fail: `auth` (the network refuses it) or `down` (it could not be reached). */
  nextRefresh: 'auth' | 'down' | null = null;
  next: 'auth' | 'rate_limit' | 'refuse' | 'drop' | 'drop_and_lose' | 'pending' | null = null;
  /** What the following looks at a pending publish find, in order. When empty, a look finds the post ready. */
  checks: ('processing' | 'ready' | 'failed' | 'uncertain' | 'auth' | 'rate_limit' | 'lost')[] = [];
  readonly checked: CheckPublishInput[] = [];
  incoming: ProviderComment[] = [];
  /** What `listAccounts` returns: tests add more to exercise choosing between several pages. */
  accounts: ProviderAccount[] = [{ externalId: 'fixture-account', name: 'Fixture account', kind: 'page' }];
  /** How many comments were refused, so tests can see how often a part was tried. */
  commentAttempts = 0;
  private counter = 0;

  constructor(
    readonly network: SocialNetwork,
    options: { credentials?: boolean } = {},
  ) {
    this.label = `${network} (fixture)`;
    this.authKind = options.credentials ? 'credentials' : 'oauth';
    this.credentialFields = options.credentials
      ? [
          {
            name: 'token',
            label: 'Token',
            secret: true,
            hint: 'Any value; "bad" is refused, as a wrong token would be.',
          },
        ]
      : [];
  }

  connectWithCredentials(input: Record<string, string>): Promise<CredentialConnection> {
    if (input.token === 'bad') {
      return Promise.reject(new ProviderError('The fixture refused that token.', this.network, 'auth', 401));
    }
    return Promise.resolve({
      tokens: { accessToken: `fixture-secret-${input.token ?? ''}`, refreshToken: null, expiresInSeconds: null },
      accounts: this.accounts,
    });
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
    const failure = this.nextRefresh;
    this.nextRefresh = null;
    if (failure === 'auth') return Promise.reject(new ProviderError('The login was refused.', this.network, 'auth'));
    if (failure === 'down') return Promise.reject(new ProviderError('Could not reach the network.', this.network));
    return Promise.resolve({ accessToken: 'fixture-token-2', expiresInSeconds: 60 * 86_400 });
  }

  listAccounts(): Promise<ProviderAccount[]> {
    return Promise.resolve(this.accounts);
  }

  publishPost(input: PublishInput): Promise<PublishResult | PendingPublishResult> {
    const behaviour = this.next;
    this.next = null;
    if (behaviour === 'auth')
      return Promise.reject(new ProviderError('The token is invalid.', this.network, 'auth', 401));
    if (behaviour === 'rate_limit')
      return Promise.reject(new ProviderError('Too many requests.', this.network, 'rate_limit', 429));
    if (behaviour === 'refuse')
      return Promise.reject(new ProviderError('The network refused this post.', this.network, 'other', 400));
    const externalPostId = `fixture-post-${(this.counter += 1)}`;
    if (behaviour === 'pending') {
      // Nothing is on the network until a look finds it ready, which is when the post is recorded.
      return Promise.resolve({
        pending: { ticket: `ticket-${externalPostId}`, data: { externalPostId }, checkAfterSeconds: 15 },
      });
    }
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

  checkPublish(input: CheckPublishInput): Promise<CheckPublishResult> {
    this.checked.push(input);
    const outcome = this.checks.shift() ?? 'ready';
    const externalPostId = String(input.data?.externalPostId ?? 'fixture-post-0');
    if (outcome === 'processing') return Promise.resolve({ state: 'processing' });
    if (outcome === 'failed') return Promise.resolve({ state: 'failed', message: 'The network could not process it.' });
    if (outcome === 'uncertain')
      return Promise.resolve({ state: 'uncertain', message: 'Connection closed before the network answered.' });
    if (outcome === 'auth')
      return Promise.reject(new ProviderError('The token is invalid.', this.network, 'auth', 401));
    if (outcome === 'rate_limit')
      return Promise.reject(new ProviderError('Too many requests.', this.network, 'rate_limit', 429));
    if (outcome === 'lost') {
      return Promise.reject(new ProviderError('Could not reach the network.', this.network, 'other', undefined, true));
    }
    this.posts.push({
      accessToken: input.accessToken,
      externalId: input.externalId,
      body: input.body,
      mediaUrls: [],
      externalPostId,
      at: new Date(),
    });
    return Promise.resolve({
      state: 'ready',
      result: { externalPostId, permalink: `https://fixture.test/${externalPostId}` },
    });
  }

  async schedulePost(input: PublishInput): Promise<PublishResult> {
    const result = await this.publishPost(input);
    if (isPendingPublish(result)) throw new ProviderError('The fixture does not schedule pending posts.', this.network);
    return result;
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

  /** Makes comments fail, so a chain that loses a part can be tested: let this many through, then fail this many. */
  commentsBeforeFailure = 0;
  commentFailures = 0;
  commentFailureKind: 'auth' | 'other' | 'drop' = 'other';

  addComment(input: CommentInput): Promise<{ externalPostId?: string }> {
    if (this.commentsBeforeFailure > 0) {
      this.commentsBeforeFailure -= 1;
    } else if (this.commentFailures > 0) {
      this.commentFailures -= 1;
      this.commentAttempts += 1;
      const kind = this.commentFailureKind;
      return Promise.reject(
        new ProviderError(
          'The fixture refused that reply.',
          this.network,
          kind === 'auth' ? 'auth' : 'other',
          undefined,
          kind === 'drop',
        ),
      );
    }
    this.comments.push(input);
    this.counter += 1;
    return Promise.resolve({ externalPostId: `fx-reply-${this.counter}` });
  }

  fetchComments(): Promise<ProviderComment[]> {
    return Promise.resolve(this.incoming);
  }

  private replyOutcome(): Promise<void> | null {
    const behaviour = this.nextReply;
    this.nextReply = null;
    if (behaviour === 'auth')
      return Promise.reject(new ProviderError('The token is invalid.', this.network, 'auth', 401));
    if (behaviour === 'rate_limit')
      return Promise.reject(new ProviderError('Too many requests.', this.network, 'rate_limit', 429));
    if (behaviour === 'drop')
      return Promise.reject(
        new ProviderError('Connection closed before the network answered.', this.network, 'other', undefined, true),
      );
    return null;
  }

  replyToComment(input: CommentInput): Promise<void> {
    const failed = this.replyOutcome();
    if (failed) return failed;
    this.comments.push(input);
    return Promise.resolve();
  }

  replyToMessage(input: MessageReplyInput): Promise<void> {
    const failed = this.replyOutcome();
    if (failed) return failed;
    this.messages.push(input);
    return Promise.resolve();
  }
}
