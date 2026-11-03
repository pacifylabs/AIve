import { defineConfig } from 'vitest/config';

if (process.env.AI_STAFF_TEST_DATABASE_READY !== '1') {
  throw new Error('Run the database tests with `pnpm test:db` so they get a disposable database.');
}

export default defineConfig({
  test: {
    include: ['test/**/*.db.spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
