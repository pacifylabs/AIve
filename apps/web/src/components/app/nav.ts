import type { IconName } from './icons';

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Only the exact address is "current", not the pages beneath it. */
  exact?: boolean;
  /** Which count from the layout to show beside it. */
  badge?: 'inbox';
  /** Other pages that belong to this place, so it stays highlighted on them. */
  also?: string[];
  /** Shown only when the workspace has hired this role. */
  needsRole?: 'sales_manager';
}

/** The pages inside a place, shown as tabs at the top of each of them. */
export interface SectionTab {
  label: string;
  href: string;
}

/**
 * The menu: six places for daily work, then three set once. Everything else lives inside one of them (see SECTIONS),
 * so an owner never has to know a page's name to find it.
 */
export const PRIMARY: NavItem[] = [
  { label: 'Home', href: '/app', icon: 'home', exact: true },
  { label: 'Review work', href: '/app/inbox', icon: 'inbox', badge: 'inbox' },
  { label: 'My staff', href: '/app/staff', icon: 'hire', also: ['/app/hire', '/app/autopilot', '/app/feeds'] },
  {
    label: 'Content',
    href: '/app/calendar',
    icon: 'calendar',
    also: ['/app/compose', '/app/recurring', '/app/results', '/app/templates', '/app/media'],
  },
  {
    label: 'Sales',
    href: '/app/pipeline',
    icon: 'pipeline',
    also: ['/app/leads', '/app/suppressions'],
    needsRole: 'sales_manager',
  },
  { label: 'Activity', href: '/app/activity', icon: 'list', also: ['/app/audit'] },
];

export const SETUP: NavItem[] = [
  { label: 'Business info', href: '/app/company', icon: 'company' },
  { label: 'Connections', href: '/app/accounts', icon: 'accounts', also: ['/app/mailboxes'] },
  { label: 'Settings', href: '/app/settings', icon: 'settings' },
];

/** The tabs inside each place that holds more than one page. */
export const SECTIONS: Record<'content' | 'sales' | 'activity' | 'connections', SectionTab[]> = {
  content: [
    { label: 'Calendar', href: '/app/calendar' },
    { label: 'Recurring posts', href: '/app/recurring' },
    { label: 'Results', href: '/app/results' },
    { label: 'Templates and tags', href: '/app/templates' },
    { label: 'Media', href: '/app/media' },
  ],
  sales: [
    { label: 'Pipeline', href: '/app/pipeline' },
    { label: 'Leads', href: '/app/leads' },
    { label: 'Do not contact', href: '/app/suppressions' },
  ],
  activity: [
    { label: 'What staff did', href: '/app/activity' },
    { label: 'Who changed what', href: '/app/audit' },
  ],
  connections: [
    { label: 'Social accounts', href: '/app/accounts' },
    { label: 'Mailboxes', href: '/app/mailboxes' },
  ],
};

/** The places a person can jump to from search: the menu, plus every tab and the two actions. */
export const ALL_ITEMS: NavItem[] = [
  ...PRIMARY,
  ...SETUP,
  { label: 'New post', href: '/app/compose', icon: 'compose' },
  { label: 'Hire staff', href: '/app/hire', icon: 'hire' },
  { label: 'Autopilot rules', href: '/app/autopilot', icon: 'autopilot' },
  { label: 'Feeds', href: '/app/feeds', icon: 'feeds' },
  ...Object.values(SECTIONS)
    .flat()
    .filter((tab) => ![...PRIMARY, ...SETUP].some((item) => item.href === tab.href))
    .map((tab) => ({ label: tab.label, href: tab.href, icon: 'list' as IconName })),
];

const under = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

export function isCurrent(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return [item.href, ...(item.also ?? [])].some((href) => under(href, pathname));
}

/** The menu items this workspace sees: Sales only once a Sales Manager is on staff. */
export function visiblePrimary(roles: readonly string[]): NavItem[] {
  return PRIMARY.filter((item) => !item.needsRole || roles.includes(item.needsRole));
}

/** The place a path belongs to, for the top bar. */
export function sectionOf(pathname: string): NavItem | null {
  return [...PRIMARY, ...SETUP].find((item) => isCurrent(item, pathname)) ?? null;
}

/** The cookie that remembers a collapsed desktop sidebar; read on the server so the page never jumps on load. */
export const SIDEBAR_COOKIE = 'sidebar';

export function isSidebarCollapsed(value: string | undefined): boolean {
  return value === 'collapsed';
}
