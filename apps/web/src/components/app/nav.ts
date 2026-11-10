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

/** The one action the sidebar shows as a button above the links, rather than as a link among them. */
export const NEW_POST: NavItem = { label: 'New post', href: '/app/compose', icon: 'compose' };

/** Everything in the sidebar, grouped by the job it serves, in order. Setup pages sit last. */
export const NAV: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/app', icon: 'dashboard', exact: true },
      { label: 'Inbox', href: '/app/inbox', icon: 'inbox', badge: 'inbox' },
    ],
  },
  {
    label: 'Social',
    items: [
      { label: 'Calendar', href: '/app/calendar', icon: 'calendar' },
      { label: 'Recurring', href: '/app/recurring', icon: 'clock' },
      { label: 'Results', href: '/app/results', icon: 'sparkles' },
      { label: 'Templates and tags', href: '/app/templates', icon: 'templates' },
      { label: 'Media library', href: '/app/media', icon: 'image' },
      { label: 'Feeds', href: '/app/feeds', icon: 'feeds' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Pipeline', href: '/app/pipeline', icon: 'pipeline' },
      { label: 'Leads', href: '/app/leads', icon: 'leads' },
    ],
  },
  {
    label: 'Staff',
    items: [
      { label: 'Hire', href: '/app/hire', icon: 'hire' },
      { label: 'Autopilot', href: '/app/autopilot', icon: 'autopilot' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Company', href: '/app/company', icon: 'company' },
      { label: 'Social accounts', href: '/app/accounts', icon: 'accounts' },
      { label: 'Mailboxes', href: '/app/mailboxes', icon: 'mail' },
      { label: 'Do not contact', href: '/app/suppressions', icon: 'shield' },
      { label: 'Settings', href: '/app/settings', icon: 'settings' },
      { label: 'Audit log', href: '/app/audit', icon: 'list' },
    ],
  },
];

/** Every page the search box can jump to: the sidebar links plus New post. */
export const ALL_ITEMS = [NEW_POST, ...NAV.flatMap((group) => group.items)];

export function isCurrent(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The section a path belongs to, for the top bar. New post lives under Social. */
export function sectionOf(pathname: string): { group?: string; item: NavItem } | null {
  if (isCurrent(NEW_POST, pathname)) return { group: 'Social', item: NEW_POST };
  for (const group of NAV) {
    const item = group.items.find((candidate) => isCurrent(candidate, pathname));
    if (item) return { group: group.label, item };
  }
  return null;
}

/** The cookie that remembers a collapsed desktop sidebar; read on the server so the page never jumps on load. */
export const SIDEBAR_COOKIE = 'sidebar';

export function isSidebarCollapsed(value: string | undefined): boolean {
  return value === 'collapsed';
}
