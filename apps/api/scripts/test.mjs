// Runs the API tests against a database created for this run and dropped afterwards.
// It never reads apps/api/.env, so tests cannot touch a development or production database.
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
const database = `ai_staff_test_${randomBytes(6).toString('hex')}`;

const client = new pg.Client({ host, port, user: admin.user, password: admin.password, database: 'postgres' });
await client.connect();
await client.query(`CREATE DATABASE "${database}"`);

let exitCode = 1;
try {
  await runMigrations({ host, port, database, username: admin.user, password: admin.password, poolSize: 1 });
  const key = randomBytes(32).toString('hex');
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)), ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        AI_STAFF_TEST_DATABASE_READY: '1',
        APP_URL: 'http://localhost:3101',
        WEB_ORIGIN: 'http://localhost:3101',
        DB_HOST: host,
        DB_PORT: String(port),
        DB_NAME: database,
        DB_APP_USER: app.user,
        DB_APP_PASSWORD: app.password,
        // The tenancy tests also connect as admin to check what row-level security hides.
        TEST_DB_ADMIN_USER: admin.user,
        TEST_DB_ADMIN_PASSWORD: admin.password,
        REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6390',
        RATE_LIMIT_PREFIX: `test:${database}`,
        // Tests act as many clients behind one proxy, so per-IP limits don't trip across unrelated tests.
        TRUST_PROXY_HOPS: '1',
        JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
        ENCRYPTION_KEYS: `test:${key}`,
        ENCRYPTION_ACTIVE_KID: 'test',
        SMTP_URL: 'smtp://localhost:1',
        MAIL_FROM: 'AI Staff <no-reply@test.local>',
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
