import type { ReactNode } from 'react';
import { DraftScope, ResumeBanner } from '@/components/form-draft';
import { CommandPalette } from './command-palette';
import { MobileDrawer } from './mobile-drawer';
import { SidebarContent, type SidebarProps } from './sidebar-content';
import { Topbar } from './topbar';

/**
 * The frame around every signed-in page: a dark sidebar (a drawer on a phone), a top bar, and the page itself. The
 * page area is `#app-main` so the drawer can make it inert while it is open.
 */
export function AppShell({
  email,
  children,
  ...sidebar
}: { email: string; children: ReactNode } & Omit<SidebarProps, 'onNavigate'>) {
  return (
    <DraftScope workspaceId={sidebar.currentWorkspaceId}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>
      <div className="min-h-dvh lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside className="sidebar hidden lg:block lg:sticky lg:top-0 lg:h-dvh">
          <SidebarContent {...sidebar} />
        </aside>
        <div id="app-main" className="min-w-0">
          <Topbar email={email} inboxCount={sidebar.inboxCount} />
          <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <ResumeBanner />
            {children}
          </main>
        </div>
      </div>
      <MobileDrawer {...sidebar} />
      <CommandPalette />
    </DraftScope>
  );
}
