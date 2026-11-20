import type { ReactNode } from 'react';
import { DraftScope, ResumeBanner } from '@/components/form-draft';
import { CommandPalette } from './command-palette';
import { MobileDrawer } from './mobile-drawer';
import { MobileTabs } from './mobile-tabs';
import { SidebarContent, type SidebarProps } from './sidebar-content';
import { Topbar } from './topbar';

/**
 * The frame around every signed-in page: the sidebar (a tab bar plus a drawer on a phone), a top bar, and the page
 * itself. The page area is `#app-main` so the drawer can make it inert while it is open.
 */
export function AppShell({
  email,
  sidebarCollapsed,
  children,
  ...sidebar
}: { email: string; sidebarCollapsed: boolean; children: ReactNode } & Omit<
  SidebarProps,
  'onNavigate' | 'collapsible'
>) {
  return (
    <DraftScope workspaceId={sidebar.currentWorkspaceId}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>
      <div
        data-sidebar={sidebarCollapsed ? 'collapsed' : 'open'}
        className="app-frame min-h-dvh lg:grid lg:grid-cols-[var(--side-w)_minmax(0,1fr)]"
      >
        <aside className="sidebar hidden lg:block lg:sticky lg:top-0 lg:h-dvh">
          <SidebarContent {...sidebar} collapsible={{ collapsed: sidebarCollapsed }} />
        </aside>
        <div id="app-main" className="min-w-0">
          <Topbar email={email} />
          <main id="main" className="w-full px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:py-9">
            <ResumeBanner />
            {children}
          </main>
        </div>
      </div>
      <MobileTabs inboxCount={sidebar.inboxCount} />
      <MobileDrawer {...sidebar} />
      <CommandPalette />
    </DraftScope>
  );
}
