'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';
import { DRAWER_ID } from './mobile-drawer';
import { isCurrent, PRIMARY } from './nav';

const [HOME, REVIEW, STAFF] = PRIMARY;

/** The phone's main navigation: Home, Review work, My staff, and More for everything else (the drawer). */
export function MobileTabs({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  const tabs = [
    { item: HOME!, label: 'Home', count: 0 },
    { item: REVIEW!, label: 'Review', count: inboxCount },
    { item: STAFF!, label: 'Staff', count: 0 },
  ];
  return (
    <nav aria-label="Main" className="tabbar">
      {tabs.map(({ item, label, count }) => (
        <Link key={item.href} href={item.href} aria-current={isCurrent(item, pathname) ? 'page' : undefined}>
          <span className="relative">
            <Icon name={item.icon} size={22} />
            {count > 0 ? (
              <span className="absolute -top-1.5 -right-3 min-w-5 rounded-full bg-amber px-1 text-center text-[0.625rem] leading-5 font-semibold text-white tabular-nums">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </span>
          {label}
          {count > 0 ? <span className="sr-only">, {count} waiting</span> : null}
        </Link>
      ))}
      <button
        type="button"
        popoverTarget={DRAWER_ID}
        popoverTargetAction="show"
        aria-controls={DRAWER_ID}
        aria-expanded="false"
      >
        <Icon name="more" size={22} />
        More
      </button>
    </nav>
  );
}
