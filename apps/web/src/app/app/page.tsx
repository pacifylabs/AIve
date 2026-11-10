import type { MeResponse, WorkspaceResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import {
  type Account,
  AccountsCard,
  type Activity,
  ActivityCard,
  AlertsStrip,
  type AutopilotTask,
  type InboxItem,
  monthBounds,
  MonthCalendar,
  NeedsYouCard,
  type Post,
  SetupChecklist,
  type StaffMember,
  StaffCards,
  UpcomingPosts,
  WeekNumbers,
} from '@/components/app/dashboard';
import { alertsFor, primaryAction, setupSteps, weekFigures } from '@/lib/dashboard';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';
import { CreateWorkspaceForm } from './workspace-forms';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams;
  const me = await apiOrRedirect<MeResponse>('/me', '/app');
  if (!me.ok) return <p className="text-danger">{me.problem.title}</p>;

  if (me.data.workspaces.length === 0) {
    return (
      <section className="mx-auto max-w-md space-y-6 pt-8">
        <div className="space-y-1">
          <h1 className="page-title">Set up your workspace</h1>
          <p className="text-muted">
            Your AI staff, approvals and billing live in a workspace. You can invite your team next.
          </p>
        </div>
        <div className="card p-6">
          <CreateWorkspaceForm />
        </div>
      </section>
    );
  }

  const { workspaceId } = await readSession();
  const selected = me.data.workspaces.find((workspace) => workspace.id === workspaceId) ?? me.data.workspaces[0]!;
  const month = monthBounds(monthParam);
  const opts = { workspace: true } as const;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [workspace, inbox, staff, autopilot, accounts, posts, activity, company, mailboxes, week, top, stats] =
    await Promise.all([
      apiOrRedirect<WorkspaceResponse>('/workspace', '/app', opts),
      apiOrRedirect<InboxItem[]>('/inbox', '/app', opts),
      apiOrRedirect<StaffMember[]>('/staff', '/app', opts),
      apiOrRedirect<AutopilotTask[]>('/autopilot', '/app', opts),
      apiOrRedirect<Account[]>('/social/accounts', '/app', opts),
      apiOrRedirect<Post[]>(
        `/social/posts?from=${month.from.toISOString()}&to=${month.to.toISOString()}`,
        '/app',
        opts,
      ),
      apiOrRedirect<Activity[]>('/activity', '/app', opts),
      apiOrRedirect<{ profile: { summary: string | null } }>('/company', '/app', opts),
      apiOrRedirect<{ id: string }[]>('/mailboxes', '/app', opts),
      apiOrRedirect<Post[]>(`/social/posts?from=${weekAgo.toISOString()}&to=${now.toISOString()}`, '/app', opts),
      apiOrRedirect<{ engagement: number }[]>('/social/top-posts?days=7&limit=50', '/app', opts),
      apiOrRedirect<{ reach: number | null; change: number }[]>('/social/stats?days=7', '/app', opts),
    ]);
  const list = <T,>(result: { ok: true; data: T[] } | { ok: false }) => (result.ok ? result.data : []);
  const waiting = list(inbox);
  const tasks = list(autopilot);
  const steps = setupSteps({
    hasCompany: company.ok && !!company.data.profile.summary?.trim(),
    hasChannel: list(accounts).length > 0 || list(mailboxes).length > 0,
    hasStaff: list(staff).some((member) => member.state !== 'archived'),
    hasApproved: tasks.some((task) => task.progress.approvals > 0),
  });
  const primary = primaryAction(waiting.length, steps);
  const shortcuts = [
    { label: 'New post', href: '/app/compose' },
    { label: 'Hire staff', href: '/app/hire' },
  ].filter((shortcut) => shortcut.href !== primary.href);
  const timeZone = workspace.ok ? workspace.data.timezone : 'UTC';
  const name = workspace.ok ? workspace.data.name : selected.name;
  const role = selected.role === 'owner' ? 'Owner' : selected.role === 'admin' ? 'Admin' : 'Member';
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow">{today}</p>
          <h1 className="page-title">{name}</h1>
          <p className="text-sm text-muted">
            <span className="pill pill-accent mr-2">{role}</span>
            {waiting.length > 0
              ? `${waiting.length} ${waiting.length === 1 ? 'draft is' : 'drafts are'} waiting for you.`
              : 'Nothing is waiting for you right now.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={primary.href} className="btn btn-primary">
            {primary.label}
          </Link>
          {shortcuts.map((shortcut) => (
            <Link key={shortcut.href} href={shortcut.href} className="btn">
              {shortcut.label}
            </Link>
          ))}
        </div>
      </header>

      <AlertsStrip alerts={alertsFor(list(accounts), list(posts))} />
      <SetupChecklist steps={steps} />

      <WeekNumbers figures={weekFigures(list(week), list(top), list(stats), now)} />

      {/* Work on the left, two parts to one; the people, the month and the accounts on the right. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="min-w-0 space-y-6">
          <NeedsYouCard items={waiting} />
          <UpcomingPosts posts={list(posts)} timeZone={timeZone} now={now} />
          <ActivityCard events={list(activity)} />
        </div>
        <div className="min-w-0 space-y-6">
          <StaffCards staff={list(staff)} tasks={tasks} />
          <MonthCalendar posts={list(posts)} month={month} now={now} />
          <AccountsCard accounts={list(accounts)} />
        </div>
      </div>
    </div>
  );
}
