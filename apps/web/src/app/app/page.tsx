import type { MeResponse, WorkspaceResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import {
  type Account,
  AccountsCard,
  type Activity,
  ActivityCard,
  type AutopilotTask,
  type InboxItem,
  monthBounds,
  MonthCalendar,
  NeedsYouCard,
  type Post,
  type StaffMember,
  StaffCards,
  UpcomingPosts,
} from '@/components/app/dashboard';
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
  const [workspace, inbox, staff, autopilot, accounts, posts, activity] = await Promise.all([
    apiOrRedirect<WorkspaceResponse>('/workspace', '/app', opts),
    apiOrRedirect<InboxItem[]>('/inbox', '/app', opts),
    apiOrRedirect<StaffMember[]>('/staff', '/app', opts),
    apiOrRedirect<AutopilotTask[]>('/autopilot', '/app', opts),
    apiOrRedirect<Account[]>('/social/accounts', '/app', opts),
    apiOrRedirect<Post[]>(`/social/posts?from=${month.from.toISOString()}&to=${month.to.toISOString()}`, '/app', opts),
    apiOrRedirect<Activity[]>('/activity', '/app', opts),
  ]);
  const name = workspace.ok ? workspace.data.name : selected.name;
  const role = selected.role === 'owner' ? 'Owner' : selected.role === 'admin' ? 'Admin' : 'Member';
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow">{today}</p>
          <h1 className="page-title">{name}</h1>
          <p className="text-sm text-muted">
            <span className="pill pill-accent mr-2">{role}</span>
            {inbox.ok && inbox.data.length > 0
              ? `${inbox.data.length} ${inbox.data.length === 1 ? 'draft is' : 'drafts are'} waiting for you.`
              : 'Nothing is waiting for you right now.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/inbox" className="btn btn-primary">
            Open inbox
          </Link>
          <Link href="/app/hire" className="btn">
            Hire staff
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <NeedsYouCard items={inbox.ok ? inbox.data : []} />
          <StaffCards staff={staff.ok ? staff.data : []} tasks={autopilot.ok ? autopilot.data : []} />
          <ActivityCard events={activity.ok ? activity.data : []} />
        </div>
        <div className="min-w-0 space-y-6">
          <MonthCalendar posts={posts.ok ? posts.data : []} month={month} />
          <UpcomingPosts posts={posts.ok ? posts.data : []} />
          <AccountsCard accounts={accounts.ok ? accounts.data : []} />
        </div>
      </div>
    </div>
  );
}
