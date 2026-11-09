import { randomBytes } from 'node:crypto';
import { ConnectedAccount, type DataSource } from '@ai-staff/db';
import { FixtureSocialProvider, SocialProviders } from '@ai-staff/social';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountStats, accountBinding, AccountTokens, Keyring } from '../src/index.js';
import { clock, connect, inWorkspace, seedWorkspace } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

const keyring = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');

async function setup() {
  const ws = await seedWorkspace(db);
  const time = clock('2026-11-09T02:10:00Z');
  const network = new FixtureSocialProvider('facebook');
  const providers = new SocialProviders({}, [network]);
  const stats = new AccountStats(db, providers, new AccountTokens(db, keyring, providers, time.now), time.now);
  const add = (network: 'facebook' | 'linkedin' = 'facebook', health: 'ok' | 'broken' = 'ok') =>
    inWorkspace(db, ws.workspaceId, async (m) => {
      const id = uuidv7();
      await m.save(
        m.create(ConnectedAccount, {
          id,
          workspaceId: ws.workspaceId,
          network,
          externalId: id,
          name: `${network} ${id.slice(-4)}`,
          username: null,
          parentExternalId: null,
          secretEnc: keyring.encrypt(
            JSON.stringify({ accessToken: 'tok' }),
            accountBinding({ workspaceId: ws.workspaceId, id }),
          ),
          tokenExpiresAt: null,
          scopes: [],
          health,
          healthReason: null,
          lastCheckedAt: null,
          metadata: {},
        }),
      );
      return id;
    });
  const rows = (accountId: string) =>
    inWorkspace(
      db,
      ws.workspaceId,
      (m) =>
        m.query(
          `SELECT to_char(day, 'YYYY-MM-DD') AS day, followers FROM account_stats WHERE account_id = $1 ORDER BY day`,
          [accountId],
        ) as Promise<{ day: string; followers: number }[]>,
    );
  return { ...ws, time, network, stats, add, rows };
}

describe('account follower capture', () => {
  it('keeps one number per account per day, replacing a second capture the same day', async () => {
    const s = await setup();
    const id = await s.add();
    s.network.followers = 120;
    await s.stats.capture();
    s.network.followers = 125;
    await s.stats.capture();
    expect(await s.rows(id)).toEqual([{ day: '2026-11-09', followers: 125 }]);
    s.time.advance(86_400_000);
    s.network.followers = 131;
    await s.stats.capture();
    expect(await s.rows(id)).toEqual([
      { day: '2026-11-09', followers: 125 },
      { day: '2026-11-10', followers: 131 },
    ]);
  });

  it('skips a broken account and a network that does not report followers, and one failure stops no one', async () => {
    const s = await setup();
    const ok = await s.add();
    const broken = await s.add('facebook', 'broken');
    const noCount = await s.add('linkedin');
    const failing = await s.add();
    s.network.fetchFollowers = (input) =>
      input?.externalId === failing ? Promise.reject(new Error('network down')) : Promise.resolve(50);
    await s.stats.capture();
    expect(await s.rows(ok)).toEqual([{ day: '2026-11-09', followers: 50 }]);
    // Nothing is invented for the account that failed, the broken one, or the network with no count.
    for (const id of [failing, broken, noCount]) expect(await s.rows(id)).toEqual([]);
  });
});
