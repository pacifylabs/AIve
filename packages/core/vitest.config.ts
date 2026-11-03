import { defineConfig } from 'vitest/config';

// Unit tests only. Database tests live in test/ and run through `pnpm test:db`, which creates a disposable database.
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'] },
});
