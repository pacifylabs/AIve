import type { WorkspaceResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import { timeAgo } from '@/components/app/dashboard';
import { Icon } from '@/components/app/icons';
import { StaffAvatar } from '@/components/app/staff-avatar';
import { apiOrRedirect } from '@/lib/api';
import { kindLabel } from '@/lib/review';
import { type ReviewItem, ReviewDetail } from './review-detail';

export const metadata = { title: 'Review work' };

interface DecidedItem extends ReviewItem {
  state: string;
  rejectReason: string | null;
  decidedAt: string | null;
}
interface Member {
  id: string;
  roleKey: string;
}

const DECISIONS: Record<string, [string, string]> = {
  approved: ['Approved', 'text-ok'],
  edited: ['Approved with edits', 'text-ok'],
  rejected: ['Rejected', 'text-danger'],
  expired: ['Expired', 'text-muted'],
  superseded: ['Withdrawn: a fact it used changed', 'text-muted'],
};

const DONE: Record<string, string> = {
  approved: 'Approved. It goes out at its time, and the record of who made it is kept.',
  plan: 'Plan approved. Drafts for the ideas you kept arrive here shortly.',
  rejected: 'Rejected. Your reason is kept, so the same mistake is less likely next time.',
  closed: 'Closed. Your note is kept with it.',
};

/**
 * The one place to decide on staff work. A list on the left and the chosen piece on the right; on a phone, the list,
 * then the piece on its own screen.
 */
export default async function ReviewWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; item?: string; done?: string }>;
}) {
  const { view, item: chosen, done } = await searchParams;
  const decided = view === 'decided';
  const [items, staff, workspace] = await Promise.all([
    apiOrRedirect<DecidedItem[]>(`/inbox${decided ? '?view=decided' : ''}`, '/app/inbox', { workspace: true }),
    apiOrRedirect<Member[]>('/staff', '/app/inbox', { workspace: true }),
    apiOrRedirect<WorkspaceResponse>('/workspace', '/app/inbox', { workspace: true }),
  ]);
  const roles = new Map((staff.ok ? staff.data : []).map((member) => [member.id, member.roleKey]));
  const timeZone = workspace.ok ? workspace.data.timezone : 'UTC';
  const list = items.ok ? items.data : [];
  const selected = decided ? undefined : (list.find((entry) => entry.id === chosen) ?? list[0]);
  const message = done ? DONE[done] : undefined;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="page-title">Review work</h1>
          <p className="text-muted">Everything your staff want to post or send waits here until you decide.</p>
        </div>
        <nav
          aria-label="Review views"
          className="inline-flex gap-1 rounded-xl border border-border bg-subtle p-1 text-sm"
        >
          <Link
            href="/app/inbox"
            aria-current={decided ? undefined : 'page'}
            className="rounded-lg px-3 py-1.5 text-muted aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
          >
            Waiting{decided ? '' : ` · ${list.length}`}
          </Link>
          <Link
            href="/app/inbox?view=decided"
            aria-current={decided ? 'page' : undefined}
            className="rounded-lg px-3 py-1.5 text-muted aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
          >
            Decided
          </Link>
        </nav>
      </div>

      {message ? (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">
          <Icon name="check" size={16} /> {message}
        </p>
      ) : null}

      {!items.ok ? (
        <p className="text-danger">{items.problem.title}</p>
      ) : list.length === 0 ? (
        <div className="empty">
          <h2 className="font-medium">{decided ? 'Nothing decided yet' : 'Nothing is waiting for you'}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {decided
              ? 'What you approve and reject is listed here, with your reasons.'
              : 'Your staff are working. New drafts land here, and nothing goes out until you approve it.'}
          </p>
          {decided ? null : (
            <Link href="/app/staff" className="btn mt-4">
              See what your staff are doing
            </Link>
          )}
        </div>
      ) : decided ? (
        <ul className="card divide-y divide-line-soft">
          {list.map((entry) => {
            const [label, colour] = DECISIONS[entry.state] ?? [entry.state, 'text-muted'];
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
                <StaffAvatar name={entry.staffName} roleKey={roles.get(entry.staffId) ?? ''} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{entry.title}</span>
                  <span className="text-xs text-muted">
                    {kindLabel(entry.kind)} · {entry.staffName}
                    {entry.decidedAt ? ` · ${timeAgo(entry.decidedAt)}` : ''}
                  </span>
                </span>
                <span className={`text-sm ${colour}`}>
                  {label}
                  {entry.rejectReason ? <span className="text-muted">: {entry.rejectReason}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <ul
            aria-label="Waiting for you"
            className={`card divide-y divide-line-soft overflow-hidden ${chosen ? 'hidden lg:block' : ''}`}
          >
            {list.map((entry) => {
              const current = entry.id === selected?.id;
              return (
                <li key={entry.id}>
                  <Link
                    href={`/app/inbox?item=${entry.id}`}
                    aria-current={current ? 'true' : undefined}
                    className="flex gap-3 border-l-[3px] border-transparent px-4 py-3.5 hover:bg-surface-2 aria-[current=true]:border-accent aria-[current=true]:bg-surface-2"
                  >
                    <StaffAvatar name={entry.staffName} roleKey={roles.get(entry.staffId) ?? ''} size="sm" />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted">{kindLabel(entry.kind)}</span>
                        {entry.flaggedReason ? (
                          <span className="pill pill-danger">Needs you</span>
                        ) : (
                          <span className="text-xs text-muted">{timeAgo(entry.createdAt)}</span>
                        )}
                      </span>
                      <span className="line-clamp-2 block text-sm font-medium">{entry.title}</span>
                      <span className="block text-xs text-muted">{entry.staffName}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {selected ? (
            <div className={`min-w-0 ${chosen ? '' : 'hidden lg:block'}`}>
              <Link href="/app/inbox" className="mb-4 inline-flex items-center gap-1 text-sm text-accent lg:hidden">
                ‹ All waiting work
              </Link>
              {/* Keyed by item, so a fresh draft never shows the previous one's edits. */}
              <ReviewDetail key={selected.id} item={selected} timeZone={timeZone} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
