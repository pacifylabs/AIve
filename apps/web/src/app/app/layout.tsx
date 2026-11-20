import type { MeResponse } from '@ai-staff/contracts';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { BrandMark, PRODUCT_NAME } from '@/components/app/brand-mark';
import { isSidebarCollapsed, SIDEBAR_COOKIE } from '@/components/app/nav';
import { apiOrRedirect } from '@/lib/api';
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

  // Before a workspace exists nothing in the menu can work yet, so the first steps get the whole screen.
  if (!current) {
    return (
      <div className="min-h-dvh">
        <header className="flex items-center gap-2.5 px-6 py-5">
          <BrandMark size={28} />
          <span className="text-sm font-semibold">{PRODUCT_NAME}</span>
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
      {children}
    </AppShell>
  );
}
