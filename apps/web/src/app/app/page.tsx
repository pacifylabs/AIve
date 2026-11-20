import type { MeResponse, WorkspaceResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  type Account,
  type Activity,
  AlertsStrip,
  type InboxItem,
  type Post,
  SetupChecklist,
  timeAgo,
  UpcomingPosts,
} from '@/components/app/dashboard';
import { Icon } from '@/components/app/icons';
import { StaffAvatar } from '@/components/app/staff-avatar';
import { alertsFor, greeting, setupSteps } from '@/lib/dashboard';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';
import { activityTone, ROLE_LABEL, STANDING_LABEL, standingOf, type TaskProgress } from '@/lib/staff';
import { kindLabel } from '@/lib/review';

export const metadata = { title: 'Home' };

interface Member {
  id: string;
  roleKey: string;
  displayName: string;
  state: 'active' | 'paused' | 'archived';
}
interface Task extends TaskProgress {
  staffId: string;
  taskName: string;
}
interface Waiting extends InboxItem {
  staffId: string;
  kind: string;
}
interface Event extends Activity {
  staffId: string | null;
}

const STANDING_PILL = {
  paused: 'pill',
  probation: 'pill pill-warn',
  ready: 'pill pill-accent',
  trusted: 'pill pill-ok',
} as const;

export default async function HomePage() {
  const me = await apiOrRedirect<MeResponse>('/me', '/app');
  if (!me.ok) return <p className="text-danger">{me.problem.title}</p>;

  // No workspace yet: the guided setup starts by making one.
  if (me.data.workspaces.length === 0) redirect('/app/welcome');

  const { workspaceId } = await readSession();
  const selected = me.data.workspaces.find((workspace) => workspace.id === workspaceId) ?? me.data.workspaces[0]!;
  const now = new Date();
  // Posts from the last month (for failures) to two weeks ahead (for what goes out next): one request for both.
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const to = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const opts = { workspace: true } as const;
  const [workspace, inbox, staff, autopilot, accounts, posts, activity, company, mailboxes] = await Promise.all([
    apiOrRedirect<WorkspaceResponse>('/workspace', '/app', opts),
    apiOrRedirect<Waiting[]>('/inbox', '/app', opts),
    apiOrRedirect<Member[]>('/staff', '/app', opts),
    apiOrRedirect<Task[]>('/autopilot', '/app', opts),
    apiOrRedirect<Account[]>('/social/accounts', '/app', opts),
    apiOrRedirect<Post[]>(`/social/posts?from=${from}&to=${to}`, '/app', opts),
    apiOrRedirect<Event[]>('/activity', '/app', opts),
    apiOrRedirect<{ profile: { summary: string | null }; facts: { confirmedAt: string | null }[] }>(
      '/company',
      '/app',
      opts,
    ),
    apiOrRedirect<{ id: string }[]>('/mailboxes', '/app', opts),
  ]);
  const list = <T,>(result: { ok: true; data: T[] } | { ok: false }) => (result.ok ? result.data : []);
  const waiting = list(inbox);
  const tasks = list(autopilot);
  const members = list(staff).filter((member) => member.state !== 'archived');
  const events = list(activity);
  const steps = setupSteps({
    // Either a description or a confirmed fact is enough for staff to work from.
    hasCompany:
      company.ok && (!!company.data.profile.summary?.trim() || company.data.facts.some((fact) => fact.confirmedAt)),
    hasChannel: list(accounts).length > 0 || list(mailboxes).length > 0,
    hasStaff: members.length > 0,
    hasApproved: tasks.some((task) => task.progress.approvals > 0),
  });
  const timeZone = workspace.ok ? workspace.data.timezone : 'UTC';
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone });
  const names = new Map(members.map((member) => [member.id, member]));
  const first = waiting[0];
  const hired = new Set(members.map((member) => member.roleKey));
  const unhired = Object.keys(ROLE_LABEL).filter((role) => !hired.has(role));
  const postsSocially = hired.has('social_media') || list(posts).length > 0;

  return (
    <div className="space-y-9">
      <header className="space-y-1">
        <p className="text-sm text-muted">
          {today} · {workspace.ok ? workspace.data.name : selected.name}
        </p>
        <h1 className="page-title">{greeting(me.data.name, timeZone, now)}</h1>
      </header>

      <AlertsStrip alerts={alertsFor(list(accounts), list(posts))} />

      {waiting.length > 0 && first ? (
        <section
          aria-labelledby="needs-heading"
          className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-accent/25 bg-accent-soft px-6 py-6 sm:px-8"
        >
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-accent">
              Needs you · {waiting.length} {waiting.length === 1 ? 'item' : 'items'}
            </p>
            <h2 id="needs-heading" className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {first.staffName}&apos;s {kindLabel(first.kind).toLowerCase()} is ready: {first.title}
            </h2>
            <p className="text-sm text-text-2">
              {waiting.length > 1
                ? `And ${waiting.length - 1} more. Nothing goes out until you approve it.`
                : 'Nothing goes out until you approve it.'}
            </p>
          </div>
          <Link href={`/app/inbox?item=${first.id}`} className="btn btn-primary flex-none">
            Review now <Icon name="arrow" size={16} />
          </Link>
        </section>
      ) : members.length === 0 ? (
        <section
          aria-labelledby="first-hire-heading"
          className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-accent/25 bg-accent-soft px-6 py-6 sm:px-8"
        >
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-accent">Next step</p>
            <h2 id="first-hire-heading" className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Hire your first staff member
            </h2>
            <p className="text-sm text-text-2">
              A few minutes: choose a role, confirm what is true about your business, and they start on probation.
            </p>
          </div>
          <Link href="/app/welcome" className="btn btn-primary flex-none">
            Continue setting up <Icon name="arrow" size={16} />
          </Link>
        </section>
      ) : members.length > 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-ok-soft px-5 py-4 text-sm text-ok">
          <Icon name="check" size={16} /> Nothing is waiting for you. Your staff are working, and new drafts will land
          in Review work.
        </p>
      ) : null}

      <SetupChecklist steps={steps} />

      {members.length > 0 ? (
        <section aria-labelledby="staff-heading" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 id="staff-heading" className="font-semibold">
              Your staff
            </h2>
            <Link href="/app/staff" className="text-sm text-accent">
              See all
            </Link>
          </div>
          <ul className="grid gap-4 lg:grid-cols-2">
            {members.map((member) => {
              const own = tasks.filter((task) => task.staffId === member.id);
              const standing = standingOf(member.state, own);
              const last = events.find((event) => event.staffId === member.id);
              const theirs = waiting.filter((item) => item.staffId === member.id).length;
              return (
                <li key={member.id}>
                  <Link
                    href={`/app/staff/${member.id}`}
                    className="card flex h-full flex-col gap-3 p-5 hover:border-line-strong"
                  >
                    <div className="flex items-center gap-3">
                      <StaffAvatar name={member.displayName} roleKey={member.roleKey} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{member.displayName}</span>
                        <span className="block truncate text-sm text-muted">
                          {ROLE_LABEL[member.roleKey] ?? member.roleKey}
                        </span>
                      </span>
                      <span className={STANDING_PILL[standing]}>{STANDING_LABEL[standing]}</span>
                    </div>
                    <p className="text-sm text-text-2">
                      {last
                        ? `${last.summary} · ${timeAgo(last.createdAt)}`
                        : 'Getting started on their first piece of work.'}
                    </p>
                    <p className={`mt-auto text-sm ${theirs ? 'font-medium text-amber' : 'text-muted'}`}>
                      {theirs ? `${theirs} waiting for you` : 'Nothing waiting for you'}
                    </p>
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
                  <span>
                    <span className="block font-semibold">Hire {ROLE_LABEL[role]}</span>
                    <span className="block text-sm text-muted">
                      Your business info carries over, so it takes a couple of minutes.
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {members.length > 0 ? (
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
          <section aria-labelledby="did-heading" className="min-w-0 space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 id="did-heading" className="font-semibold">
                What your staff did
              </h2>
              <Link href="/app/activity" className="text-sm text-accent">
                All activity
              </Link>
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet. Their first work shows up here.</p>
            ) : (
              <ol className="divide-y divide-line-soft border-y border-line-soft">
                {events.slice(0, 6).map((event) => {
                  const member = event.staffId ? names.get(event.staffId) : undefined;
                  const tone = activityTone(event.type);
                  return (
                    <li key={event.id} className="flex items-start gap-3 py-3">
                      {member ? (
                        <StaffAvatar name={member.displayName} roleKey={member.roleKey} size="sm" />
                      ) : (
                        <span aria-hidden="true" className="size-7 flex-none" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          {tone === 'bad' ? <span className="sr-only">Problem: </span> : null}
                          {event.summary}
                        </p>
                        <p className={`text-xs ${tone === 'bad' ? 'text-danger' : 'text-muted'}`}>
                          {member ? `${member.displayName} · ` : ''}
                          {timeAgo(event.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          {postsSocially ? (
            <div className="min-w-0 space-y-3">
              <UpcomingPosts posts={list(posts)} timeZone={timeZone} now={now} />
              <Link href="/app/calendar" className="inline-flex text-sm text-accent">
                Open the calendar
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
