import Link from 'next/link';
import { apiOrRedirect } from '@/lib/api';
import { type InboxItem, PendingItem } from './inbox-forms';

export const metadata = { title: 'Inbox' };

const DECISIONS: Record<string, string> = {
  approved: 'Approved',
  edited: 'Approved with edits',
  rejected: 'Rejected',
  expired: 'Expired',
  superseded: 'Withdrawn: a fact it used changed',
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const decided = view === 'decided';
  const [items, autopilot] = await Promise.all([
    apiOrRedirect<InboxItem[]>(`/inbox${decided ? '?view=decided' : ''}`, '/app/inbox', { workspace: true }),
    apiOrRedirect<{ staffName: string; autonomy: string; mode: string; progress: { met: boolean } }[]>(
      '/autopilot',
      '/app/inbox',
      { workspace: true },
    ),
  ]);
  // Staff whose record already meets your rules but who still wait for you: a nudge to review less.
  const ready = autopilot.ok
    ? autopilot.data.filter((task) => task.autonomy === 'draft' && task.mode !== 'off' && task.progress.met)
    : [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="text-muted">Everything your staff want to send or post waits here until you approve it.</p>
        </div>
        <nav aria-label="Inbox views" className="flex gap-1 rounded-md border border-border bg-surface p-1 text-sm">
          <Link
            href="/app/inbox"
            aria-current={decided ? undefined : 'page'}
            className="rounded px-3 py-1 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            Waiting
          </Link>
          <Link
            href="/app/inbox?view=decided"
            aria-current={decided ? 'page' : undefined}
            className="rounded px-3 py-1 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            Decided
          </Link>
        </nav>
      </div>

      {ready.length > 0 ? (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          {[...new Set(ready.map((task) => task.staffName))].join(' and ')} {ready.length > 1 ? 'have' : 'has'} a clean
          record.{' '}
          <Link href="/app/autopilot" className="font-medium underline">
            Review less: set up autopilot
          </Link>
        </p>
      ) : null}

      {!items.ok ? (
        <p className="text-danger">{items.problem.title}</p>
      ) : items.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <h2 className="font-medium">{decided ? 'Nothing decided yet' : 'Nothing waiting for you'}</h2>
          <p className="mt-1 text-sm text-muted">
            {decided ? 'Approved and rejected work shows up here.' : 'New drafts appear here as your staff work.'}
          </p>
        </div>
      ) : decided ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {items.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span>
                <span className="font-medium">{item.title}</span>
                <span className="text-muted"> · {item.staffName}</span>
              </span>
              <span className="text-muted">
                {DECISIONS[item.state] ?? item.state}
                {item.rejectReason ? `: ${item.rejectReason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          {items.data.map((item) => (
            <PendingItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
