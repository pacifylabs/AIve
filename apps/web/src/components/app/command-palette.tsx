'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { logoutAction } from '@/app/actions/auth';
import { clearAllDrafts, sessionStore } from '@/lib/form-draft';
import { Icon, type IconName } from './icons';
import { ALL_ITEMS } from './nav';

const PALETTE_ID = 'app-palette';

export function openPalette() {
  const dialog = document.getElementById(PALETTE_ID);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

interface Entry {
  label: string;
  hint: string;
  icon: IconName;
  run: () => void;
}

/**
 * Jump to any page or do a common thing from the keyboard (Cmd or Ctrl+K). A native modal dialog, so the browser
 * handles focus, Escape and making the page behind it inert.
 */
export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const titleId = useId();
  const listId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      ...ALL_ITEMS.map((item) => ({ label: item.label, hint: 'Go to', icon: item.icon, run: go(item.href) })),
      { label: 'Hire a staff member', hint: 'Do', icon: 'hire' as const, run: go('/app/hire') },
      { label: 'Connect a social account', hint: 'Do', icon: 'accounts' as const, run: go('/app/accounts') },
      { label: 'Import leads', hint: 'Do', icon: 'leads' as const, run: go('/app/leads') },
      {
        label: 'Sign out',
        hint: 'Do',
        icon: 'logout' as const,
        run: () => {
          clearAllDrafts(sessionStore());
          void logoutAction();
        },
      },
    ];
  }, [router]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((entry) => words.every((word) => entry.label.toLowerCase().includes(word)));
  }, [entries, query]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    dialog.current?.close();
    entry.run();
  };

  return (
    <dialog
      ref={dialog}
      id={PALETTE_ID}
      className="palette"
      aria-labelledby={titleId}
      // Click outside closes it too; Escape works without this.
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        setQuery('');
        setActive(0);
      }}
    >
      <h2 id={titleId} className="sr-only">
        Search
      </h2>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <span className="text-muted">
          <Icon name="search" />
        </span>
        <input
          ref={input}
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, shown.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(shown[active]);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
          aria-label="Search pages and actions"
          placeholder="Search pages and actions"
          className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted focus-visible:outline-none"
        />
        <kbd className="kbd">Esc</kbd>
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches that.</li>
        ) : null}
        {shown.map((entry, index) => (
          <li
            key={`${entry.hint}-${entry.label}`}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseMove={() => setActive(index)}
            onClick={() => choose(entry)}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm aria-selected:bg-accent-soft aria-selected:text-accent"
          >
            <Icon name={entry.icon} />
            <span className="flex-1 font-medium">{entry.label}</span>
            <span className="text-xs text-muted">{entry.hint}</span>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
