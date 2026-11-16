import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the pure parts of the web app (no browser): src/**/*.spec.ts. Server-rendered pages are rendered to
// HTML with react-dom/server, so the `@/` alias and the automatic JSX runtime match the Next.js build.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  test: { include: ['src/**/*.spec.ts'] },
});
