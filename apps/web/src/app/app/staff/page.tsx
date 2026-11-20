import Link from 'next/link';
import { Icon } from '@/components/app/icons';
import { StaffAvatar } from '@/components/app/staff-avatar';
import { timeAgo } from '@/components/app/dashboard';
import { apiOrRedirect } from '@/lib/api';
import { ROLE_LABEL, STANDING_LABEL, standingOf, type TaskProgress } from '@/lib/staff';

export const metadata = { title: 'My staff' };

interface Member {
  id: string;
  roleKey: string;
  displayName: string;
  state: 'active' | 'paused' | 'archived';
  pausedReason: string | null;
  createdAt: string;
}
interface Task extends TaskProgress {
  staffId: string;
  taskName: string;
}
interface Pending {
  staffId: string;
}
interface Event {
  staffId: string | null;
  summary: string;
  createdAt: string;
}

const STANDING_PILL = {
  paused: 'pill',
  probation: 'pill pill-warn',
  ready: 'pill pill-accent',
  trusted: 'pill pill-ok',
} as const;

export default async function StaffPage() {
  const [staff, autopilot, inbox, activity] = await Promise.all([
    apiOrRedirect<Member[]>('/staff', '/app/staff', { workspace: true }),
    apiOrRedirect<Task[]>('/autopilot', '/app/staff', { workspace: true }),
    apiOrRedirect<Pending[]>('/inbox', '/app/staff', { workspace: true }),
    apiOrRedirect<Event[]>('/activity', '/app/staff', { workspace: true }),
  ]);
  if (!staff.ok) return <p className="text-danger">{staff.problem.title}</p>;
  const members = staff.data.filter((member) => member.state !== 'archived');
  const tasks = autopilot.ok ? autopilot.data : [];
  const pending = inbox.ok ? inbox.data : [];
  const events = activity.ok ? activity.data : [];
  const hiredRoles = new Set(members.map((member) => member.roleKey));
  const unhired = Object.keys(ROLE_LABEL).filter((role) => !hiredRoles.has(role));

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="page-title">My staff</h1>
          <p className="text-muted">
            Who works for you, what they are doing, and how much they are trusted to do alone.
          </p>
        </div>
        <Link href="/app/hire" className="btn btn-primary">
          <Icon name="hire" size={16} /> Hire staff
        </Link>
      </div>

      {members.length === 0 ? (
        <div className="empty">
          <h2 className="font-medium">No one on staff yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Hire a Social Media or Sales Manager staff member. They start on probation: everything they make waits for
            your approval until they have earned more.
          </p>
          <Link href="/app/hire" className="btn btn-primary mt-4">
            Hire your first staff member
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {members.map((member) => {
            const own = tasks.filter((task) => task.staffId === member.id);
            const standing = standingOf(member.state, own);
            const waiting = pending.filter((item) => item.staffId === member.id).length;
            const last = events.find((event) => event.staffId === member.id);
            // The task closest to promotion, to show how far the record has come.
            const climbing = own
              .filter((task) => task.autonomy === 'draft' && task.mode !== 'off')
              .sort((a, b) => b.progress.approvals / b.rules.approvals - a.progress.approvals / a.rules.approvals)[0];
            return (
              <li key={member.id}>
                <Link
                  href={`/app/staff/${member.id}`}
                  className="card flex h-full flex-col gap-4 p-5 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-center gap-3">
                    <StaffAvatar name={member.displayName} roleKey={member.roleKey} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{member.displayName}</p>
                      <p className="truncate text-sm text-muted">
                        {ROLE_LABEL[member.roleKey] ?? member.roleKey} · hired {timeAgo(member.createdAt)}
                      </p>
                    </div>
                    <span className={STANDING_PILL[standing]}>{STANDING_LABEL[standing]}</span>
                  </div>
                  <p className="text-sm text-text-2">
                    {member.state === 'paused'
                      ? `Paused${member.pausedReason ? `: ${member.pausedReason}` : '.'}`
                      : last
                        ? `Last: ${last.summary}`
                        : 'Getting started on their first piece of work.'}
                  </p>
                  {climbing ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted">
                        <span>{climbing.taskName}: record toward promotion</span>
                        <span className="text-foreground tabular-nums">
                          {Math.min(climbing.progress.approvals, climbing.rules.approvals)} of{' '}
                          {climbing.rules.approvals}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full bg-social"
                          style={{
                            width: `${Math.min(100, (100 * climbing.progress.approvals) / climbing.rules.approvals)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between border-t border-line-soft pt-3 text-sm">
                    <span className={waiting ? 'font-medium text-amber' : 'text-muted'}>
                      {waiting ? `${waiting} waiting for you` : 'Nothing waiting for you'}
                    </span>
                    <span className="flex items-center gap-1 text-accent">
                      Open <Icon name="chevron" size={15} />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
          {unhired.map((role) => (
            <li key={role}>
              <Link
                href={`/app/hire?role=${role}`}
                className="flex h-full items-center gap-3 rounded-2xl border border-dashed border-line-strong p-5 hover:bg-surface"
              >
                <StaffAvatar name="+" roleKey={role} />
                <div>
                  <p className="font-semibold">Hire {ROLE_LABEL[role]}</p>
                  <p className="text-sm text-muted">
                    Your business info carries over, so it takes a couple of minutes.
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
