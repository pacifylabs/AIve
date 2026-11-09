import Link from 'next/link';
import { Icon } from './icons';

/** The pieces of the Dashboard home. Plain server components: they show what the page fetched and fetch nothing. */

export interface InboxItem {
  id: string;
  title: string;
  staffName: string;
  kind: string;
  flaggedReason: string | null;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  roleKey: string;
  displayName: string;
  state: 'active' | 'paused' | 'archived';
  pausedReason: string | null;
}

export interface AutopilotTask {
  staffId: string;
  taskName: string;
  autonomy: 'off' | 'draft' | 'act';
  mode: string;
  rules: { approvals: number; maxPerDay: number };
  progress: { approvals: number; met: boolean };
  autoActionsToday: number;
}

export interface Account {
  id: string;
  network: string;
  name: string;
  health: 'ok' | 'degraded' | 'broken';
  healthReason: string | null;
}

export interface Post {
  id: string;
  body: string;
  state: 'scheduled' | 'published' | 'failed' | 'cancelled';
  scheduledFor: string;
  account: { name: string; network: string } | null;
}

export interface Activity {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  social_media: 'Social Media Staff',
  sales_manager: 'Sales Manager Staff',
};

const NETWORK_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  discord: 'Discord',
};

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function CardHeader({
  title,
  aside,
  href,
  cta,
}: {
  title: string;
  aside?: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[0.95rem] font-semibold">{title}</h2>
        {aside}
      </div>
      {href ? (
        <Link href={href} className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          {cta ?? 'View all'}
          <Icon name="chevron" size={14} />
        </Link>
      ) : null}
    </div>
  );
}

// ---- Needs you ---------------------------------------------------------------------------------------------------

export function NeedsYouCard({ items }: { items: InboxItem[] }) {
  const shown = items.slice(0, 5);
  return (
    <section className="card" aria-labelledby="needs-you">
      <div id="needs-you" className="sr-only">
        Needs you
      </div>
      <CardHeader
        title="Needs you"
        aside={items.length ? <span className="pill pill-accent">{items.length} waiting</span> : null}
        href="/app/inbox"
        cta="Open inbox"
      />
      {shown.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pt-1 pb-6 text-sm text-muted">
          <span className="grid size-9 place-items-center rounded-full bg-ok-soft text-ok">
            <Icon name="check" size={16} />
          </span>
          <span>You are all caught up. New drafts appear here as your staff write them.</span>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {shown.map((item) => (
            <li key={item.id}>
              <Link href="/app/inbox" className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle">
                <span
                  className={`grid size-9 flex-none place-items-center rounded-xl ${item.flaggedReason ? 'bg-amber-soft text-amber' : 'bg-accent-soft text-accent'}`}
                >
                  <Icon name={item.flaggedReason ? 'alert' : 'inbox'} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium sm:truncate">{item.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {item.staffName}
                    {item.flaggedReason ? ` · Check first: ${item.flaggedReason}` : ''}
                  </span>
                </span>
                <span className="hidden flex-none text-xs text-muted sm:block">{timeAgo(item.createdAt)}</span>
                <span className="btn btn-primary flex-none !px-3 !py-1">Review</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Staff cards -------------------------------------------------------------------------------------------------

export function StaffCards({ staff, tasks }: { staff: StaffMember[]; tasks: AutopilotTask[] }) {
  const active = staff.filter((member) => member.state !== 'archived');
  if (active.length === 0) {
    return (
      <section className="empty">
        <h2 className="font-medium">No staff hired yet</h2>
        <p className="mt-1 text-sm text-muted">Hire a Social Media or Sales Manager staff member to get started.</p>
        <Link href="/app/hire" className="btn btn-primary mt-4">
          Hire a staff member
        </Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="staff-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="staff-heading" className="text-[0.95rem] font-semibold">
          Your staff
        </h2>
        <Link href="/app/hire" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          Hire another <Icon name="chevron" size={14} />
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {active.map((member) => {
          const own = tasks.filter((task) => task.staffId === member.id);
          const on = own.filter((task) => task.autonomy === 'act');
          const next = own.find((task) => task.autonomy === 'draft');
          const social = member.roleKey === 'social_media';
          return (
            <li key={member.id} className="card space-y-4 p-5">
              <div className="flex items-start gap-3">
                <span
                  className={`grid size-11 flex-none place-items-center rounded-2xl text-base font-semibold ${social ? 'bg-accent-soft text-accent' : 'bg-ok-soft text-ok'}`}
                  aria-hidden="true"
                >
                  {member.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.displayName}</p>
                  <p className="truncate text-sm text-muted">{ROLE_LABEL[member.roleKey] ?? member.roleKey}</p>
                </div>
                <span className={`pill ${member.state === 'active' ? 'pill-ok' : 'pill-warn'}`}>
                  {member.state === 'active' ? 'Active' : 'Paused'}
                </span>
              </div>

              {member.state === 'paused' && member.pausedReason ? (
                <p className="text-sm text-muted">{member.pausedReason}</p>
              ) : on.length > 0 ? (
                <p className="flex items-center gap-2 text-sm">
                  <span className="pill pill-ok">Autopilot on</span>
                  <span className="text-muted">
                    {on[0]!.autoActionsToday} of {on[0]!.rules.maxPerDay} today
                  </span>
                </p>
              ) : next ? (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted">Approvals toward autopilot</span>
                    <span className="font-medium tabular-nums">
                      {Math.min(next.progress.approvals, next.rules.approvals)} / {next.rules.approvals}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${member.displayName}'s approvals toward autopilot`}
                    aria-valuemin={0}
                    aria-valuemax={next.rules.approvals}
                    aria-valuenow={Math.min(next.progress.approvals, next.rules.approvals)}
                    className="h-1.5 overflow-hidden rounded-full bg-subtle"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.min(100, Math.round((next.progress.approvals / next.rules.approvals) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Everything waits for your approval.</p>
              )}

              <div className="flex gap-2">
                <Link href="/app/autopilot" className="btn !px-3 !py-1.5">
                  Autopilot
                </Link>
                <Link href="/app/inbox" className="btn btn-quiet !px-3 !py-1.5">
                  Inbox
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- Activity ----------------------------------------------------------------------------------------------------

const BAD = new Set([
  'post.failed',
  'post.missed',
  'account.broken',
  'account.expired',
  'task.dead',
  'autonomy.demoted',
  'post.uncertain',
]);
const WARN = new Set(['account.expiring']);
const GOOD = new Set(['post.published', 'autonomy.promoted_auto', 'autonomy.promoted']);

export function ActivityCard({ events }: { events: Activity[] }) {
  const shown = events.slice(0, 8);
  return (
    <section className="card" aria-labelledby="activity-heading">
      <div id="activity-heading" className="sr-only">
        Recent activity
      </div>
      <CardHeader title="Recent activity" />
      {shown.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-muted">Nothing yet. What your staff do shows up here.</p>
      ) : (
        <ol className="px-5 pb-4">
          {shown.map((event, index) => (
            <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < shown.length - 1 ? (
                <span aria-hidden="true" className="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-line-soft" />
              ) : null}
              <span
                aria-hidden="true"
                className={`relative mt-1.5 size-[0.6875rem] flex-none rounded-full ring-4 ring-surface ${BAD.has(event.type) ? 'bg-danger' : WARN.has(event.type) ? 'bg-amber' : GOOD.has(event.type) ? 'bg-ok' : 'bg-line-strong'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{event.summary}</p>
                <p className="text-xs text-muted">{timeAgo(event.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---- Calendar ----------------------------------------------------------------------------------------------------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function monthBounds(param: string | undefined, now = new Date()) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(param ?? '');
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));
  const key = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    from,
    to,
    label: from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    prev: key(new Date(Date.UTC(year, month - 1, 1))),
    next: key(to),
    isCurrent: year === now.getUTCFullYear() && month === now.getUTCMonth(),
  };
}

export function MonthCalendar({
  posts,
  month,
  now = new Date(),
}: {
  posts: Post[];
  month: ReturnType<typeof monthBounds>;
  now?: Date;
}) {
  const first = month.from;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  // Monday first: Sunday is 0 in JS, so shift it to the end of the row.
  const lead = (first.getUTCDay() + 6) % 7;
  const byDay = new Map<number, Post[]>();
  for (const post of posts) {
    if (post.state === 'cancelled') continue;
    const date = new Date(post.scheduledFor);
    if (date >= month.from && date < month.to)
      byDay.set(date.getUTCDate(), [...(byDay.get(date.getUTCDate()) ?? []), post]);
  }
  const today = month.isCurrent ? now.getUTCDate() : -1;
  const total = [...byDay.values()].reduce((sum, list) => sum + list.length, 0);

  return (
    <section className="card p-5" aria-label="Post calendar">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.95rem] font-semibold">{month.label}</h2>
        <div className="flex gap-1">
          <Link href={`/app?month=${month.prev}`} aria-label="Previous month" className="btn btn-quiet size-8 !p-0">
            <span className="rotate-180">
              <Icon name="chevron" size={16} />
            </span>
          </Link>
          <Link href={`/app?month=${month.next}`} aria-label="Next month" className="btn btn-quiet size-8 !p-0">
            <Icon name="chevron" size={16} />
          </Link>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-[0.6875rem] font-medium text-muted" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {Array.from({ length: lead }, (_, index) => (
          <span key={`lead-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const list = byDay.get(day) ?? [];
          const bad = list.some((post) => post.state === 'failed');
          const done = list.length > 0 && list.every((post) => post.state === 'published');
          return (
            <Link
              key={day}
              href="/app/calendar"
              title={list.length ? `${list.length} post${list.length === 1 ? '' : 's'}` : undefined}
              aria-label={`${day} ${month.label}${list.length ? `, ${list.length} post${list.length === 1 ? '' : 's'}` : ''}`}
              className={`relative mx-auto grid size-9 place-items-center rounded-full tabular-nums transition-colors ${
                day === today
                  ? 'bg-accent font-semibold text-accent-foreground'
                  : list.length
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'hover:bg-subtle'
              }`}
            >
              {day}
              {list.length && day !== today ? (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1 size-1 rounded-full ${bad ? 'bg-danger' : done ? 'bg-ok' : 'bg-accent'}`}
                />
              ) : null}
            </Link>
          );
        })}
      </div>
      <p className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>{total === 0 ? 'No posts this month' : `${total} post${total === 1 ? '' : 's'} this month`}</span>
        <Link href="/app/calendar" className="font-medium text-accent hover:underline">
          Open calendar
        </Link>
      </p>
    </section>
  );
}

export function UpcomingPosts({ posts, now = new Date() }: { posts: Post[]; now?: Date }) {
  const next = posts
    .filter((post) => post.state === 'scheduled' && new Date(post.scheduledFor) >= now)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 3);
  if (next.length === 0) return null;
  return (
    <section className="card" aria-labelledby="upcoming-heading">
      <div id="upcoming-heading" className="sr-only">
        Up next
      </div>
      <CardHeader title="Up next" />
      <ul className="divide-y divide-line-soft pb-1">
        {next.map((post) => (
          <li key={post.id} className="flex items-start gap-3 px-5 py-3">
            <span className="grid size-9 flex-none place-items-center rounded-xl bg-subtle text-muted">
              <Icon name="clock" size={16} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{post.body.split('\n')[0]}</span>
              <span className="block truncate text-xs text-muted">
                {post.account?.name ?? 'Account removed'} ·{' '}
                {new Date(post.scheduledFor).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'UTC',
                })}{' '}
                UTC
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Accounts ----------------------------------------------------------------------------------------------------

export function AccountsCard({ accounts }: { accounts: Account[] }) {
  return (
    <section className="card" aria-labelledby="accounts-heading">
      <div id="accounts-heading" className="sr-only">
        Connected accounts
      </div>
      <CardHeader title="Accounts" href="/app/accounts" cta={accounts.length ? 'Manage' : 'Connect'} />
      {accounts.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">
          Nothing connected yet. Connect a social account so your staff can post.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft pb-1">
          {accounts.slice(0, 6).map((account) => (
            <li key={account.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-9 flex-none place-items-center rounded-xl bg-subtle text-sm font-semibold text-text-2">
                {(NETWORK_LABEL[account.network] ?? account.network).slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{account.name}</span>
                <span className="block truncate text-xs text-muted">
                  {NETWORK_LABEL[account.network] ?? account.network}
                </span>
              </span>
              {account.health === 'ok' ? (
                <span className="pill pill-ok">Healthy</span>
              ) : (
                <Link
                  href="/app/accounts"
                  className={account.health === 'degraded' ? 'pill pill-warn' : 'pill pill-danger'}
                  title={account.healthReason ?? undefined}
                >
                  {account.health === 'degraded' ? 'Renew soon' : 'Reconnect'}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
