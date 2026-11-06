import { CredentialProvider, graphemeCount } from './credential.js';
import {
  callApi,
  type CredentialConnection,
  type CredentialField,
  type FoundPost,
  type PostRef,
  ProviderError,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
} from './provider.js';

const SERVICE = 'https://bsky.social';
const MAX_GRAPHEMES = 300;

/** What Bluesky calls a session that can no longer be used, however it is worded. */
const AUTH_ERRORS = /ExpiredToken|InvalidToken|AuthenticationRequired|AccountTakedown|AccountDeactivated/;

/** Seconds a JWT has left, read from its `exp` claim. Falls back to an hour when it cannot be read. */
function secondsLeft(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
    if (payload.exp) return Math.max(60, payload.exp - Math.floor(Date.now() / 1000));
  } catch {
    // fall through
  }
  return 3600;
}

interface Session {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Record<string, string>[];
}

/** Links and hashtags only work as links when the post says where they are, in UTF-8 byte offsets. */
export function facetsFor(text: string): Facet[] {
  const bytes = (until: number) => new TextEncoder().encode(text.slice(0, until)).length;
  const facets: Facet[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const url = match[0].replace(/[.,;:!?)\]}'"]+$/, '');
    const start = match.index ?? 0;
    facets.push({
      index: { byteStart: bytes(start), byteEnd: bytes(start + url.length) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }
  for (const match of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,64})/gu)) {
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    const tag = match[2] ?? '';
    facets.push({
      index: { byteStart: bytes(start), byteEnd: bytes(start + 1 + tag.length) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
    });
  }
  return facets;
}

/**
 * Bluesky (AT Protocol). The person makes an app password in their settings and pastes it with their handle; we trade
 * it for a session and keep only the session, never the password. The session lasts about two hours and is renewed
 * with its refresh token. Pictures are not sent yet. Accounts on their own server are reached through bsky.social.
 */
export class BlueskyProvider extends CredentialProvider {
  readonly network = 'bluesky' as const;
  readonly label = 'Bluesky account';
  readonly credentialFields: readonly CredentialField[] = [
    {
      name: 'handle',
      label: 'Handle',
      placeholder: 'yourname.bsky.social',
      hint: 'Your Bluesky handle, without the @.',
    },
    {
      name: 'appPassword',
      label: 'App password',
      secret: true,
      placeholder: 'xxxx-xxxx-xxxx-xxxx',
      hint: 'In Bluesky: Settings, then Privacy and security, then App passwords. Make one for AI Staff. Never use your main password.',
    },
  ];

  constructor(private readonly fetcher: typeof fetch = fetch) {
    super();
  }

  /**
   * Bluesky answers with a code ("AuthenticationRequired"), not a sentence, and says 400 for some dead sessions, so the
   * code and the status are both read and turned into words a person can act on.
   */
  private async call<T>(path: string, init?: RequestInit, onLoginRefused?: string): Promise<T> {
    try {
      return await callApi<T>(this.network, `${SERVICE}/xrpc/${path}`, init, this.fetcher);
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      if (error.kind === 'auth' || AUTH_ERRORS.test(error.message)) {
        throw new ProviderError(
          onLoginRefused ?? 'Bluesky no longer accepts this login. Connect the account again.',
          this.network,
          'auth',
          error.status,
        );
      }
      if (error.kind === 'rate_limit') {
        throw new ProviderError(
          'Bluesky asks us to slow down. Try again in a few minutes.',
          this.network,
          'rate_limit',
          error.status,
        );
      }
      throw error;
    }
  }

  private json(token: string): RequestInit {
    return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  }

  private tokensOf(session: Session): ProviderTokens {
    return {
      accessToken: session.accessJwt,
      refreshToken: session.refreshJwt,
      expiresInSeconds: secondsLeft(session.accessJwt),
    };
  }

  async connectWithCredentials(input: Record<string, string>): Promise<CredentialConnection> {
    const handle = this.field(input, 'handle').replace(/^@/, '').toLowerCase();
    const session = await this.call<Session>(
      'com.atproto.server.createSession',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: handle, password: this.field(input, 'appPassword') }),
      },
      'Bluesky did not accept that handle and app password. Check both, and use an app password, not your main one.',
    );
    return {
      tokens: this.tokensOf(session),
      accounts: [{ externalId: session.did, name: session.handle, username: session.handle, kind: 'profile' }],
    };
  }

  override async refreshToken(refreshToken: string): Promise<ProviderTokens> {
    const session = await this.call<Session>('com.atproto.server.refreshSession', {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    return this.tokensOf(session);
  }

  async publishPost(input: PublishInput): Promise<PublishResult> {
    this.refuseMedia(
      input,
      'Posts to Bluesky are words and a link only for now. Take the picture off, or leave Bluesky off this post.',
    );
    const text = input.linkUrl ? `${input.body}\n${input.linkUrl}`.trim() : input.body;
    if (graphemeCount(text) > MAX_GRAPHEMES) {
      throw new ProviderError(`Bluesky allows ${MAX_GRAPHEMES} characters and this is longer.`, this.network);
    }
    const facets = facetsFor(text);
    const created = await this.call<{ uri: string }>('com.atproto.repo.createRecord', {
      method: 'POST',
      ...this.json(input.accessToken),
      body: JSON.stringify({
        repo: input.externalId,
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text,
          createdAt: new Date().toISOString(),
          ...(facets.length ? { facets } : {}),
        },
      }),
    });
    const handle = (input.metadata?.username as string | undefined) ?? input.externalId;
    return {
      externalPostId: created.uri,
      permalink: `https://bsky.app/profile/${handle}/post/${created.uri.split('/').pop()}`,
    };
  }

  async fetchMetrics({ accessToken, externalPostId }: PostRef): Promise<Record<string, number>> {
    const response = await this.call<{
      posts?: { likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }[];
    }>(`app.bsky.feed.getPosts?${new URLSearchParams({ uris: externalPostId })}`, this.json(accessToken));
    const post = response.posts?.[0];
    return {
      likes: post?.likeCount ?? 0,
      reposts: post?.repostCount ?? 0,
      replies: post?.replyCount ?? 0,
      quotes: post?.quoteCount ?? 0,
    };
  }

  async findRecentPost(input: {
    accessToken: string;
    externalId: string;
    bodyStart: string;
    since: Date;
  }): Promise<FoundPost | null> {
    const query = new URLSearchParams({ repo: input.externalId, collection: 'app.bsky.feed.post', limit: '20' });
    const response = await this.call<{ records?: { uri: string; value: { text?: string; createdAt?: string } }[] }>(
      `com.atproto.repo.listRecords?${query}`,
      this.json(input.accessToken),
    );
    const wanted = input.bodyStart.trim().slice(0, 60);
    const hit = (response.records ?? []).find(
      (record) =>
        wanted &&
        (record.value.text ?? '').trim().startsWith(wanted) &&
        new Date(record.value.createdAt ?? 0).getTime() >= input.since.getTime(),
    );
    return hit
      ? {
          externalPostId: hit.uri,
          permalink: `https://bsky.app/profile/${input.externalId}/post/${hit.uri.split('/').pop()}`,
          publishedAt: new Date(hit.value.createdAt ?? Date.now()),
        }
      : null;
  }
}
