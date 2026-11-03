import {
  ActivityEvent,
  asSystem,
  ConnectedAccount,
  type DataSource,
  type EntityManager,
  ReplyIntent,
  SocialEngagement,
  StaffMember,
  withTenant,
} from '@ai-staff/db';
import { ProviderError, type SocialProviders } from '@ai-staff/social';
import type { AccountTokens } from './account-tokens.js';
import { rateLimitBackoffMs } from './publisher.js';

export type ReplyOutcome = 'sent' | 'failed' | 'uncertain' | 'held' | 'blocked' | 'skipped';

const MAX_ATTEMPTS = 5;
const STUCK_AFTER_MS = 10 * 60_000;

export interface ReplySenderOptions {
  providers: SocialProviders;
  tokens: AccountTokens;
  now?: () => Date;
}

/**
 * Sends replies a person approved, once each. The network's reply window and the account's health are checked again at
 * the moment of sending, and a request whose outcome is unknown is never retried: answering a public comment twice is
 * worse than not answering, so a person decides.
 */
export class ReplySender {
  private readonly now: () => Date;

  constructor(
    private readonly db: DataSource,
    private readonly options: ReplySenderOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async due(limit = 100): Promise<{ id: string; workspaceId: string; attempts: number; notBefore: Date }[]> {
    return asSystem(this.db, 'reply sender: list approved replies that are due', async (m) => {
      const rows = (await m.query(
        `SELECT r.id, r.workspace_id, r.attempts, r.not_before
           FROM reply_intents r JOIN connected_accounts a ON a.id = r.account_id
          WHERE r.state = 'pending' AND r.not_before <= $1 AND a.health <> 'broken'
          ORDER BY r.not_before LIMIT $2`,
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

  /** Replies claimed by a worker that never reported back: unknown whether they went, so a person decides. */
  async reapStuck(): Promise<number> {
    return asSystem(this.db, 'reply sender: mark replies abandoned mid-flight as uncertain', async (m) => {
      const raw = (await m.query(
        `UPDATE reply_intents SET state = 'uncertain', error = 'The worker stopped while sending.', updated_at = now()
          WHERE state = 'sending' AND claimed_at < $1 RETURNING id`,
        [new Date(this.now().getTime() - STUCK_AFTER_MS)],
      )) as unknown[];
      return (Array.isArray(raw[0]) ? (raw[0] as unknown[]) : raw).length;
    });
  }

  async dispatch(workspaceId: string, intentId: string): Promise<ReplyOutcome> {
    const claim = await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const intent = await m.findOne(ReplyIntent, {
        where: { workspaceId, id: intentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!intent || intent.state !== 'pending') return { outcome: 'skipped' as const };
      const now = this.now();
      if (intent.notBefore > now) return { outcome: 'held' as const };
      const [account, engagement, staff] = await Promise.all([
        m.findOneBy(ConnectedAccount, { workspaceId, id: intent.accountId }),
        m.findOneBy(SocialEngagement, { workspaceId, id: intent.engagementId }),
        m.findOneBy(StaffMember, { workspaceId, id: intent.staffId }),
      ]);
      if (!account || !engagement || !staff) {
        await m.update(
          ReplyIntent,
          { id: intent.id },
          { state: 'cancelled', error: 'The comment or account no longer exists.' },
        );
        return { outcome: 'blocked' as const };
      }
      if (account.health === 'broken') return { outcome: 'held' as const };
      if (engagement.replyWindowEndsAt && now > engagement.replyWindowEndsAt) {
        await m.update(
          ReplyIntent,
          { id: intent.id },
          { state: 'cancelled', error: "The network's reply window closed before this was sent." },
        );
        await this.activity(
          m,
          workspaceId,
          staff.id,
          'reply.window_closed',
          `The reply to ${engagement.authorName ?? 'someone'} was not sent: the network's reply window closed.`,
        );
        return { outcome: 'blocked' as const };
      }
      await m.update(
        ReplyIntent,
        { id: intent.id },
        { state: 'sending', claimedAt: now, attempts: intent.attempts + 1, error: null },
      );
      return {
        outcome: 'claimed' as const,
        intent: { ...intent, attempts: intent.attempts + 1 },
        account,
        engagement,
        staff,
      };
    });
    if (claim.outcome !== 'claimed') return claim.outcome;

    const { intent, account, engagement, staff } = claim;
    const provider = this.options.providers.get(account.network);
    try {
      const secrets = await this.options.tokens.fresh(account);
      if (engagement.kind === 'dm') {
        if (!provider.replyToMessage || !engagement.threadId)
          throw new ProviderError(`${account.name} cannot answer private messages from here.`, account.network);
        await provider.replyToMessage({
          accessToken: secrets.accessToken,
          externalId: account.externalId,
          recipientId: engagement.threadId,
          message: intent.message,
        });
      } else {
        if (!provider.replyToComment)
          throw new ProviderError(`${account.name} cannot answer comments from here.`, account.network);
        await provider.replyToComment({
          accessToken: secrets.accessToken,
          externalId: account.externalId,
          externalPostId: engagement.externalId,
          message: intent.message,
        });
      }
      await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
        await m.update(ReplyIntent, { id: intent.id }, { state: 'sent' });
        await m.update(SocialEngagement, { id: engagement.id }, { state: 'replied' });
        await this.activity(
          m,
          workspaceId,
          staff.id,
          'reply.sent',
          `Replied to ${engagement.authorName ?? 'someone'} on ${account.name}.`,
        );
      });
      return 'sent';
    } catch (error) {
      return this.settleFailure(workspaceId, intent, account, staff, error);
    }
  }

  private async settleFailure(
    workspaceId: string,
    intent: Pick<ReplyIntent, 'id' | 'attempts'>,
    account: ConnectedAccount,
    staff: StaffMember,
    error: unknown,
  ): Promise<ReplyOutcome> {
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
        await m.update(ReplyIntent, { id: intent.id }, { state: 'pending', error: message, notBefore: this.now() });
        await this.activity(
          m,
          workspaceId,
          staff.id,
          'account.broken',
          `${account.name} needs to be reconnected, so replies are paused: ${message}`,
        );
        return 'held' as const;
      }
      if (failure.kind === 'rate_limit' && intent.attempts < MAX_ATTEMPTS) {
        await m.update(
          ReplyIntent,
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
        await m.update(ReplyIntent, { id: intent.id }, { state: 'uncertain', error: message });
        await this.activity(
          m,
          workspaceId,
          staff.id,
          'reply.uncertain',
          `A reply on ${account.name} may or may not have gone out (${message}). Check before replying again.`,
        );
        return 'uncertain' as const;
      }
      await m.update(ReplyIntent, { id: intent.id }, { state: 'failed', error: message });
      await this.activity(
        m,
        workspaceId,
        staff.id,
        'reply.failed',
        `A reply on ${account.name} was refused: ${message}`,
      );
      return 'failed' as const;
    });
  }

  private async activity(m: EntityManager, workspaceId: string, staffId: string, type: string, summary: string) {
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId,
        actor: 'system',
        type,
        summary: summary.slice(0, 300),
        detail: {},
        costUsd: null,
      }),
    );
  }
}
