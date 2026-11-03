import {
  ActivityEvent,
  asSystem,
  createDataSource,
  type DataSource,
  DomainEvent,
  TaskRun,
  WorkItem,
  withTenant,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';

export function connect(): DataSource {
  return createDataSource({
    host: process.env.TEST_DB_HOST!,
    port: Number(process.env.TEST_DB_PORT),
    database: process.env.TEST_DB_NAME!,
    username: process.env.TEST_DB_APP_USER!,
    password: process.env.TEST_DB_APP_PASSWORD!,
    poolSize: 5,
  });
}

/** A controllable clock, so leases, schedules and back-off are tested without waiting. */
export function clock(start: string) {
  const state = { now: new Date(start) };
  return {
    now: () => new Date(state.now),
    set: (iso: string) => {
      state.now = new Date(iso);
    },
    advance: (ms: number) => {
      state.now = new Date(state.now.getTime() + ms);
    },
  };
}

/** A fresh user and workspace (UTC), created the way sign-up does: as a named system operation. */
export async function seedWorkspace(db: DataSource, timezone = 'UTC') {
  const userId = uuidv7();
  const workspaceId = uuidv7();
  await asSystem(db, 'test: create a user and workspace', async (m) => {
    await m.query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, 'Owner', 'x')`, [
      userId,
      `${userId}@test.local`,
    ]);
    await m.query(`INSERT INTO workspaces (id, name, slug, timezone) VALUES ($1, 'Northfield', $2, $3)`, [
      workspaceId,
      `ws-${workspaceId}`,
      timezone,
    ]);
    await m.query(`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES ($1, $2, $3, 'owner')`, [
      uuidv7(),
      workspaceId,
      userId,
    ]);
  });
  return { userId, workspaceId };
}

export const inWorkspace = <T>(db: DataSource, workspaceId: string, work: Parameters<typeof withTenant<T>>[2]) =>
  withTenant(db, { workspaceId, userId: null }, work);

export const workItems = (db: DataSource, workspaceId: string) =>
  inWorkspace(db, workspaceId, (m) => m.find(WorkItem, { where: { workspaceId }, order: { createdAt: 'ASC' } }));

export const runs = (db: DataSource, workspaceId: string) =>
  inWorkspace(db, workspaceId, (m) => m.find(TaskRun, { where: { workspaceId }, order: { createdAt: 'ASC' } }));

export const events = (db: DataSource, workspaceId: string) =>
  inWorkspace(db, workspaceId, (m) => m.find(DomainEvent, { where: { workspaceId }, order: { createdAt: 'ASC' } }));

export const activity = (db: DataSource, workspaceId: string) =>
  inWorkspace(db, workspaceId, (m) => m.find(ActivityEvent, { where: { workspaceId }, order: { createdAt: 'ASC' } }));
