import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

if (process.env.AI_STAFF_TEST_DATABASE_READY !== '1') {
  throw new Error('Run the API tests with `pnpm test` so they get a disposable database.');
}

export default defineConfig({
  // SWC emits decorator metadata, which Nest needs to resolve constructor dependencies.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
