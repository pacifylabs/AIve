import { ActivityEvent, asSystem, ConnectedAccount, type DataSource, withTenant } from '@ai-staff/db';
import { ProviderError } from '@ai-staff/social';
import type { Keyring } from '../crypto/keyring.js';
import { type AccountSecrets, accountBinding, type AccountTokens } from './account-tokens.js';

/** A login with no refresh token (Meta, Threads) is traded for a new one this long before it runs out. */
const RENEW_WITHIN_MS = 14 * 86_400_000;
/** If renewing keeps failing, or cannot be done, the person is told this long before the login runs out. */
const WARN_WITHIN_MS = 7 * 86_400_000;
/** What a warning starts with, so a later success can tell its own warning from some other reason. */
const WARNING_START = 'The login for';

export type HealthOutcome = 'renewed' | 'warned' | 'broken' | 'skipped';

/**
 * Looks after the logins of connected accounts before a post depends on them. A network whose login is renewed by
 * trading it for another (Meta, Threads) cannot be renewed once it has run out, and nothing used to touch a login unless a
 * post was due in its last ten minutes. So each login that runs out within two weeks is renewed here. If that fails the
 * account is marked `degraded` a week ahead, with the date, and `broken` when the network refuses the login or it
 * has run out, so the person sees it on the Accounts page and in the activity log instead of finding it by a failed post.
 * Logins that come with a refresh token renew themselves when a post needs them, and are left alone here.
 */
export class AccountHealth {
  constructor(
    private readonly db: DataSource,
    private readonly keyring: Keyring,
    private readonly tokens: AccountTokens,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sweep(): Promise<Record<HealthOutcome, number>> {
    const due = await asSystem(this.db, 'health: list accounts whose login runs out soon', async (m) => {
      const rows = (await m.query(
        `SELECT id, workspace_id FROM connected_accounts
          WHERE health <> 'broken' AND token_expires_at IS NOT NULL AND token_expires_at < $1
          ORDER BY token_expires_at LIMIT 200`,
        [new Date(this.now().getTime() + RENEW_WITHIN_MS)],
      )) as { id: string; workspace_id: string }[];
      return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id }));
    });
    const counts: Record<HealthOutcome, number> = { renewed: 0, warned: 0, broken: 0, skipped: 0 };
    for (const { id, workspaceId } of due) counts[await this.check(workspaceId, id)] += 1;
    return counts;
  }

  private async check(workspaceId: string, id: string): Promise<HealthOutcome> {
    const account = await withTenant(this.db, { workspaceId, userId: null }, (m) =>
      m.findOneBy(ConnectedAccount, { workspaceId, id }),
    );
    if (!account?.tokenExpiresAt || account.health === 'broken') return 'skipped';
    const secrets = JSON.parse(this.keyring.decrypt(account.secretEnc, accountBinding(account))) as AccountSecrets;
    if (secrets.refreshToken) return 'skipped';

    const remaining = account.tokenExpiresAt.getTime() - this.now().getTime();
    if (remaining <= 0) {
      await this.mark(
        account,
        'broken',
        `The login for ${account.name} has expired. Connect it again to post.`,
        'account.expired',
      );
      return 'broken';
    }
    try {
      // A login the network will not let us renew is not asked to: the person is warned a week ahead instead.
      if (!this.tokens.canRenew(account)) {
        if (remaining < WARN_WITHIN_MS && account.health === 'ok') {
          await this.warn(account, 'LinkedIn logins cannot be renewed in the background');
          return 'warned';
        }
        return 'skipped';
      }
      await this.tokens.renew(account, secrets);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 120) : 'unknown error';
      if (error instanceof ProviderError && error.kind === 'auth') {
        await this.mark(
          account,
          'broken',
          `${account.network} no longer accepts the login for ${account.name}. Connect it again to post.`,
          'account.expired',
        );
        return 'broken';
      }
      if (remaining < WARN_WITHIN_MS && account.health === 'ok') {
        await this.warn(account, `renewing it automatically did not work (${message})`);
        return 'warned';
      }
      return 'skipped';
    }
    if (account.health === 'degraded' && account.healthReason?.startsWith(WARNING_START)) {
      await withTenant(this.db, { workspaceId, userId: null }, (m) =>
        m.update(ConnectedAccount, { id }, { health: 'ok', healthReason: null }),
      );
    }
    return 'renewed';
  }

  private warn(account: ConnectedAccount, why: string) {
    const day = account.tokenExpiresAt!.toISOString().slice(0, 10);
    return this.mark(
      account,
      'degraded',
      `${WARNING_START} ${account.name} runs out on ${day}: ${why}. Connect it again to keep posting.`,
      'account.expiring',
    );
  }

  private async mark(account: ConnectedAccount, health: 'degraded' | 'broken', reason: string, type: string) {
    await withTenant(this.db, { workspaceId: account.workspaceId, userId: null }, async (m) => {
      await m.update(ConnectedAccount, { id: account.id }, { health, healthReason: reason.slice(0, 400) });
      await m.save(
        m.create(ActivityEvent, {
          workspaceId: account.workspaceId,
          staffId: null,
          actor: 'system',
          type,
          summary: reason.slice(0, 300),
          detail: { accountId: account.id, network: account.network },
          costUsd: null,
        }),
      );
    });
  }
}
