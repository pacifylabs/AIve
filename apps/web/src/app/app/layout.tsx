import type { MeResponse } from '@ai-staff/contracts';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { isSidebarCollapsed, SIDEBAR_COOKIE } from '@/components/app/nav';
import type { Nudge } from '@/components/app/sidebar-content';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';

interface InboxRow {
  id: string;
}
interface AutopilotRow {
  staffName: string;
  autonomy: string;
  mode: string;
  progress: { met: boolean };
}
interface StaffRow {
  id: string;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await apiOrRedirect<MeResponse>('/me', '/app');
  const { workspaceId } = await readSession();
  const workspaces = me.ok ? me.data.workspaces : [];
  const current = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];

  // What the sidebar shows beside links: how many drafts wait, and one suggested next step.
  let inboxCount = 0;
  let nudge: Nudge | null = null;
  if (current) {
    const [inbox, autopilot, staff] = await Promise.all([
      apiOrRedirect<InboxRow[]>('/inbox', '/app', { workspace: true }),
      apiOrRedirect<AutopilotRow[]>('/autopilot', '/app', { workspace: true }),
      apiOrRedirect<StaffRow[]>('/staff', '/app', { workspace: true }),
    ]);
    inboxCount = inbox.ok ? inbox.data.length : 0;
    const ready = autopilot.ok
      ? autopilot.data.find((task) => task.autonomy === 'draft' && task.mode !== 'off' && task.progress.met)
      : undefined;
    if (ready) {
      nudge = {
        title: `${ready.staffName} has a clean record`,
        text: 'You can let them post without asking each time. Guardrails stay on.',
        href: '/app/autopilot',
        cta: 'Set up autopilot',
      };
    } else if (staff.ok && staff.data.length === 0) {
      nudge = {
        title: 'Hire your first staff member',
        text: 'Pick a role, answer a few questions, and they start drafting for your approval.',
        href: '/app/hire',
        cta: 'Hire now',
      };
    }
  }

  return (
    <AppShell
      email={me.ok ? me.data.email : ''}
      sidebarCollapsed={isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value)}
      inboxCount={inboxCount}
      workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))}
      currentWorkspaceId={current?.id}
      nudge={nudge}
    >
      {children}
    </AppShell>
  );
}
