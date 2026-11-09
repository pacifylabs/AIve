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
import {
  isPendingPublish,
  type PendingPublish,
  type ProviderError as ProviderErrorType,
  ProviderError,
  type PublishResult,
  type SocialProvider,
  type SocialProviders,
} from '@ai-staff/social';
import type { Keyring } from '../crypto/keyring.js';
import { AccountTokens } from './account-tokens.js';

export type PublishOutcome = 'sent' | 'failed' | 'uncertain' | 'held' | 'blocked' | 'skipped' | 'processing';

/** What one look at a post the network is still working on came to. */
export type CheckOutcome = 'sent' | 'processing' | 'failed' | 'uncertain' | 'held' | 'skipped';

export interface PublisherOptions {
  keyring: Keyring;
  providers: SocialProviders;
  now?: () => Date;
  /** Waits between tries of a chain's follow-up; replaced in tests so they do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** The parts of an intent the settle steps need. */
type IntentRef = Pick<PublishIntent, 'id' | 'accountId' | 'attempts'>;

const MINUTE = 60_000;
/** A publish stuck in `sending` this long belongs to a worker that died mid-publish. */
const STUCK_AFTER_MS = 10 * MINUTE;
/** Each part of a chain is tried this many times before the rest is handed to a person. */
const FOLLOW_UP_ATTEMPTS = 3;
/** A post this far past its time is held for a person instead of going out late. */
const STALE_AFTER_MS = 24 * 60 * MINUTE;
/** How long an uncertain publish is checked against the network before a person is asked. */
const CHECK_FOR_MS = 30 * MINUTE;
const MAX_ATTEMPTS = 5;
/** A network still working on a post this long after it took it is treated as unconfirmed, and a person is asked. */
const PROCESSING_TIMEOUT_MS = 30 * MINUTE;
/** A worker that looks at a ticket owns it this long; if it dies, the ticket is looked at again after this. */
const CHECK_LEASE_MS = 2 * MINUTE;
/** Looks come 15 seconds apart at first, then further apart, never more than 5 minutes. */
export const checkDelayMs = (checks: number) => Math.min(15_000 * 2 ** Math.min(checks, 5), 5 * MINUTE);

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
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly tokens: AccountTokens;

  constructor(
    private readonly db: DataSource,
    private readonly options: PublisherOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.tokens = new AccountTokens(db, options.keyring, options.providers, this.now);
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

  /** Posts the network is still working on whose next look has come, on accounts that are healthy. */
  async dueChecks(limit = 100): Promise<{ id: string; workspaceId: string; checks: number }[]> {
    return asSystem(this.db, 'publisher: list pending publishes to look at again', async (m) => {
      const rows = (await m.query(
        `SELECT i.id, i.workspace_id, i.checks
           FROM publish_intents i JOIN connected_accounts a ON a.id = i.account_id
          WHERE i.state = 'processing' AND i.check_after <= $1 AND a.health <> 'broken'
          ORDER BY i.check_after LIMIT $2`,
        [this.now(), limit],
      )) as { id: string; workspace_id: string; checks: number }[];
      return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, checks: row.checks }));
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

  /**
   * A post that has waited more than a day past its time (the worker was down, or the account was broken and has just been
   * reconnected) is not published late by itself: a stale offer or a missed date can do harm. It is marked failed with a
   * reason, which puts it under "Needs you" on the calendar, where a person chooses to post it now or leave it.
   */
  async holdStale(): Promise<number> {
    return asSystem(this.db, 'publisher: hold posts that are more than a day past their time', async (m) => {
      const raw = (await m.query(
        `UPDATE publish_intents i
            SET state = 'failed', error = 'This post was more than a day late, so it was held for you to decide.',
                updated_at = now()
           FROM connected_accounts a
          WHERE a.id = i.account_id AND i.state = 'pending' AND i.not_before < $1
      RETURNING i.id, i.workspace_id, i.post_id, i.staff_id, a.name AS account_name`,
        [new Date(this.now().getTime() - STALE_AFTER_MS)],
      )) as unknown[];
      // An UPDATE ... RETURNING answers with the rows, or with the rows and a count, depending on the driver.
      const held = (Array.isArray(raw[0]) ? raw[0] : raw) as {
        workspace_id: string;
        post_id: string;
        staff_id: string;
        account_name: string;
      }[];
      for (const row of held) {
        await m.query(
          `UPDATE social_posts SET state = 'failed', updated_at = now() WHERE id = $1 AND state = 'scheduled'`,
          [row.post_id],
        );
        await this.activity(
          m,
          row.workspace_id,
          row.staff_id,
          'post.missed',
          `A post to ${row.account_name} was more than a day late and is held for you.`,
          { postId: row.post_id },
        );
      }
      return held.length;
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
      const secrets = await this.tokens.fresh(account);
      const result = await provider.publishPost({
        accessToken: secrets.accessToken,
        externalId: account.externalId,
        body: post.body,
        mediaUrls: post.media,
        linkUrl: post.linkUrl,
        metadata: { username: account.username },
        idempotencyKey: intent.idempotencyKey,
      });
      if (isPendingPublish(result)) {
        return await this.markProcessing(workspaceId, intent, post, staff, account, provider, result.pending);
      }
      await this.finishPublished(workspaceId, intent, account, post, staff, provider, secrets.accessToken, result);
      return 'sent';
    } catch (error) {
      return this.settleFailure(workspaceId, intent, account, post, staff, error);
    }
  }

  /** The post is up: adds the first comment if there is one, then records it as published. */
  private async finishPublished(
    workspaceId: string,
    intent: IntentRef,
    account: ConnectedAccount,
    post: SocialPost,
    staff: StaffMember,
    provider: SocialProvider,
    accessToken: string,
    result: PublishResult,
  ) {
    let note: string | null = result.note ?? null;
    if (post.firstComment && provider.addComment) {
      // The post is up; a first comment that fails must not turn it into a failed publish.
      await provider
        .addComment({
          accessToken,
          externalId: account.externalId,
          externalPostId: result.externalPostId,
          message: post.firstComment,
        })
        .catch((error: unknown) => {
          note = `The post is up, but its first comment failed: ${(error as Error).message}`.slice(0, 300);
        });
    }
    const chain = await this.sendFollowUps(account, post, provider, accessToken, result.externalPostId);
    if (chain.error) note = chain.error;
    await this.markPublished(
      workspaceId,
      intent,
      post,
      staff,
      result.externalPostId,
      result.permalink ?? null,
      note,
      chain,
    );
  }

  /**
   * Sends a chain's follow-ups in order, each as a reply to the one before it (to the first post, where the network gives
   * no id for a reply). A part is tried three times, with a longer wait each time. It is not tried again when the network
   * refuses the login, or when the request was sent and never answered, since that reply may already be up. The first
   * part that cannot be sent ends the chain: what went out stays, the rest is left, and a person is told.
   */
  private async sendFollowUps(
    account: ConnectedAccount,
    post: SocialPost,
    provider: SocialProvider,
    accessToken: string,
    firstId: string,
  ): Promise<{ sent: number; error: string | null }> {
    const parts = post.followUps ?? [];
    if (!parts.length) return { sent: 0, error: null };
    if (!provider.addComment)
      return { sent: 0, error: `${account.network} cannot post a chain, so only the first post went out.` };
    let replyTo = firstId;
    let sent = 0;
    for (const message of parts) {
      let failure = '';
      for (let attempt = 1; attempt <= FOLLOW_UP_ATTEMPTS; attempt += 1) {
        try {
          const reply = await provider.addComment({
            accessToken,
            externalId: account.externalId,
            externalPostId: replyTo,
            message,
          });
          if (reply?.externalPostId) replyTo = reply.externalPostId;
          failure = '';
          break;
        } catch (error) {
          failure = (error as Error).message;
          const cannotRetry = error instanceof ProviderError && (error.kind === 'auth' || error.unknownOutcome);
          if (cannotRetry || attempt === FOLLOW_UP_ATTEMPTS) break;
          await this.sleep(attempt * 2_000);
        }
      }
      if (failure) {
        const left = parts.length - sent;
        return {
          sent,
          error:
            `Part ${sent + 2} of ${parts.length + 1} was not posted: ${failure.replace(/\.$/, '')}. ${left} ${left === 1 ? 'part was' : 'parts were'} left unposted.`.slice(
              0,
              300,
            ),
        };
      }
      sent += 1;
    }
    return { sent, error: null };
  }

  /** The network took the post and is still working on it. The ticket is kept, and it is looked at again later. */
  private async markProcessing(
    workspaceId: string,
    intent: IntentRef,
    post: SocialPost,
    staff: StaffMember,
    account: ConnectedAccount,
    provider: SocialProvider,
    pending: PendingPublish,
  ): Promise<PublishOutcome> {
    return withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      if (!provider.checkPublish) {
        // A network that cannot be asked again cannot be waited for, and the post may be up.
        await m.update(
          PublishIntent,
          { id: intent.id },
          { state: 'uncertain', error: 'The network is still working on it, and cannot be asked again.' },
        );
        return 'uncertain' as const;
      }
      const now = this.now();
      // A query, not `update`: TypeORM's update typing cannot take a free-form JSON object for a jsonb column.
      await m.query(
        `UPDATE publish_intents
            SET state = 'processing', ticket = $2, ticket_data = $3::jsonb, processing_since = $4, check_after = $5,
                checks = 0, error = NULL, updated_at = now()
          WHERE id = $1`,
        [
          intent.id,
          pending.ticket.slice(0, 300),
          JSON.stringify(pending.data ?? {}),
          now,
          new Date(now.getTime() + (pending.checkAfterSeconds ?? 15) * 1000),
        ],
      );
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'post.processing',
        `${account.name} is still processing a post. We will check again, and publish it when it is ready.`,
        { postId: post.id },
      );
      return 'processing' as const;
    });
  }

  /**
   * One look at a post the network is still working on. Ready: it is published (the provider does the last step).
   * Still working: look again later, with longer gaps, until it has taken 30 minutes, then a person is asked. A look that
   * fails changes nothing about the post; only a refusal, or a last step sent and never answered, settles it.
   * A post is never published a second time from here.
   */
  async check(workspaceId: string, intentId: string): Promise<CheckOutcome> {
    const tenant = { workspaceId, userId: null };
    const claim = await withTenant(this.db, tenant, async (m) => {
      const intent = await m.findOne(PublishIntent, {
        where: { workspaceId, id: intentId },
        lock: { mode: 'pessimistic_write' },
      });
      const now = this.now();
      if (!intent || intent.state !== 'processing' || !intent.ticket) return { outcome: 'skipped' as const };
      if (!intent.checkAfter || intent.checkAfter > now) return { outcome: 'skipped' as const };
      const [account, post, staff] = await Promise.all([
        m.findOneBy(ConnectedAccount, { workspaceId, id: intent.accountId }),
        m.findOneBy(SocialPost, { workspaceId, id: intent.postId }),
        m.findOneBy(StaffMember, { workspaceId, id: intent.staffId }),
      ]);
      if (!account || !post || !staff) {
        await m.update(
          PublishIntent,
          { id: intent.id },
          { state: 'cancelled', error: 'The post or account no longer exists.' },
        );
        return { outcome: 'skipped' as const };
      }
      if (account.health === 'broken') return { outcome: 'skipped' as const };
      // The lease: no other worker looks at this ticket until this one has had its turn.
      await m.update(PublishIntent, { id: intent.id }, { checkAfter: new Date(now.getTime() + CHECK_LEASE_MS) });
      return { outcome: 'claimed' as const, intent, account, post, staff };
    });
    if (claim.outcome !== 'claimed') return 'skipped';

    const { intent, account, post, staff } = claim;
    const provider = this.options.providers.get(account.network);
    const waitingSince = intent.processingSince ?? this.now();
    try {
      if (!provider.checkPublish) throw new ProviderError('This network cannot be asked again.', account.network);
      const secrets = await this.tokens.fresh(account);
      const found = await provider.checkPublish({
        accessToken: secrets.accessToken,
        externalId: account.externalId,
        ticket: intent.ticket!,
        data: intent.ticketData,
        body: post.body,
        metadata: { username: account.username },
      });
      switch (found.state) {
        case 'ready':
          await this.finishPublished(
            workspaceId,
            intent,
            account,
            post,
            staff,
            provider,
            secrets.accessToken,
            found.result,
          );
          return 'sent';
        case 'failed':
          await this.settleProcessingFailed(workspaceId, intent, account, post, staff, found.message);
          return 'failed';
        case 'uncertain':
          await this.settleProcessingUncertain(workspaceId, intent, account, post, staff, found.message, waitingSince);
          return 'uncertain';
        case 'processing':
          return await this.lookAgain(workspaceId, intent, account, post, staff, waitingSince, found.checkAfterSeconds);
      }
    } catch (error) {
      return this.settleCheckError(workspaceId, intent, account, post, staff, error, waitingSince);
    }
  }

  /** Schedules the next look, or asks a person once the network has taken too long. */
  private async lookAgain(
    workspaceId: string,
    intent: PublishIntent,
    account: ConnectedAccount,
    post: SocialPost,
    staff: StaffMember,
    waitingSince: Date,
    checkAfterSeconds?: number,
    minimumDelayMs = 0,
  ): Promise<CheckOutcome> {
    const now = this.now();
    if (now.getTime() - waitingSince.getTime() >= PROCESSING_TIMEOUT_MS) {
      await this.settleProcessingUncertain(
        workspaceId,
        intent,
        account,
        post,
        staff,
        'The network was still working on it after 30 minutes.',
        waitingSince,
      );
      return 'uncertain';
    }
    const delay = Math.max(
      minimumDelayMs,
      checkAfterSeconds ? checkAfterSeconds * 1000 : checkDelayMs(intent.checks + 1),
    );
    await withTenant(this.db, { workspaceId, userId: null }, (m) =>
      m.update(
        PublishIntent,
        { id: intent.id },
        { checkAfter: new Date(now.getTime() + delay), checks: intent.checks + 1 },
      ),
    );
    return 'processing';
  }

  private async settleProcessingFailed(
    workspaceId: string,
    intent: IntentRef,
    account: ConnectedAccount,
    post: SocialPost,
    staff: StaffMember,
    message: string,
  ) {
    await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      await m.update(
        PublishIntent,
        { id: intent.id },
        { state: 'failed', error: message.slice(0, 400), checkAfter: null },
      );
      await m.update(SocialPost, { id: post.id }, { state: 'failed' });
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'post.failed',
        `A post to ${account.name} was refused: ${message}`,
        {
          postId: post.id,
        },
      );
    });
  }

  /**
   * The post may be up and cannot be confirmed. It is never published again by itself: it goes to the same check as any
   * unclear publish, which looks for it on the network and then asks a person. The wait is counted from when the
   * network first took it, so that search covers the whole time.
   */
  private async settleProcessingUncertain(
    workspaceId: string,
    intent: IntentRef,
    account: ConnectedAccount,
    post: SocialPost,
    staff: StaffMember,
    message: string,
    waitingSince: Date,
  ) {
    await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      await m.update(
        PublishIntent,
        { id: intent.id },
        { state: 'uncertain', error: message.slice(0, 400), claimedAt: waitingSince, checkAfter: null },
      );
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'post.uncertain',
        `A post to ${account.name} may or may not have gone up (${message}). We are checking, and it will not be posted again by itself.`,
        { postId: post.id },
      );
    });
  }

  private async settleCheckError(
    workspaceId: string,
    intent: PublishIntent,
    account: ConnectedAccount,
    post: SocialPost,
    staff: StaffMember,
    error: unknown,
    waitingSince: Date,
  ): Promise<CheckOutcome> {
    const failure: ProviderErrorType | null = error instanceof ProviderError ? error : null;
    if (failure?.kind === 'auth') {
      // Nothing is lost by waiting: the post stays as it is and the looks resume when the account is reconnected.
      const message = failure.message.slice(0, 400);
      await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
        await m.update(ConnectedAccount, { id: account.id }, { health: 'broken', healthReason: message });
        await m.update(PublishIntent, { id: intent.id }, { checkAfter: new Date(this.now().getTime() + 10 * MINUTE) });
        await this.activity(
          m,
          workspaceId,
          staff.id,
          'account.broken',
          `${account.name} needs to be reconnected, so a post it is still processing cannot be checked: ${message}`,
          { accountId: account.id },
        );
      });
      return 'held';
    }
    if (failure && failure.kind !== 'rate_limit' && !failure.unknownOutcome) {
      // A refusal that is definite: nothing was published.
      await this.settleProcessingFailed(workspaceId, intent, account, post, staff, failure.message);
      return 'failed';
    }
    // A limit, or a look that failed to get an answer: it says nothing about the post, so look again later.
    return this.lookAgain(
      workspaceId,
      intent,
      account,
      post,
      staff,
      waitingSince,
      undefined,
      failure?.kind === 'rate_limit' ? 5 * MINUTE : 0,
    );
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
        const secrets = await this.tokens.fresh(account);
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
    chain: { sent: number; error: string | null } = { sent: 0, error: null },
  ) {
    await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const at = this.now();
      await m.update(
        PublishIntent,
        { id: intent.id },
        { state: 'sent', externalPostId, error: note?.slice(0, 400) ?? null },
      );
      await m.update(
        SocialPost,
        { id: post.id },
        {
          state: 'published',
          publishedAt: at,
          externalPostId,
          permalink,
          followUpsSent: chain.sent,
          followUpError: chain.error,
        },
      );
      await m.update(ConnectedAccount, { id: intent.accountId }, { lastCheckedAt: at });
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'post.published',
        `Published a post${permalink ? `: ${permalink}` : '.'}`,
        { postId: post.id, permalink },
      );
      if (chain.error) {
        await this.activity(m, workspaceId, staff.id, 'post.chain_incomplete', chain.error, {
          postId: post.id,
          sent: chain.sent,
        });
      }
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
