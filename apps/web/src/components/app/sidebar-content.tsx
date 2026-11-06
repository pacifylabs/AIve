'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { switchWorkspaceAction } from '@/app/actions/workspaces';
import { Icon } from './icons';
import { isCurrent, NAV } from './nav';
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
}

/** The sidebar, shared by the fixed desktop column and the mobile drawer. Always dark: see `.sidebar` in globals.css. */
export function SidebarContent({ inboxCount, workspaces, currentWorkspaceId, nudge, onNavigate }: SidebarProps) {
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
        <span className="text-[0.95rem] font-semibold tracking-tight text-white">AI Staff</span>
      </div>

      {workspaces.length > 1 ? (
        <form action={switchWorkspaceAction}>
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
        <div className="rounded-[0.625rem] border border-[var(--side-line)] bg-[var(--side-raised)] px-3 py-2 text-sm font-medium text-white">
          {current.name}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openPalette();
        }}
        className="flex items-center gap-2.5 rounded-[0.625rem] border border-[var(--side-line)] px-3 py-2 text-sm text-[var(--side-muted)] hover:bg-[var(--side-hover)]"
      >
        <Icon name="search" size={16} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="kbd !border-[var(--side-line)] !bg-transparent !text-[var(--side-faint)]">⌘K</kbd>
      </button>

      <nav aria-label="Main" className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
        {NAV.map((group, index) => (
          <div key={group.label ?? index} className="space-y-0.5">
            {group.label ? (
              <p className="px-2.5 pt-1 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] text-[var(--side-faint)] uppercase">
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
                  className="side-link"
                >
                  <Icon name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 ? (
                    <span className="rounded-full bg-white/15 px-2 text-xs font-semibold text-white tabular-nums">
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
          className="space-y-2 rounded-2xl border border-[var(--side-line)] p-4"
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
    </div>
  );
}
