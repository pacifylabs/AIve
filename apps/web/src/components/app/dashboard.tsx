import Link from 'next/link';
import type { Alert, SetupStep } from '@/lib/dashboard';
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
  id,
  title,
  aside,
  href,
  cta,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-center gap-2.5">
        <h2 id={id} className="text-[0.95rem] font-semibold">
          {title}
        </h2>
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

// ---- Staff cards -------------------------------------------------------------------------------------------------

// ---- Activity ----------------------------------------------------------------------------------------------------

// ---- Calendar ----------------------------------------------------------------------------------------------------

export function UpcomingPosts({ posts, timeZone, now = new Date() }: { posts: Post[]; timeZone: string; now?: Date }) {
  const next = posts
    .filter((post) => post.state === 'scheduled' && new Date(post.scheduledFor) >= now)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 3);
  if (next.length === 0) return null;
  return (
    <section className="card" aria-labelledby="upcoming-heading">
      <CardHeader id="upcoming-heading" title="Up next" />
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
                  timeZone,
                })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Accounts ----------------------------------------------------------------------------------------------------

// ---- Alerts ------------------------------------------------------------------------------------------------------

export function AlertsStrip({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <section aria-label="Needs fixing" className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="alert"
          className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            alert.tone === 'danger' ? 'border-danger/30 bg-danger-soft' : 'border-amber/30 bg-amber-soft'
          }`}
        >
          <span className={alert.tone === 'danger' ? 'text-danger' : 'text-amber'} aria-hidden="true">
            <Icon name="alert" size={16} />
          </span>
          <p className="min-w-0 flex-1">{alert.text}</p>
          <Link href={alert.href} className="btn btn-sm">
            {alert.cta}
          </Link>
        </div>
      ))}
    </section>
  );
}

// ---- Setup -------------------------------------------------------------------------------------------------------

/** The first things a new workspace does, in order. Gone once every one is done. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const next = steps.findIndex((step) => !step.done);
  return (
    <section id="setup" className="card scroll-mt-24" aria-labelledby="setup-heading">
      <CardHeader
        id="setup-heading"
        title="Get set up"
        aside={
          <span className="pill">
            {done} of {steps.length} done
          </span>
        }
      />
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        className="mx-5 h-1.5 overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="divide-y divide-line-soft pt-2 pb-1 xl:grid xl:grid-cols-2 xl:divide-y-0">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3 px-5 py-3">
            <span
              className={`grid size-8 flex-none place-items-center rounded-full text-xs font-semibold ${
                step.done
                  ? 'bg-ok-soft text-ok'
                  : index === next
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-subtle text-muted'
              }`}
            >
              {step.done ? <Icon name="check" size={14} /> : index + 1}
              <span className="sr-only">{step.done ? ' done' : ' to do'}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-medium ${step.done ? 'text-muted line-through' : ''}`}>
                {step.label}
              </span>
              {!step.done ? <span className="block text-xs text-muted">{step.text}</span> : null}
            </span>
            {!step.done ? (
              <Link href={step.href} className={`btn btn-sm flex-none ${index === next ? 'btn-primary' : ''}`}>
                {step.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- This week ---------------------------------------------------------------------------------------------------
