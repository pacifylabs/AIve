import { defineConfig } from 'vitest/config';

// Unit tests for the pure parts of the web app (no browser): src/**/*.spec.ts.
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'] },
});
