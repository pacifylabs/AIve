import { ConnectedAccount, type DataSource, withTenant } from '@ai-staff/db';
import type { SocialProviders } from '@ai-staff/social';
import type { Keyring } from '../crypto/keyring.js';

export interface AccountSecrets {
  accessToken: string;
  refreshToken?: string | null;
}

/** Binding for a connected account's encrypted tokens, so they only decrypt on their own row. */
export const accountBinding = (account: Pick<ConnectedAccount, 'workspaceId' | 'id'>) =>
  `${account.workspaceId}:${account.id}`;

/** Refresh a token this long before it expires, so a call never meets an expired one. */
const REFRESH_AHEAD_MS = 10 * 60_000;

/** Decrypts a connected account's tokens, refreshing and storing new ones first if they are about to expire. */
export class AccountTokens {
  constructor(
    private readonly db: DataSource,
    private readonly keyring: Keyring,
    private readonly providers: SocialProviders,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async fresh(account: ConnectedAccount): Promise<AccountSecrets> {
    const secrets = JSON.parse(this.keyring.decrypt(account.secretEnc, accountBinding(account))) as AccountSecrets;
    const expiring =
      account.tokenExpiresAt && account.tokenExpiresAt.getTime() - this.now().getTime() < REFRESH_AHEAD_MS;
    if (!expiring) return secrets;
    const refreshed = await this.providers
      .get(account.network)
      .refreshToken(secrets.refreshToken ?? secrets.accessToken);
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
          secretEnc: this.keyring.encrypt(JSON.stringify(next), accountBinding(account)),
          tokenExpiresAt: refreshed.expiresInSeconds
            ? new Date(this.now().getTime() + refreshed.expiresInSeconds * 1000)
            : null,
        },
      ),
    );
    return next;
  }
}
