import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { accountBinding, Keyring } from '@ai-staff/core';
import {
  asSystem,
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
import { readSignedRequest } from './signed-request.js';
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
    const saved = await this.saveAccounts(ctx, pending.network, tokens, chosen);
    await this.redis.del(`social:pending:${id}`);
    return saved.map(publicAccount);
  }

  /** Stores accounts with their encrypted tokens. Saving one that exists again refreshes it and clears a broken state. */
  private async saveAccounts(
    ctx: WorkspaceContext,
    network: SocialNetwork,
    tokens: ProviderTokens,
    chosen: ProviderAccount[],
  ) {
    return this.tx(ctx, async (m) => {
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
          network: network,
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
              network: network,
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
            detail: { network: network, name: account.name },
          }),
        );
      }
      return out;
    });
  }

  /**
   * Connecting a network that has no sign-in page: the person pastes a token, app password or webhook address. The
   * network is asked whether it works before anything is saved, and only the resulting session is kept, encrypted. What
   * was typed is never logged or returned. A wrong value comes back as a message the person can act on.
   */
  async connectWithCredentials(ctx: WorkspaceContext, network: SocialNetwork, credentials: Record<string, string>) {
    const provider = this.providers.get(network);
    if (provider.authKind !== 'credentials' || !provider.connectWithCredentials) {
      throw AppError.conflict(`${provider.label} connects through its own sign-in page.`);
    }
    let connection;
    try {
      connection = await provider.connectWithCredentials(credentials);
    } catch (error) {
      if (error instanceof ProviderError) {
        const message = error.message.slice(0, 300);
        throw new AppError(400, 'validation_failed', message, { errors: [{ path: 'credentials', message }] });
      }
      throw error;
    }
    if (!connection.accounts.length) throw AppError.conflict(`No ${provider.label} was found for that login.`);
    return (await this.saveAccounts(ctx, network, connection.tokens, connection.accounts)).map(publicAccount);
  }

  /** Disconnecting stops everything waiting to post, wipes the tokens, and keeps the history. */
  async disconnect(ctx: WorkspaceContext, id: string) {
    await this.tx(ctx, async (m) => {
      const account = await m.findOneBy(ConnectedAccount, { workspaceId: ctx.workspaceId, id });
      if (!account) throw AppError.notFound('Account not found.');
      await this.wipe(m, account, 'Disconnected.', 'social.account_disconnected', ctx.userId);
    });
  }

  /** Meta (Threads, or Facebook and Instagram) tells us, with a signed message, that a person removed the app or asked for their data to be deleted. */
  async metaRevoked(app: 'threads' | 'meta', kind: 'deauthorize' | 'data-deletion', signed: string) {
    const secret = (app === 'threads' ? this.config.THREADS_APP_SECRET : this.config.META_APP_SECRET) ?? '';
    const person = readSignedRequest(signed, secret);
    if (!person) throw new AppError(400, 'validation_failed', 'That request was not signed by Meta.');
    const removed = await this.revokeFromNetwork(
      app,
      person.userId,
      kind === 'deauthorize' ? 'deauthorized' : 'deletion_requested',
    );
    // The code only has to be unguessable and quotable; the page it leads to says what was done.
    const code = randomBytes(12).toString('base64url');
    return { removed, code, statusUrl: `${this.config.WEB_ORIGIN.replace(/\/+$/, '')}/data-deletion?code=${code}` };
  }

  private async wipe(
    m: EntityManager,
    account: ConnectedAccount,
    reason: string,
    action: string,
    userId: string | null,
  ) {
    const where = { workspaceId: account.workspaceId, accountId: account.id };
    await m.update(PublishIntent, { ...where, state: 'pending' }, { state: 'cancelled', error: reason });
    await m.update(SocialPost, { ...where, state: 'scheduled' }, { state: 'cancelled' });
    await m.update(
      ConnectedAccount,
      { id: account.id },
      {
        secretEnc: this.keyring.encrypt(JSON.stringify({ accessToken: '' }), accountBinding(account)),
        tokenExpiresAt: null,
        health: 'broken',
        healthReason: reason,
      },
    );
    await m.save(
      m.create(AuditEntry, {
        workspaceId: account.workspaceId,
        userId,
        action,
        target: account.id,
        detail: { name: account.name },
      }),
    );
  }

  /**
   * The network says the person took our access away (deauthorize) or asked for their data to be deleted. The account is
   * found by the network's own id for it, in every workspace that connected it, and treated like a disconnect: what was
   * waiting is stopped and the tokens are wiped. The workspace's own post history is theirs and stays.
   */
  async revokeFromNetwork(app: 'threads' | 'meta', personId: string, why: 'deauthorized' | 'deletion_requested') {
    // A Threads account is the person themselves. A Facebook or Instagram account is a Page reached through the person,
    // so those are found by the Meta user id kept on them when they were connected.
    const found = await asSystem(this.db, 'a network reported that a person removed our access', (m) =>
      app === 'threads'
        ? m.find(ConnectedAccount, { where: { network: 'threads', externalId: personId } })
        : m
            .createQueryBuilder(ConnectedAccount, 'a')
            .where("a.network IN ('facebook', 'instagram')")
            .andWhere("a.metadata ->> 'metaUserId' = :personId", { personId })
            .getMany(),
    );
    for (const account of found) {
      await withTenant(this.db, { workspaceId: account.workspaceId, userId: null }, (m) =>
        this.wipe(
          m,
          account,
          why === 'deauthorized'
            ? `${account.name} removed this app's access on the network. Connect again to post.`
            : `${account.name} asked the network to delete their data, so the connection was removed.`,
          `social.account_${why}`,
          null,
        ),
      );
    }
    return found.length;
  }

  /**
   * The follower numbers captured for each account over the last `days` days, oldest first, with where it stands now and how
   * much it changed since the first number in the window. Days with no capture are simply absent.
   */
  stats(ctx: WorkspaceContext, days: number) {
    return this.tx(ctx, async (m) => {
      const rows = (await m.query(
        `SELECT account_id, to_char(day, 'YYYY-MM-DD') AS day, followers, reach FROM account_stats
          WHERE workspace_id = $1 AND day >= (now() AT TIME ZONE 'UTC')::date - $2::int
          ORDER BY day`,
        [ctx.workspaceId, days],
      )) as { account_id: string; day: string; followers: number; reach: number | null }[];
      const byAccount = new Map<string, { day: string; followers: number; reach: number | null }[]>();
      for (const row of rows) {
        byAccount.set(row.account_id, [
          ...(byAccount.get(row.account_id) ?? []),
          { day: row.day, followers: row.followers, reach: row.reach },
        ]);
      }
      return [...byAccount].map(([accountId, series]) => {
        const first = series[0]!;
        const latest = series[series.length - 1]!;
        const change = latest.followers - first.followers;
        const counted = series.filter((point) => point.reach !== null);
        return {
          accountId,
          series,
          followers: latest.followers,
          // Null when the network never gave a figure, so the page can say nothing instead of "0 seen".
          reach: counted.length ? counted.reduce((sum, point) => sum + point.reach!, 0) : null,
          change,
          changePct: first.followers > 0 ? Math.round((change / first.followers) * 1000) / 10 : null,
          since: first.day,
        };
      });
    });
  }
}
