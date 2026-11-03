// Runs the core database tests against a database created for this run and dropped afterwards. Like the API's
// harness, it never reads a .env file, so a test can never reach a development or production database.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '@ai-staff/db';

const host = process.env.TEST_DB_HOST ?? 'localhost';
const port = Number(process.env.TEST_DB_PORT ?? 5460);
const admin = {
  user: process.env.TEST_DB_ADMIN_USER ?? 'ai_staff_admin',
  password: process.env.TEST_DB_ADMIN_PASSWORD ?? 'ai_staff_admin_password',
};
const app = {
  user: process.env.TEST_DB_APP_USER ?? 'ai_staff_app',
  password: process.env.TEST_DB_APP_PASSWORD ?? 'ai_staff_app_password',
};
const database = `ai_staff_sales_test_${randomBytes(6).toString('hex')}`;

const client = new pg.Client({ host, port, user: admin.user, password: admin.password, database: 'postgres' });
await client.connect();
await client.query(`CREATE DATABASE "${database}"`);

let exitCode = 1;
try {
  await runMigrations({ host, port, database, username: admin.user, password: admin.password, poolSize: 1 });
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
      'run',
      '--config',
      'vitest.db.config.ts',
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AI_STAFF_TEST_DATABASE_READY: '1',
        TEST_DB_HOST: host,
        TEST_DB_PORT: String(port),
        TEST_DB_NAME: database,
        // Tests connect as the app role, so row-level security applies exactly as in production.
        TEST_DB_APP_USER: app.user,
        TEST_DB_APP_PASSWORD: app.password,
      },
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await client.end();
}
process.exit(exitCode);
