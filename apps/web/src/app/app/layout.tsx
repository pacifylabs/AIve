import type { MeResponse } from '@ai-staff/contracts';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { BrandMark, PRODUCT_NAME } from '@/components/app/brand-mark';
import { isSidebarCollapsed, SIDEBAR_COOKIE } from '@/components/app/nav';
import { apiOrRedirect } from '@/lib/api';
import { isOnboarding, PATH_HEADER } from '@/lib/request-path';
import { readSession } from '@/lib/session';

interface InboxRow {
  id: string;
}
interface StaffRow {
  roleKey: string;
  state: string;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await apiOrRedirect<MeResponse>('/me', '/app');
  const { workspaceId } = await readSession();
  const workspaces = me.ok ? me.data.workspaces : [];
  const current = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];

  const path = (await headers()).get(PATH_HEADER);

  // Before a workspace exists nothing in the menu can work yet, and onboarding should not be left halfway by
  // accident: both get the whole screen.
  if (!current || isOnboarding(path)) {
    return (
      <div className="min-h-dvh">
        <header className="flex items-center justify-between gap-2.5 px-6 py-5">
          <span className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="text-sm font-semibold">{PRODUCT_NAME}</span>
          </span>
          {current ? (
            <Link href="/app" className="text-sm text-muted hover:text-foreground">
              Finish later
            </Link>
          ) : null}
        </header>
        <main id="main" className="px-4 pb-16 sm:px-6">
          {children}
        </main>
      </div>
    );
  }

  // The badge beside Review work, and which roles are hired (Sales appears in the menu only with a Sales Manager).
  const [inbox, staff] = await Promise.all([
    apiOrRedirect<InboxRow[]>('/inbox', '/app', { workspace: true }),
    apiOrRedirect<StaffRow[]>('/staff', '/app', { workspace: true }),
  ]);
  const roles = staff.ok
    ? [...new Set(staff.data.filter((member) => member.state !== 'archived').map((member) => member.roleKey))]
    : [];

  return (
    <AppShell
      email={me.ok ? me.data.email : ''}
      sidebarCollapsed={isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value)}
      inboxCount={inbox.ok ? inbox.data.length : 0}
      workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))}
      currentWorkspaceId={current.id}
      roles={roles}
    >
      {/* Until someone is hired, every page offers the way back to the guided setup. Home has its own. */}
      {roles.length === 0 && path !== '/app' ? (
        <p className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">You have not hired anyone yet. Pick up the setup where you left it.</span>
          <Link href="/app/welcome" className="btn btn-sm btn-primary">
            Continue setting up
          </Link>
        </p>
      ) : null}
      {children}
    </AppShell>
  );
}
