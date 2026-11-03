import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { accountBinding, Keyring } from '@ai-staff/core';
import {
  AuditEntry,
  ConnectedAccount,
  DataSource,
  type EntityManager,
  PublishIntent,
  SocialPost,
  withTenant,
} from '@ai-staff/db';
import {
  type ProviderAccount,
  ProviderError,
  type ProviderTokens,
  SOCIAL_NETWORKS,
  type SocialNetwork,
  SocialProviders,
} from '@ai-staff/social';
import { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { REDIS } from '../redis/redis.module.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

const STATE_TTL_SEC = 10 * 60;
const PENDING_TTL_SEC = 15 * 60;

export const isNetwork = (value: string): value is SocialNetwork =>
  (SOCIAL_NETWORKS as readonly string[]).includes(value);

interface OAuthState {
  workspaceId: string;
  userId: string;
  network: SocialNetwork;
  codeVerifier: string | null;
}

/** The accounts a person may choose from after signing in. The tokens inside `sealed` are encrypted. */
interface PendingConnection {
  workspaceId: string;
  userId: string;
  network: SocialNetwork;
  sealed: string;
  accounts: Pick<ProviderAccount, 'externalId' | 'name' | 'username' | 'kind'>[];
}

/** An account as the API shows it: never the tokens. */
export const publicAccount = (account: ConnectedAccount) => ({
  id: account.id,
  network: account.network,
  name: account.name,
  username: account.username,
  health: account.health,
  healthReason: account.healthReason,
  tokenExpiresAt: account.tokenExpiresAt,
  lastCheckedAt: account.lastCheckedAt,
});

@Injectable()
export class SocialAccountsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SocialProviders) private readonly providers: SocialProviders,
    @Inject(Keyring) private readonly keyring: Keyring,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  private redirectUri(network: SocialNetwork) {
    const origin = (this.config.API_PUBLIC_URL ?? `http://localhost:${this.config.API_PORT}`).replace(/\/+$/, '');
    return `${origin}/v1/social/callback/${network}`;
  }

  catalogue() {
    return this.providers.catalogue();
  }

  list(ctx: WorkspaceContext) {
    return this.tx(ctx, async (m) =>
      (await m.find(ConnectedAccount, { where: { workspaceId: ctx.workspaceId }, order: { createdAt: 'ASC' } })).map(
        publicAccount,
      ),
    );
  }

  /** The first half of connecting: where to send the person to sign in. The state ties the way back to them. */
  async start(ctx: WorkspaceContext, network: SocialNetwork) {
    const provider = this.providers.get(network);
    if (!provider.isConfigured()) {
      throw AppError.conflict(
        `${provider.label} is not set up on this server yet. Ask whoever runs it to add its app credentials.`,
      );
    }
    const state = randomBytes(24).toString('base64url');
    const codeVerifier = provider.usesPkce ? randomBytes(48).toString('base64url') : null;
    const record: OAuthState = { workspaceId: ctx.workspaceId, userId: ctx.userId, network, codeVerifier };
    await this.redis.set(`social:oauth:${state}`, JSON.stringify(record), 'EX', STATE_TTL_SEC);
    return {
      authUrl: provider.getAuthUrl({
        redirectUri: this.redirectUri(network),
        state,
        codeChallenge: codeVerifier ? createHash('sha256').update(codeVerifier).digest('base64url') : undefined,
      }),
    };
  }

  /**
   * The network sends the browser back here with a code. The state is used once, the code is traded for tokens, and the
   * accounts the person can post to are held (encrypted, 15 minutes) for them to choose from. Returns where to send the
   * browser next: it never answers with something the person cannot read.
   */
  async callback(network: SocialNetwork, query: { code?: string; state?: string; error?: string }): Promise<string> {
    const web = `${this.config.WEB_ORIGIN.replace(/\/+$/, '')}/app/accounts`;
    const back = (params: Record<string, string>) => `${web}?${new URLSearchParams(params)}`;
    if (!query.state) return back({ error: 'The connection was not completed.' });
    // GETDEL: a state can be used once, so a replayed callback does nothing.
    const stored = await this.redis.getdel(`social:oauth:${query.state}`);
    if (!stored) return back({ error: 'That connection expired. Start again.' });
    const state = JSON.parse(stored) as OAuthState;
    if (state.network !== network) return back({ error: 'That connection did not match. Start again.' });
    if (query.error || !query.code) return back({ error: 'You did not allow access, so nothing was connected.' });
    const provider = this.providers.get(network);
    try {
      const tokens = await provider.exchangeCode({
        code: query.code,
        redirectUri: this.redirectUri(network),
        codeVerifier: state.codeVerifier,
      });
      const accounts = await provider.listAccounts(tokens);
      if (!accounts.length) return back({ error: `No ${provider.label} you can post to was found on that login.` });
      const id = randomBytes(18).toString('base64url');
      const pending: PendingConnection = {
        workspaceId: state.workspaceId,
        userId: state.userId,
        network,
        sealed: this.keyring.encrypt(JSON.stringify({ tokens, accounts }), `pending:${id}`),
        accounts: accounts.map(({ externalId, name, username, kind }) => ({ externalId, name, username, kind })),
      };
      await this.redis.set(`social:pending:${id}`, JSON.stringify(pending), 'EX', PENDING_TTL_SEC);
      return back({ pending: id });
    } catch (error) {
      return back({
        error: error instanceof ProviderError ? error.message.slice(0, 200) : 'The connection failed. Try again.',
      });
    }
  }

  private async loadPending(ctx: WorkspaceContext, id: string): Promise<PendingConnection> {
    const raw = await this.redis.get(`social:pending:${id}`);
    const pending = raw ? (JSON.parse(raw) as PendingConnection) : null;
    // The same answer for a missing one and someone else's, so ids cannot be probed.
    if (!pending || pending.workspaceId !== ctx.workspaceId || pending.userId !== ctx.userId) {
      throw AppError.notFound('That connection expired. Start again.');
    }
    return pending;
  }

  /** What the person can choose from after signing in. Only for the person who started the connection. */
  async pending(ctx: WorkspaceContext, id: string) {
    const pending = await this.loadPending(ctx, id);
    return { network: pending.network, accounts: pending.accounts };
  }

  /** Saves the accounts the person chose. Connecting one again refreshes its tokens and clears a broken state. */
  async select(ctx: WorkspaceContext, id: string, externalIds: string[]) {
    const pending = await this.loadPending(ctx, id);
    const { tokens, accounts } = JSON.parse(this.keyring.decrypt(pending.sealed, `pending:${id}`)) as {
      tokens: ProviderTokens;
      accounts: ProviderAccount[];
    };
    const chosen = accounts.filter((account) => externalIds.includes(account.externalId));
    if (!chosen.length) {
      throw new AppError(400, 'validation_failed', 'Choose at least one account.', {
        errors: [{ path: 'externalIds', message: 'Choose at least one account.' }],
      });
    }
    const saved = await this.tx(ctx, async (m) => {
      const out: ConnectedAccount[] = [];
      for (const account of chosen) {
        const secrets = {
          accessToken: account.accessToken ?? tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
        };
        // An account's own token lifetime wins over the login's; `null` means it never expires.
        const seconds = account.expiresInSeconds === undefined ? tokens.expiresInSeconds : account.expiresInSeconds;
        const existing = await m.findOneBy(ConnectedAccount, {
          workspaceId: ctx.workspaceId,
          network: pending.network,
          externalId: account.externalId,
        });
        const accountId = existing?.id ?? uuidv7();
        const fields = {
          name: account.name,
          username: account.username ?? null,
          parentExternalId: account.parentExternalId ?? null,
          secretEnc: this.keyring.encrypt(
            JSON.stringify(secrets),
            accountBinding({ workspaceId: ctx.workspaceId, id: accountId }),
          ),
          tokenExpiresAt: seconds ? new Date(Date.now() + seconds * 1000) : null,
          scopes: tokens.scopes ?? [],
          health: 'ok' as const,
          healthReason: null,
          metadata: account.metadata ?? {},
        };
        // save rather than update: TypeORM's update typing cannot take a free-form JSON object for a jsonb column.
        if (existing) await m.save(Object.assign(existing, fields));
        else {
          await m.save(
            m.create(ConnectedAccount, {
              id: accountId,
              workspaceId: ctx.workspaceId,
              network: pending.network,
              externalId: account.externalId,
              lastCheckedAt: null,
              ...fields,
            }),
          );
        }
        out.push(await m.findOneByOrFail(ConnectedAccount, { id: accountId }));
        await m.save(
          m.create(AuditEntry, {
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: existing ? 'social.account_reconnected' : 'social.account_connected',
            target: accountId,
            detail: { network: pending.network, name: account.name },
          }),
        );
      }
      return out;
    });
    await this.redis.del(`social:pending:${id}`);
    return saved.map(publicAccount);
  }

  /** Disconnecting stops everything waiting to post, wipes the tokens, and keeps the history. */
  async disconnect(ctx: WorkspaceContext, id: string) {
    await this.tx(ctx, async (m) => {
      const account = await m.findOneBy(ConnectedAccount, { workspaceId: ctx.workspaceId, id });
      if (!account) throw AppError.notFound('Account not found.');
      await m.update(
        PublishIntent,
        { workspaceId: ctx.workspaceId, accountId: id, state: 'pending' },
        { state: 'cancelled', error: 'The account was disconnected.' },
      );
      await m.update(
        SocialPost,
        { workspaceId: ctx.workspaceId, accountId: id, state: 'scheduled' },
        { state: 'cancelled' },
      );
      await m.update(
        ConnectedAccount,
        { id },
        {
          secretEnc: this.keyring.encrypt(JSON.stringify({ accessToken: '' }), accountBinding(account)),
          tokenExpiresAt: null,
          health: 'broken',
          healthReason: 'Disconnected.',
        },
      );
      await m.save(
        m.create(AuditEntry, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'social.account_disconnected',
          target: id,
          detail: { name: account.name },
        }),
      );
    });
  }
}
