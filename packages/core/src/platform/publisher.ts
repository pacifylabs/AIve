import {
  ActivityEvent,
  asSystem,
  ConnectedAccount,
  type DataSource,
  DomainEvent,
  type EntityManager,
  PublishIntent,
  SocialPost,
  StaffMember,
  withTenant,
} from '@ai-staff/db';
import { ProviderError, type SocialProviders } from '@ai-staff/social';
import type { Keyring } from '../crypto/keyring.js';

export type PublishOutcome = 'sent' | 'failed' | 'uncertain' | 'held' | 'blocked' | 'skipped';

export interface PublisherOptions {
  keyring: Keyring;
  providers: SocialProviders;
  now?: () => Date;
}

interface AccountSecrets {
  accessToken: string;
  refreshToken?: string | null;
}

/** Binding for a connected account's encrypted tokens, so they only decrypt on their own row. */
export const accountBinding = (account: Pick<ConnectedAccount, 'workspaceId' | 'id'>) =>
  `${account.workspaceId}:${account.id}`;

/** The parts of an intent the settle steps need. */
type IntentRef = Pick<PublishIntent, 'id' | 'accountId' | 'attempts'>;

const MINUTE = 60_000;
/** A publish stuck in `sending` this long belongs to a worker that died mid-publish. */
const STUCK_AFTER_MS = 10 * MINUTE;
/** How long an uncertain publish is checked against the network before a person is asked. */
const CHECK_FOR_MS = 30 * MINUTE;
const MAX_ATTEMPTS = 5;
/** Refresh a token this long before it expires, so a publish never meets an expired one. */
const REFRESH_AHEAD_MS = 10 * MINUTE;

/** Waits 5 minutes after the first rate limit, doubling, up to an hour. */
export const rateLimitBackoffMs = (attempt: number) =>
  Math.min(5 * MINUTE * 2 ** Math.max(0, attempt - 1), 60 * MINUTE);

/**
 * Publishes the posts staff have promised, once each. The claim is a row lock plus a state change and the network call
 * happens after the claim commits, so any number of workers can run it.
 *
 * - An auth error marks the account `broken`; its posts stay pending (they are not listed as due) and resume if the
 *   owner reconnects it.
 * - A rate limit defers the post with back-off; after five attempts it fails and the owner is told.
 * - A request that was sent and not answered is `uncertain`: the network is searched for the post before anyone
 *   resends, and a post that is not found is handed to a person, never retried automatically.
 */
export class PostPublisher {
  private readonly now: () => Date;

  constructor(
    private readonly db: DataSource,
    private readonly options: PublisherOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Pending publishes whose time has come, on accounts that are healthy. */
  async due(limit = 100): Promise<{ id: string; workspaceId: string; attempts: number; notBefore: Date }[]> {
    return asSystem(this.db, 'publisher: list publish intents that are due', async (m) => {
      const rows = (await m.query(
        `SELECT i.id, i.workspace_id, i.attempts, i.not_before
           FROM publish_intents i JOIN connected_accounts a ON a.id = i.account_id
          WHERE i.state = 'pending' AND i.not_before <= $1 AND a.health <> 'broken'
          ORDER BY i.not_before LIMIT $2`,
        [this.now(), limit],
      )) as { id: string; workspace_id: string; attempts: number; not_before: Date }[];
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        attempts: row.attempts,
        notBefore: new Date(row.not_before),
      }));
    });
  }

  /** Publishes claimed by a worker that never reported back become uncertain, and are then checked on the network. */
  async reapStuck(): Promise<number> {
    return asSystem(this.db, 'publisher: mark publishes abandoned mid-flight as uncertain', async (m) => {
      const raw = (await m.query(
        `UPDATE publish_intents SET state = 'uncertain', error = 'The worker stopped while publishing.', updated_at = now()
          WHERE state = 'sending' AND claimed_at < $1 RETURNING id`,
        [new Date(this.now().getTime() - STUCK_AFTER_MS)],
      )) as unknown[];
      return (Array.isArray(raw[0]) ? (raw[0] as unknown[]) : raw).length;
    });
  }

  /** Uncertain publishes to look into: the network is asked whether the post is there. */
  async uncertain(limit = 50): Promise<{ id: string; workspaceId: string }[]> {
    return asSystem(this.db, 'publisher: list uncertain publishes to check against the network', async (m) => {
      const rows = (await m.query(
        `SELECT id, workspace_id FROM publish_intents WHERE state = 'uncertain' ORDER BY claimed_at LIMIT $1`,
        [limit],
      )) as { id: string; workspace_id: string }[];
      return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id }));
    });
  }

  async dispatch(workspaceId: string, intentId: string): Promise<PublishOutcome> {
    const tenant = { workspaceId, userId: null };
    const claim = await withTenant(this.db, tenant, async (m) => {
      const intent = await m.findOne(PublishIntent, {
        where: { workspaceId, id: intentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!intent || intent.state !== 'pending') return { outcome: 'skipped' as const };
      const now = this.now();
      if (intent.notBefore > now) return { outcome: 'held' as const };
      const [account, post, staff] = await Promise.all([
        m.findOneBy(ConnectedAccount, { workspaceId, id: intent.accountId }),
        m.findOneBy(SocialPost, { workspaceId, id: intent.postId }),
        m.findOneBy(StaffMember, { workspaceId, id: intent.staffId }),
      ]);
      if (!account || !post || !staff || post.state !== 'scheduled') {
        await m.update(
          PublishIntent,
          { id: intent.id },
          { state: 'cancelled', error: 'The post or account no longer exists.' },
        );
        return { outcome: 'blocked' as const };
      }
      if (account.health === 'broken') return { outcome: 'held' as const };
      if (staff.state !== 'active') {
        await m.update(
          PublishIntent,
          { id: intent.id },
          { notBefore: new Date(now.getTime() + 60 * MINUTE), error: `${staff.displayName} is ${staff.state}.` },
        );
        return { outcome: 'held' as const };
      }
      await m.update(
        PublishIntent,
        { id: intent.id },
        { state: 'sending', claimedAt: now, attempts: intent.attempts + 1, error: null },
      );
      return {
        outcome: 'claimed' as const,
        intent: { ...intent, attempts: intent.attempts + 1 },
        account,
        post,
        staff,
      };
    });
    if (claim.outcome !== 'claimed') return claim.outcome;

    const { intent, account, post, staff } = claim;
    const provider = this.options.providers.get(account.network);
    try {
      const secrets = await this.freshSecrets(account, provider);
      const result = await provider.publishPost({
        accessToken: secrets.accessToken,
        externalId: account.externalId,
        body: post.body,
        mediaUrls: post.media,
        linkUrl: post.linkUrl,
        metadata: { username: account.username },
      });
      let note: string | null = result.note ?? null;
      if (post.firstComment && provider.addComment) {
        // The post is up; a first comment that fails must not turn it into a failed publish.
        await provider
          .addComment({
            accessToken: secrets.accessToken,
            externalId: account.externalId,
            externalPostId: result.externalPostId,
            message: post.firstComment,
          })
          .catch((error: unknown) => {
            note = `The post is up, but its first comment failed: ${(error as Error).message}`.slice(0, 300);
          });
      }
      await this.markPublished(workspaceId, intent, post, staff, result.externalPostId, result.permalink ?? null, note);
      return 'sent';
    } catch (error) {
      return this.settleFailure(workspaceId, intent, account, post, staff, error);
    }
  }

  /** Looks for an uncertain publish on the network. Found: it is sent. Not found for long enough: a person decides. */
  async reconcile(workspaceId: string, intentId: string): Promise<'found' | 'waiting' | 'gave_up' | 'skipped'> {
    const loaded = await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const intent = await m.findOneBy(PublishIntent, { workspaceId, id: intentId });
      if (!intent || intent.state !== 'uncertain') return null;
      const [account, post, staff] = await Promise.all([
        m.findOneBy(ConnectedAccount, { workspaceId, id: intent.accountId }),
        m.findOneBy(SocialPost, { workspaceId, id: intent.postId }),
        m.findOneBy(StaffMember, { workspaceId, id: intent.staffId }),
      ]);
      return account && post && staff ? { intent, account, post, staff } : null;
    });
    if (!loaded) return 'skipped';
    const { intent, account, post, staff } = loaded;
    const provider = this.options.providers.get(account.network);
    const since = new Date((intent.claimedAt ?? this.now()).getTime() - MINUTE);
    if (provider.findRecentPost) {
      try {
        const secrets = await this.freshSecrets(account, provider);
        const found = await provider.findRecentPost({
          accessToken: secrets.accessToken,
          externalId: account.externalId,
          bodyStart: post.body,
          since,
        });
        if (found) {
          await this.markPublished(
            workspaceId,
            intent,
            post,
            staff,
            found.externalPostId,
            found.permalink ?? null,
            'Found on the network after an unclear answer.',
          );
          return 'found';
        }
      } catch {
        // The check itself failed; try again on the next pass.
        return 'waiting';
      }
    }
    const waitedMs = this.now().getTime() - (intent.claimedAt ?? this.now()).getTime();
    if (provider.findRecentPost && waitedMs < CHECK_FOR_MS) return 'waiting';
    // Never retried automatically: it is not on the network, or the network cannot be asked. A person decides.
    await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      await m.update(
        PublishIntent,
        { id: intent.id },
        {
          state: 'failed',
          error: 'Could not confirm this post went up. Check the account, then queue it again if it did not.',
        },
      );
      await m.update(SocialPost, { id: post.id }, { state: 'failed' });
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'post.unconfirmed',
        `Could not confirm a post to ${account.name} went up. Check the account before posting it again.`,
        { postId: post.id },
      );
    });
    return 'gave_up';
  }

  private async markPublished(
    workspaceId: string,
    intent: IntentRef,
    post: SocialPost,
    staff: StaffMember,
    externalPostId: string,
    permalink: string | null,
    note: string | null,
  ) {
    await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const at = this.now();
      await m.update(
        PublishIntent,
        { id: intent.id },
        { state: 'sent', externalPostId, error: note?.slice(0, 400) ?? null },
      );
      await m.update(SocialPost, { id: post.id }, { state: 'published', publishedAt: at, externalPostId, permalink });
      await m.update(ConnectedAccount, { id: intent.accountId }, { lastCheckedAt: at });
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'post.published',
        `Published a post${permalink ? `: ${permalink}` : '.'}`,
        { postId: post.id, permalink },
      );
      // Metrics capture and engagement polling start from this event.
      await m.save(
        m.create(DomainEvent, {
          workspaceId,
          type: 'post.published',
          payload: { staffId: staff.id, postId: post.id, accountId: intent.accountId },
          sourceRunId: null,
          dispatchedAt: null,
        }),
      );
    });
  }

  private async settleFailure(
    workspaceId: string,
    intent: IntentRef,
    account: ConnectedAccount,
    post: SocialPost,
    staff: StaffMember,
    error: unknown,
  ): Promise<PublishOutcome> {
    const failure =
      error instanceof ProviderError
        ? error
        : new ProviderError(
            String((error as Error).message ?? error).slice(0, 300),
            account.network,
            'other',
            undefined,
            true,
          );
    return withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const message = failure.message.slice(0, 400);
      if (failure.kind === 'auth') {
        await m.update(ConnectedAccount, { id: account.id }, { health: 'broken', healthReason: message });
        await m.update(PublishIntent, { id: intent.id }, { state: 'pending', error: message, notBefore: this.now() });
        await this.activity(
          m,
          workspaceId,
          staff.id,
          'account.broken',
          `${account.name} needs to be reconnected, so its scheduled posts are paused: ${message}`,
          { accountId: account.id },
        );
        return 'held' as const;
      }
      if (failure.kind === 'rate_limit' && intent.attempts < MAX_ATTEMPTS) {
        await m.update(
          PublishIntent,
          { id: intent.id },
          {
            state: 'pending',
            error: message,
            notBefore: new Date(this.now().getTime() + rateLimitBackoffMs(intent.attempts)),
          },
        );
        return 'held' as const;
      }
      if (failure.unknownOutcome) {
        await m.update(PublishIntent, { id: intent.id }, { state: 'uncertain', error: message });
        await this.activity(
          m,
          workspaceId,
          staff.id,
          'post.uncertain',
          `A post to ${account.name} may or may not have gone up (${message}). We are checking, and it will not be posted again by itself.`,
          { postId: post.id },
        );
        return 'uncertain' as const;
      }
      await m.update(PublishIntent, { id: intent.id }, { state: 'failed', error: message });
      await m.update(SocialPost, { id: post.id }, { state: 'failed' });
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'post.failed',
        `A post to ${account.name} was refused: ${message}`,
        { postId: post.id },
      );
      return 'failed' as const;
    });
  }

  /** Decrypts the account's tokens, refreshing them first if they are about to expire. */
  private async freshSecrets(
    account: ConnectedAccount,
    provider: {
      refreshToken(
        token: string,
      ): Promise<{ accessToken: string; refreshToken?: string | null; expiresInSeconds?: number | null }>;
    },
  ): Promise<AccountSecrets> {
    const secrets = JSON.parse(
      this.options.keyring.decrypt(account.secretEnc, accountBinding(account)),
    ) as AccountSecrets;
    const expiring =
      account.tokenExpiresAt && account.tokenExpiresAt.getTime() - this.now().getTime() < REFRESH_AHEAD_MS;
    if (!expiring) return secrets;
    const refreshed = await provider.refreshToken(secrets.refreshToken ?? secrets.accessToken);
    // Some networks rotate the refresh token, so what comes back is always what gets stored.
    const next: AccountSecrets = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? secrets.refreshToken ?? null,
    };
    await withTenant(this.db, { workspaceId: account.workspaceId, userId: null }, (m) =>
      m.update(
        ConnectedAccount,
        { id: account.id },
        {
          secretEnc: this.options.keyring.encrypt(JSON.stringify(next), accountBinding(account)),
          tokenExpiresAt: refreshed.expiresInSeconds
            ? new Date(this.now().getTime() + refreshed.expiresInSeconds * 1000)
            : null,
        },
      ),
    );
    return next;
  }

  private async activity(
    m: EntityManager,
    workspaceId: string,
    staffId: string,
    type: string,
    summary: string,
    detail: Record<string, unknown>,
  ) {
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId,
        actor: 'system',
        type,
        summary: summary.slice(0, 300),
        detail,
        costUsd: null,
      }),
    );
  }
}
