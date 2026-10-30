import type { DataSource, EntityManager } from 'typeorm';

export interface TenantContext {
  workspaceId: string | null;
  userId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function settingValue(value: string | null): string {
  if (value === null) return '';
  if (!UUID.test(value)) throw new Error('Tenant context values must be UUIDs');
  return value;
}

/**
 * Runs `work` in a transaction whose row-level security context is `context`. Every request and job reaches the
 * database through this (or asSystem), so a query that forgets its workspace filter still cannot read another
 * workspace's rows.
 */
export async function withTenant<T>(
  db: DataSource,
  context: TenantContext,
  work: (m: EntityManager) => Promise<T>,
): Promise<T> {
  return db.transaction(async (manager) => {
    await manager.query(
      `SELECT set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true), set_config('app.system', 'off', true)`,
      [settingValue(context.workspaceId), settingValue(context.userId)],
    );
    return work(manager);
  });
}

/**
 * Lifts row-level security for one named operation that has no single tenant yet, such as creating a workspace or
 * accepting an invitation by token. The reason is required so every use is easy to find and review.
 */
export async function asSystem<T>(db: DataSource, reason: string, work: (m: EntityManager) => Promise<T>): Promise<T> {
  if (!reason.trim()) throw new Error('asSystem needs a reason');
  return db.transaction(async (manager) => {
    await manager.query(
      `SELECT set_config('app.system', 'on', true), set_config('app.workspace_id', '', true), set_config('app.user_id', '', true)`,
    );
    return work(manager);
  });
}
