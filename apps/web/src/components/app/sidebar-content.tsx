'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { switchWorkspaceAction } from '@/app/actions/workspaces';
import { Icon } from './icons';
import { isCurrent, NAV, NEW_POST, SIDEBAR_COOKIE } from './nav';
import { openPalette } from './command-palette';

export interface Nudge {
  title: string;
  text: string;
  href: string;
  cta: string;
}

export interface SidebarProps {
  inboxCount: number;
  workspaces: { id: string; name: string }[];
  currentWorkspaceId?: string;
  nudge: Nudge | null;
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

/** The sidebar, shared by the fixed desktop column and the mobile drawer. Always dark: see `.sidebar` in globals.css. */
export function SidebarContent({
  inboxCount,
  workspaces,
  currentWorkspaceId,
  nudge,
  onNavigate,
  collapsible,
}: SidebarProps) {
  const pathname = usePathname();
  const current = workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center gap-2.5 px-1.5 pt-1">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-[0.625rem] text-white"
          style={{ background: 'linear-gradient(135deg, #2563eb, #4f8bff)' }}
        >
          <Icon name="bot" size={18} />
        </span>
        <span className="side-text text-[0.95rem] font-semibold tracking-tight text-white">AI Staff</span>
      </div>

      {workspaces.length > 1 ? (
        <form action={switchWorkspaceAction} className="side-text">
          <label htmlFor="workspace-switcher" className="sr-only">
            Workspace
          </label>
          <div className="relative">
            <select
              id="workspace-switcher"
              name="workspaceId"
              defaultValue={current?.id}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="w-full appearance-none rounded-[0.625rem] border border-[var(--side-line)] bg-[var(--side-raised)] py-2 pr-8 pl-3 text-sm font-medium text-white"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[var(--side-muted)]">
              <Icon name="chevronDown" size={16} />
            </span>
          </div>
        </form>
      ) : current ? (
        <div className="side-text rounded-[0.625rem] border border-[var(--side-line)] bg-[var(--side-raised)] px-3 py-2 text-sm font-medium text-white">
          {current.name}
        </div>
      ) : null}

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
        <span className="side-text flex-1 text-left">Search</span>
        <kbd className="side-text kbd !border-[var(--side-line)] !bg-transparent !text-[var(--side-faint)]">⌘K</kbd>
      </button>

      <Link
        href={NEW_POST.href}
        onClick={onNavigate}
        title={NEW_POST.label}
        aria-current={isCurrent(NEW_POST, pathname) ? 'page' : undefined}
        className="side-primary flex items-center justify-center gap-2 rounded-[0.625rem] bg-[var(--side-active)] px-3 py-2 text-sm font-medium text-white hover:brightness-110"
      >
        <Icon name="compose" size={16} />
        <span className="side-text">{NEW_POST.label}</span>
      </Link>

      <nav aria-label="Main" className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
        {NAV.map((group, index) => (
          <div key={group.label ?? index} className="space-y-0.5">
            {group.label ? (
              <p className="side-text px-2.5 pt-1 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] text-[var(--side-faint)] uppercase">
                {group.label}
              </p>
            ) : null}
            {group.items.map((item) => {
              const count = item.badge === 'inbox' ? inboxCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isCurrent(item, pathname) ? 'page' : undefined}
                  title={item.label}
                  className="side-link relative"
                >
                  <Icon name={item.icon} />
                  <span className="side-text flex-1">{item.label}</span>
                  {count > 0 ? (
                    <span className="side-count rounded-full bg-white/15 px-2 text-xs font-semibold text-white tabular-nums">
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {nudge ? (
        <div
          className="side-text space-y-2 rounded-2xl border border-[var(--side-line)] p-4"
          style={{ background: 'linear-gradient(160deg, #15244a 0%, #0f1a33 70%)' }}
        >
          <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-[var(--side-accent)]">
            <Icon name="sparkles" size={16} />
          </span>
          <p className="text-sm font-semibold text-white">{nudge.title}</p>
          <p className="text-xs leading-relaxed text-[var(--side-muted)]">{nudge.text}</p>
          <Link
            href={nudge.href}
            onClick={onNavigate}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-[0.625rem] bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
          >
            {nudge.cta}
            <Icon name="arrow" size={15} />
          </Link>
        </div>
      ) : null}

      {collapsible ? (
        <div className="hidden lg:block">
          <CollapseButton initial={collapsible.collapsed} />
        </div>
      ) : null}
    </div>
  );
}
