import type { IconName } from './icons';

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Only the exact address is "current", not the pages beneath it. */
  exact?: boolean;
  /** Which count from the layout to show beside it. */
  badge?: 'inbox';
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Everything in the sidebar, in order. The search box and the top bar's title read the same list. */
export const NAV: NavGroup[] = [
  { items: [{ label: 'Dashboard', href: '/app', icon: 'dashboard', exact: true }] },
  {
    label: 'Work',
    items: [
      { label: 'Inbox', href: '/app/inbox', icon: 'inbox', badge: 'inbox' },
      { label: 'Autopilot', href: '/app/autopilot', icon: 'autopilot' },
      { label: 'Calendar', href: '/app/calendar', icon: 'calendar' },
      { label: 'New post', href: '/app/compose', icon: 'compose' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Pipeline', href: '/app/pipeline', icon: 'pipeline' },
      { label: 'Leads', href: '/app/leads', icon: 'leads' },
      { label: 'Mailboxes', href: '/app/mailboxes', icon: 'mail' },
      { label: 'Do not contact', href: '/app/suppressions', icon: 'shield' },
    ],
  },
  {
    label: 'Social',
    items: [
      { label: 'Accounts', href: '/app/accounts', icon: 'accounts' },
      { label: 'Feeds', href: '/app/feeds', icon: 'feeds' },
      { label: 'Templates and tags', href: '/app/templates', icon: 'templates' },
    ],
  },
  {
    label: 'Company',
    items: [
      { label: 'Company', href: '/app/company', icon: 'company' },
      { label: 'Hire', href: '/app/hire', icon: 'hire' },
      { label: 'Settings', href: '/app/settings', icon: 'settings' },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((group) => group.items);

export function isCurrent(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The section a path belongs to, for the top bar. */
export function sectionOf(pathname: string): { group?: string; item: NavItem } | null {
  for (const group of NAV) {
    const item = group.items.find((candidate) => isCurrent(candidate, pathname));
    if (item) return { group: group.label, item };
  }
  return null;
}
