import { runMigrations } from '../dist/index.js';

const required = ['DB_HOST', 'DB_NAME', 'DB_ADMIN_USER', 'DB_ADMIN_PASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}. Set them in apps/api/.env or the environment.`);
  process.exit(1);
}

const applied = await runMigrations({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  username: process.env.DB_ADMIN_USER,
  password: process.env.DB_ADMIN_PASSWORD,
  poolSize: 1,
  ssl: process.env.DB_SSL === 'true',
});
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
