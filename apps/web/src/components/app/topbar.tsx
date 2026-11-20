'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { logoutAction } from '@/app/actions/auth';
import { clearAllDrafts, sessionStore } from '@/lib/form-draft';
import { openPalette } from './command-palette';
import { Icon } from './icons';
import { PRODUCT_NAME } from './brand-mark';
import { sectionOf } from './nav';
import { ThemeToggle } from './theme-toggle';

/** The strip above every page: where you are, search, the theme, and the account menu. */
export function Topbar({ email }: { email: string }) {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const initial = (email.trim()[0] ?? '?').toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[var(--glass)] backdrop-blur-md">
      <div className="flex h-14 w-full items-center gap-2 px-4 sm:px-6 lg:px-8">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{section?.label ?? PRODUCT_NAME}</p>

        <button
          type="button"
          onClick={openPalette}
          className="hidden h-9 w-56 items-center gap-2 rounded-[0.625rem] border border-border bg-surface px-3 text-sm text-muted hover:border-line-strong md:flex"
        >
          <Icon name="search" size={16} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="kbd">⌘K</kbd>
        </button>
        <button type="button" onClick={openPalette} aria-label="Search" className="btn btn-quiet size-9 !p-0 md:hidden">
          <Icon name="search" />
        </button>

        <ThemeToggle />

        <button
          ref={trigger}
          type="button"
          popoverTarget="app-user-menu"
          aria-label="Account menu"
          className="grid size-9 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
        >
          {initial}
        </button>
        <div
          ref={menu}
          id="app-user-menu"
          popover="auto"
          className="menu w-64"
          // Open under the avatar: anchor positioning is not everywhere yet.
          onToggle={(event) => {
            if ((event as unknown as ToggleEvent).newState !== 'open') return;
            const box = trigger.current?.getBoundingClientRect();
            if (!box || !menu.current) return;
            menu.current.style.top = `${box.bottom + 8}px`;
            menu.current.style.right = `${Math.max(8, window.innerWidth - box.right)}px`;
          }}
        >
          <p className="truncate px-3 pt-2 pb-1 text-xs text-muted">Signed in as</p>
          <p className="truncate px-3 pb-2 text-sm font-medium">{email}</p>
          <Link href="/app/settings" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-subtle">
            <Icon name="settings" size={16} /> Settings
          </Link>
          <form action={logoutAction} onSubmit={() => clearAllDrafts(sessionStore())}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-subtle"
            >
              <Icon name="logout" size={16} /> Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
