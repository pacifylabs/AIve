'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SECTIONS } from './nav';

/**
 * The tabs across the top of a place that holds several pages (Content, Sales, Activity, Connections), with the
 * place's main action on the right. Scrolls sideways on a phone rather than wrapping.
 */
export function SectionTabs({ section, action }: { section: keyof typeof SECTIONS; action?: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex items-center gap-3 border-b border-border">
      <nav aria-label="Pages in this section" className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {SECTIONS[section].map((tab) => {
          const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? 'page' : undefined}
              className="shrink-0 border-b-2 border-transparent px-4 py-3 text-sm font-medium whitespace-nowrap text-muted hover:border-line-strong hover:text-foreground aria-[current=page]:border-accent aria-[current=page]:text-accent"
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {action ? <div className="shrink-0 pb-2">{action}</div> : null}
    </div>
  );
}
