import { asSystem, ConnectedAccount, type DataSource, withTenant } from '@ai-staff/db';
import type { SocialProviders } from '@ai-staff/social';
import { v7 as uuidv7 } from 'uuid';
import type { AccountTokens } from './account-tokens.js';

/**
 * Once a day, asks each healthy account's network how many people follow it, and how many times its posts were shown
 * the day before, and keeps the answers, one row per account per
 * day (UTC). A second capture on the same day replaces the first. A network that does not say, or an account that
 * fails, is skipped without stopping the others, and no number is invented for it: a missing day is a gap on the chart.
 */
export class AccountStats {
  constructor(
    private readonly db: DataSource,
    private readonly providers: SocialProviders,
    private readonly tokens: AccountTokens,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async capture(): Promise<{ captured: number; failed: number; skipped: number }> {
    const accounts = await asSystem(this.db, 'stats: list healthy accounts to capture followers for', async (m) => {
      const rows = (await m.query(`SELECT id, workspace_id FROM connected_accounts WHERE health <> 'broken'`)) as {
        id: string;
        workspace_id: string;
      }[];
      return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id }));
    });
    const day = this.now().toISOString().slice(0, 10);
    const before = new Date(this.now().getTime() - 86_400_000).toISOString().slice(0, 10);
    const counts = { captured: 0, failed: 0, skipped: 0 };
    for (const { id, workspaceId } of accounts) {
      const account = await withTenant(this.db, { workspaceId, userId: null }, (m) =>
        m.findOneBy(ConnectedAccount, { workspaceId, id }),
      );
      const provider = account && this.providers.get(account.network);
      if (!account || !provider?.fetchFollowers) {
        counts.skipped += 1;
        continue;
      }
      try {
        const secrets = await this.tokens.fresh(account);
        const followers = await provider.fetchFollowers({
          accessToken: secrets.accessToken,
          externalId: account.externalId,
        });
        // Reach is a bonus: a network that refuses it (the app lacks the permission) still keeps its follower count.
        const reach = await provider
          .fetchReach?.({ accessToken: secrets.accessToken, externalId: account.externalId, day: before })
          .catch(() => null);
        await withTenant(this.db, { workspaceId, userId: null }, (m) =>
          m.query(
            `INSERT INTO account_stats (id, workspace_id, account_id, day, followers, reach)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (account_id, day) DO UPDATE
               SET followers = EXCLUDED.followers, reach = EXCLUDED.reach, updated_at = now()`,
            [
              uuidv7(),
              workspaceId,
              id,
              day,
              Math.max(0, Math.round(followers)),
              typeof reach === 'number' ? Math.max(0, Math.round(reach)) : null,
            ],
          ),
        );
        counts.captured += 1;
      } catch {
        counts.failed += 1;
      }
    }
    return counts;
  }
}
