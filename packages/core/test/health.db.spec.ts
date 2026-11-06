import { randomBytes } from 'node:crypto';
import { ConnectedAccount, type DataSource } from '@ai-staff/db';
import { FixtureSocialProvider, SocialProviders } from '@ai-staff/social';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountHealth, accountBinding, AccountTokens, Keyring } from '../src/index.js';
import { activity, clock, connect, inWorkspace, seedWorkspace } from './helpers.js';

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

const keyring = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');
const DAY = 86_400_000;

async function setup() {
  const ws = await seedWorkspace(db);
  const time = clock('2026-11-06T10:00:00Z');
  const network = new FixtureSocialProvider('threads');
  const providers = new SocialProviders({}, [network]);
  const tokens = new AccountTokens(db, keyring, providers, time.now);
  const health = new AccountHealth(db, keyring, tokens, time.now);
  const add = (daysLeft: number | null, secrets: object = { accessToken: 'tok' }) =>
    inWorkspace(db, ws.workspaceId, async (m) => {
      const id = uuidv7();
      await m.save(
        m.create(ConnectedAccount, {
          id,
          workspaceId: ws.workspaceId,
          network: 'threads',
          externalId: id,
          name: '@northfield',
          username: 'northfield',
          parentExternalId: null,
          secretEnc: keyring.encrypt(JSON.stringify(secrets), accountBinding({ workspaceId: ws.workspaceId, id })),
          tokenExpiresAt: daysLeft === null ? null : new Date(time.now().getTime() + daysLeft * DAY),
          scopes: [],
          health: 'ok',
          healthReason: null,
          lastCheckedAt: null,
          metadata: {},
        }),
      );
      return id;
    });
  const get = (id: string) => inWorkspace(db, ws.workspaceId, (m) => m.findOneByOrFail(ConnectedAccount, { id }));
  /** Only this workspace's accounts are counted, since the sweep looks at every workspace in the database. */
  const sweep = async () => {
    const counts = await health.sweep();
    return counts;
  };
  return { ...ws, time, network, add, get, sweep };
}

describe('account health', () => {
  it('renews a login that runs out within two weeks, and stores the new one', async () => {
    const s = await setup();
    const id = await s.add(10);
    expect((await s.sweep()).renewed).toBeGreaterThanOrEqual(1);
    const after = await s.get(id);
    expect(after.health).toBe('ok');
    expect(after.tokenExpiresAt!.getTime() - s.time.now().getTime()).toBe(60 * DAY);
    expect(keyring.decrypt(after.secretEnc, accountBinding(after))).toContain('fixture-token-2');
  });

  it('leaves alone a login with plenty of time, one with no expiry, and one that renews itself at use', async () => {
    const s = await setup();
    const far = await s.add(40);
    const forever = await s.add(null);
    const withRefresh = await s.add(1, { accessToken: 'tok', refreshToken: 'rft' });
    await s.sweep();
    for (const id of [far, forever, withRefresh]) {
      const account = await s.get(id);
      expect(keyring.decrypt(account.secretEnc, accountBinding(account))).not.toContain('fixture-token-2');
    }
  });

  it('marks an account broken, and says so in the activity log, when the network refuses the login', async () => {
    const s = await setup();
    const id = await s.add(5);
    s.network.nextRefresh = 'auth';
    expect((await s.sweep()).broken).toBeGreaterThanOrEqual(1);
    const after = await s.get(id);
    expect(after.health).toBe('broken');
    expect(after.healthReason).toMatch(/Connect it again/);
    expect((await activity(db, s.workspaceId)).map((event) => event.type)).toContain('account.expired');
  });

  it('retries quietly while there is time, then warns three days ahead with the date, once', async () => {
    const s = await setup();
    const id = await s.add(10);
    s.network.nextRefresh = 'down';
    await s.sweep();
    expect((await s.get(id)).health).toBe('ok');

    s.time.advance(8 * DAY); // two days left
    s.network.nextRefresh = 'down';
    expect((await s.sweep()).warned).toBeGreaterThanOrEqual(1);
    const warned = await s.get(id);
    expect(warned.health).toBe('degraded');
    expect(warned.healthReason).toContain('runs out on 2026-11-16');

    // Still failing: the warning is not repeated.
    s.network.nextRefresh = 'down';
    await s.sweep();
    const events = (await activity(db, s.workspaceId)).filter((event) => event.type === 'account.expiring');
    expect(events).toHaveLength(1);
  });

  it('clears its own warning when a later renewal works', async () => {
    const s = await setup();
    const id = await s.add(2);
    s.network.nextRefresh = 'down';
    await s.sweep();
    expect((await s.get(id)).health).toBe('degraded');
    await s.sweep();
    const after = await s.get(id);
    expect(after.health).toBe('ok');
    expect(after.healthReason).toBeNull();
  });

  it('marks a login that has already run out as broken without asking the network', async () => {
    const s = await setup();
    const id = await s.add(-1);
    await s.sweep();
    const after = await s.get(id);
    expect(after.health).toBe('broken');
    expect(after.healthReason).toMatch(/has expired/);
  });
});
