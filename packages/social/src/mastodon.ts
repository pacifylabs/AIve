import { CredentialProvider, plainText } from './credential.js';
import {
  callApi,
  type CommentInput,
  type CredentialConnection,
  type CredentialField,
  type FoundPost,
  type PostRef,
  ProviderError,
  type PublishInput,
  type PublishResult,
} from './provider.js';

/** Servers differ; 500 is what a stock Mastodon allows, and the most common limit. */
export const MASTODON_DEFAULT_LIMIT = 500;

/** Throws when a server name points somewhere a public Mastodon server would not be (this machine, a private network). */
export type HostGuard = (host: string) => Promise<void>;

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * A server name from whatever the person typed ("https://mastodon.social/", "@me@mastodon.social"), or a message.
 * Only a real domain passes: no addresses, no ports, no names that are only meaningful inside a network.
 */
export function normalizeInstance(raw: string): string {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^@?[^@/]*@/, '')
    .replace(/[/?#].*$/, '');
  if (!HOST.test(host) || !/[a-z]{2,}$/.test(host) || /\.(local|internal|localhost|test|invalid)$/.test(host)) {
    throw new ProviderError(
      'That does not look like a Mastodon server. Use its address, like mastodon.social.',
      'mastodon',
    );
  }
  return host;
}

/** Accounts are told apart by server and number together, since two servers can both have an account 1. */
const splitId = (externalId: string) => {
  const slash = externalId.indexOf('/');
  return { host: externalId.slice(0, slash), id: externalId.slice(slash + 1) };
};

/**
 * Mastodon, and servers that speak its API. The person makes an access token in their server's settings (Development,
 * New application, with permission to write posts) and pastes it with the server's address. The token does not
 * expire. Pictures are not sent yet.
 */
export class MastodonProvider extends CredentialProvider {
  readonly network = 'mastodon' as const;
  readonly label = 'Mastodon account';
  readonly credentialFields: readonly CredentialField[] = [
    {
      name: 'instance',
      label: 'Server',
      placeholder: 'mastodon.social',
      hint: 'The address of the server your account is on.',
    },
    {
      name: 'accessToken',
      label: 'Access token',
      secret: true,
      hint: 'On your server: Preferences, then Development, then New application. Allow "write:statuses" and "read:accounts", save, and copy "Your access token".',
    },
  ];

  constructor(
    private readonly options: { hostGuard?: HostGuard } = {},
    private readonly fetcher: typeof fetch = fetch,
  ) {
    super();
  }

  private call<T>(host: string, path: string, token: string, init: RequestInit = {}) {
    return callApi<T>(
      this.network,
      `https://${host}/api/v1/${path}`,
      {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
      },
      this.fetcher,
    );
  }

  async connectWithCredentials(input: Record<string, string>): Promise<CredentialConnection> {
    const host = normalizeInstance(this.field(input, 'instance'));
    await this.options.hostGuard?.(host);
    const token = this.field(input, 'accessToken');
    const me = await this.call<{ id: string; username: string; display_name?: string }>(
      host,
      'accounts/verify_credentials',
      token,
    );
    return {
      tokens: { accessToken: token, refreshToken: null, expiresInSeconds: null },
      accounts: [
        {
          externalId: `${host}/${me.id}`,
          name: me.display_name || me.username,
          username: `@${me.username}@${host}`,
          kind: 'profile',
        },
      ],
    };
  }

  async publishPost(input: PublishInput): Promise<PublishResult> {
    this.refuseMedia(
      input,
      'Posts to Mastodon are words and a link only for now. Take the picture off, or leave Mastodon off this post.',
    );
    const { host } = splitId(input.externalId);
    const status = input.linkUrl ? `${input.body}\n${input.linkUrl}`.trim() : input.body;
    const posted = await this.call<{ id: string; url?: string }>(host, 'statuses', input.accessToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The server drops a second request with the same key, so a retry can never make a second post.
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
      },
      body: JSON.stringify({ status, visibility: 'public' }),
    });
    return { externalPostId: posted.id, permalink: posted.url ?? null };
  }

  async addComment({ accessToken, externalId, externalPostId, message }: CommentInput): Promise<void> {
    const { host } = splitId(externalId);
    await this.call(host, 'statuses', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: message, in_reply_to_id: externalPostId, visibility: 'public' }),
    });
  }

  async fetchMetrics({ accessToken, externalId, externalPostId }: PostRef): Promise<Record<string, number>> {
    const { host } = splitId(externalId);
    const status = await this.call<{ favourites_count?: number; reblogs_count?: number; replies_count?: number }>(
      host,
      `statuses/${encodeURIComponent(externalPostId)}`,
      accessToken,
    );
    return {
      likes: status.favourites_count ?? 0,
      reposts: status.reblogs_count ?? 0,
      replies: status.replies_count ?? 0,
    };
  }

  async findRecentPost(input: {
    accessToken: string;
    externalId: string;
    bodyStart: string;
    since: Date;
  }): Promise<FoundPost | null> {
    const { host, id } = splitId(input.externalId);
    const statuses = await this.call<{ id: string; url?: string; content?: string; created_at?: string }[]>(
      host,
      `accounts/${encodeURIComponent(id)}/statuses?limit=20&exclude_replies=true`,
      input.accessToken,
    );
    const wanted = input.bodyStart.trim().slice(0, 60);
    const hit = statuses.find(
      (status) =>
        wanted &&
        plainText(status.content ?? '').startsWith(wanted) &&
        new Date(status.created_at ?? 0).getTime() >= input.since.getTime(),
    );
    return hit
      ? { externalPostId: hit.id, permalink: hit.url ?? null, publishedAt: new Date(hit.created_at ?? Date.now()) }
      : null;
  }
}
