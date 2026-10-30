import type { MeResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/actions/auth';
import { switchWorkspaceAction } from '@/app/actions/workspaces';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await apiOrRedirect<MeResponse>('/me', '/app');
  const { workspaceId } = await readSession();
  const workspaces = me.ok ? me.data.workspaces : [];
  const current = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/app" className="text-sm font-semibold tracking-tight">
            AI Staff
          </Link>
          {workspaces.length > 0 ? (
            <form action={switchWorkspaceAction} className="flex items-center gap-2">
              <label htmlFor="workspace-switcher" className="sr-only">
                Workspace
              </label>
              <select
                id="workspace-switcher"
                name="workspaceId"
                defaultValue={current?.id}
                className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-sm text-accent hover:underline">
                Switch
              </button>
            </form>
          ) : null}
          <nav className="ml-auto flex items-center gap-4 text-sm">
            {current ? (
              <Link href="/app/settings" className="hover:underline">
                Settings
              </Link>
            ) : null}
            <span className="text-muted">{me.ok ? me.data.email : ''}</span>
            <form action={logoutAction}>
              <button type="submit" className="hover:underline">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
