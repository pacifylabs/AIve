// Starts the API and the worker together, for a host that gives one web service and no background worker (Render's
// free plan). On a plan with a separate worker, run each app on its own instead: `pnpm --filter @ai-staff/api start`
// and `pnpm --filter @ai-staff/worker start`.
//
// Optionally applies database migrations first (RUN_MIGRATIONS=true). If either process exits, the other is stopped
// and this process exits with the same code, so the host restarts both and nothing is left half-running.
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const node = process.execPath;
const entry = (app) => fileURLToPath(new URL(`../../apps/${app}/dist/main.js`, import.meta.url));

if (process.env.RUN_MIGRATIONS === 'true') {
  try {
    execFileSync(node, [fileURLToPath(new URL('../../packages/db/scripts/migrate.mjs', import.meta.url))], {
      stdio: 'inherit',
      cwd: root,
    });
  } catch {
    console.error('Migrations failed; not starting.');
    process.exit(1);
  }
}

const children = new Map();
let exitCode = null;

function stopAll(code) {
  exitCode ??= code;
  for (const child of children.values()) if (child.exitCode === null) child.kill('SIGTERM');
  // Jobs get a few seconds to finish; then whatever is left is ended.
  setTimeout(() => process.exit(exitCode), 10_000).unref();
}

for (const app of ['api', 'worker']) {
  const child = spawn(node, ['--enable-source-maps', entry(app)], { stdio: 'inherit', cwd: root, env: process.env });
  children.set(app, child);
  child.on('exit', (code, signal) => {
    console.error(`${app} exited (${signal ?? code}).`);
    children.delete(app);
    if (children.size === 0) process.exit(exitCode ?? code ?? 1);
    stopAll(code ?? 1);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stopAll(0));
