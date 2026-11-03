/** The networks Social Media Staff posts to at launch. TikTok and YouTube arrive with video (Milestone 4b). */
export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'linkedin', 'x'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** What a connected account's tokens look like once a provider has finished an OAuth handshake. */
export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string | null;
  /** Seconds from now, as the network reports it. Absent means "does not expire" (a Facebook page token). */
  expiresInSeconds?: number | null;
  scopes?: string[];
}

/** One page, profile or channel the signed-in person can post to, as the network describes it. */
export interface ProviderAccount {
  externalId: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  kind: 'page' | 'profile' | 'business' | 'organization';
  /** A page token, where the network issues one per page (Facebook). Falls back to the user token. */
  accessToken?: string | null;
  /** Seconds this account's own token lives. `null` means it never expires (a Facebook page token). */
  expiresInSeconds?: number | null;
  parentExternalId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuthUrlInput {
  redirectUri: string;
  state: string;
  /** PKCE challenge, for the networks that require it. */
  codeChallenge?: string;
}

export interface ExchangeCodeInput {
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
}

/** Everything a provider needs to put one post on one account. */
export interface PublishInput {
  accessToken: string;
  externalId: string;
  body: string;
  mediaUrls: string[];
  linkUrl?: string | null;
  /** Set when the network is asked to hold the post itself rather than us holding it. */
  scheduledFor?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface PublishResult {
  externalPostId: string;
  permalink?: string | null;
  /** True when the network accepted it for later rather than posting it now. */
  scheduled?: boolean;
  /** Something to tell the person that is not a failure. */
  note?: string | null;
}

export interface PostRef {
  accessToken: string;
  externalId: string;
  externalPostId: string;
}

export interface CommentInput extends PostRef {
  message: string;
}

/** A private message answered as the account. Networks allow this only for a short while after the person wrote. */
export interface MessageReplyInput {
  accessToken: string;
  externalId: string;
  recipientId: string;
  message: string;
}

/** One comment somebody left on a published post, in the one shape the inbox stores. */
export interface ProviderComment {
  externalId: string;
  authorName: string | null;
  message: string;
  receivedAt: Date;
  permalink?: string | null;
}

/** A post that already exists on the account, found to settle an uncertain publish. */
export interface FoundPost {
  externalPostId: string;
  permalink?: string | null;
  publishedAt: Date;
}

/**
 * What every network has to be able to do before we will talk to it. Anything one network can do that the others
 * cannot (Instagram's two-step container publish, X's PKCE) is hidden inside its own implementation, so the
 * publishing path is the same whichever account a post is going to.
 */
export interface SocialProvider {
  readonly network: SocialNetwork;
  readonly label: string;
  /** Whether the app id and secret for this network are set. False means every call below throws a clear error. */
  isConfigured(): boolean;
  readonly supportsNativeScheduling: boolean;
  readonly usesPkce: boolean;

  getAuthUrl(input: AuthUrlInput): string;
  exchangeCode(input: ExchangeCodeInput): Promise<ProviderTokens>;
  refreshToken(refreshToken: string): Promise<ProviderTokens>;
  listAccounts(tokens: ProviderTokens): Promise<ProviderAccount[]>;
  publishPost(input: PublishInput): Promise<PublishResult>;
  /** Hand the post to the network to publish later. Only called when `supportsNativeScheduling` is true. */
  schedulePost(input: PublishInput): Promise<PublishResult>;
  /**
   * Looks for a post on the account that matches `bodyStart` and was made since `since`. Used when a publish's outcome
   * is unknown, so a post that did go up is never posted again. Absent means the network cannot be asked, and the
   * person decides.
   */
  findRecentPost?(input: {
    accessToken: string;
    externalId: string;
    bodyStart: string;
    since: Date;
  }): Promise<FoundPost | null>;
  fetchMetrics(input: PostRef): Promise<Record<string, number>>;
  addComment?(input: CommentInput): Promise<void>;
  /** Comments left on a published post, for the networks that hand them over without a webhook subscription. */
  fetchComments?(input: PostRef & { limit?: number }): Promise<ProviderComment[]>;
  /** Answer one comment as the account. `externalPostId` is the comment being replied to. */
  replyToComment?(input: CommentInput): Promise<void>;
  replyToMessage?(input: MessageReplyInput): Promise<void>;
  fetchSenderName?(input: { accessToken: string; senderId: string }): Promise<string | null>;
}

/** How a failure should be handled: a broken login, a limit to wait out, or anything else. */
export type ProviderErrorKind = 'auth' | 'rate_limit' | 'other';

/** Thrown when a network says no. Carries the network's own words so the dashboard can show them. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly network: SocialNetwork,
    readonly kind: ProviderErrorKind = 'other',
    readonly status?: number,
    /** True when the request was never answered, so the network may or may not have acted on it. */
    readonly unknownOutcome = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Meta's error codes for an invalid or expired token, and for limits (see Graph API error reference). */
const META_AUTH_CODES = new Set([102, 190, 200, 10]);
const META_RATE_CODES = new Set([4, 17, 32, 341, 613]);

function classify(status: number, body: { error?: { code?: number } | string }): ProviderErrorKind {
  const code = typeof body.error === 'object' ? body.error?.code : undefined;
  if (status === 429 || (code !== undefined && META_RATE_CODES.has(code))) return 'rate_limit';
  if (status === 401 || (code !== undefined && META_AUTH_CODES.has(code))) return 'auth';
  return 'other';
}

/**
 * One fetch helper for every provider: JSON in, JSON out, and a network's error turned into something a person can
 * read. A request that was sent but never answered is marked as an unknown outcome, never as a plain failure.
 */
export async function callApi<T>(
  network: SocialNetwork,
  url: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(30_000), ...init });
  } catch (error) {
    throw new ProviderError(
      `Could not reach ${network}: ${(error as Error).message}`,
      network,
      'other',
      undefined,
      true,
    );
  }
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const body = payload as {
      error?: { message?: string; code?: number } | string;
      error_description?: string;
      message?: string;
      detail?: string;
    };
    const message =
      (typeof body.error === 'object' ? body.error?.message : body.error) ??
      body.error_description ??
      body.message ??
      body.detail ??
      `${network} returned ${response.status}.`;
    throw new ProviderError(
      String(message),
      network,
      classify(response.status, body),
      response.status,
      response.status >= 500,
    );
  }
  return payload as T;
}

export const form = (fields: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(fields).filter((entry): entry is [string, string] => entry[1] !== undefined));

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

/** Pictures and videos are told apart by the link, which is how the composer and the networks both see them. */
export const mediaKindOf = (url: string): 'image' | 'video' => (VIDEO_EXTENSIONS.test(url) ? 'video' : 'image');

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
