'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { switchWorkspaceAction } from '@/app/actions/workspaces';
import { BrandMark, PRODUCT_NAME } from './brand-mark';
import { Icon } from './icons';
import { isCurrent, type NavItem, SETUP, SIDEBAR_COOKIE, visiblePrimary } from './nav';
import { openPalette } from './command-palette';

export interface SidebarProps {
  inboxCount: number;
  workspaces: { id: string; name: string }[];
  currentWorkspaceId?: string;
  /** The roles this workspace has hired, so places for other roles stay out of the way. */
  roles: string[];
  /** Called when a link or the search box is used, so the mobile drawer can close first. */
  onNavigate?: () => void;
  /** Desktop only: show the collapse button, starting in this state. The phone drawer never collapses. */
  collapsible?: { collapsed: boolean };
}

/**
 * Collapses the desktop sidebar to an icon rail. It flips `data-sidebar` on the app frame (CSS does the rest) and
 * remembers the choice in a cookie the layout reads, so the next page load starts the same way.
 */
function CollapseButton({ initial }: { initial: boolean }) {
  const [collapsed, setCollapsed] = useState(initial);
  return (
    <button
      type="button"
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onClick={(event) => {
        const next = !collapsed;
        event.currentTarget.closest('[data-sidebar]')?.setAttribute('data-sidebar', next ? 'collapsed' : 'open');
        document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
        setCollapsed(next);
      }}
      className="side-link w-full text-[var(--side-muted)]"
    >
      <Icon name="panel" />
      <span className="side-text">Collapse</span>
    </button>
  );
}

function NavLink({
  item,
  pathname,
  count,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  count: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isCurrent(item, pathname) ? 'page' : undefined}
      title={item.label}
      className="side-link relative"
    >
      <Icon name={item.icon} />
      <span className="side-text flex-1">{item.label}</span>
      {count > 0 ? (
        <span
          className="side-count rounded-full bg-amber px-2 text-xs font-semibold text-white tabular-nums"
          aria-label={`${count} waiting`}
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

/** The sidebar, shared by the fixed desktop column and the mobile drawer. It follows the page's light or dark scheme. */
export function SidebarContent({
  inboxCount,
  workspaces,
  currentWorkspaceId,
  roles,
  onNavigate,
  collapsible,
}: SidebarProps) {
  const pathname = usePathname();
  const current = workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 p-4">
      <div className="flex items-center gap-2.5 px-1.5 pt-1">
        <BrandMark size={30} />
        <span className="side-text flex min-w-0 flex-col">
          {workspaces.length > 1 ? (
            <form action={switchWorkspaceAction}>
              <label htmlFor="workspace-switcher" className="sr-only">
                Workspace
              </label>
              <span className="relative block">
                <select
                  id="workspace-switcher"
                  name="workspaceId"
                  defaultValue={current?.id}
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                  className="w-full appearance-none truncate bg-transparent pr-5 text-sm font-semibold text-[var(--side-strong)]"
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-[var(--side-muted)]">
                  <Icon name="chevronDown" size={14} />
                </span>
              </span>
            </form>
          ) : (
            <span className="truncate text-sm font-semibold text-[var(--side-strong)]">
              {current?.name ?? PRODUCT_NAME}
            </span>
          )}
          <span className="text-xs text-[var(--side-muted)]">{PRODUCT_NAME}</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openPalette();
        }}
        aria-label="Search"
        title="Search (⌘K)"
        className="side-search flex items-center gap-2.5 rounded-[0.625rem] border border-[var(--side-line)] px-3 py-2 text-sm text-[var(--side-muted)] hover:bg-[var(--side-hover)]"
      >
        <Icon name="search" size={16} />
        <span className="side-text flex-1 text-left">Search or jump to</span>
        <kbd className="side-text kbd">⌘K</kbd>
      </button>

      <nav aria-label="Main" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <div className="space-y-0.5">
          {visiblePrimary(roles).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              count={item.badge === 'inbox' ? inboxCount : 0}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-[var(--side-line)] pt-3">
        {SETUP.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} count={0} onNavigate={onNavigate} />
        ))}
        {collapsible ? (
          <div className="hidden lg:block">
            <CollapseButton initial={collapsible.collapsed} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
