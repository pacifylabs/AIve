import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { EmailToken, RefreshToken, User } from './entities/identity.entities.js';
import { Invitation, Membership, Workspace } from './entities/workspace.entities.js';
import { IdentityAndWorkspaces1793318400000 } from './migrations/0001-identity-and-workspaces.js';
import { SnakeNamingStrategy } from './naming.js';

export const entities = [User, EmailToken, RefreshToken, Workspace, Membership, Invitation];
export const migrations = [IdentityAndWorkspaces1793318400000];

export interface ConnectionOptions {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  /** Connection pool size; the API and worker size this separately. */
  poolSize?: number;
}

export function createDataSource(options: ConnectionOptions): DataSource {
  return new DataSource({
    type: 'postgres',
    host: options.host,
    port: options.port,
    database: options.database,
    username: options.username,
    password: options.password,
    entities,
    migrations,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    extra: { max: options.poolSize ?? 10 },
  });
}

/** Applies pending migrations. Must connect as the admin role: the app role cannot create tables. */
export async function runMigrations(options: ConnectionOptions): Promise<string[]> {
  const db = createDataSource(options);
  await db.initialize();
  try {
    const applied = await db.runMigrations({ transaction: 'each' });
    return applied.map((migration) => migration.name);
  } finally {
    await db.destroy();
  }
}
