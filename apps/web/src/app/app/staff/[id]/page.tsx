import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setStaffStateAction } from '@/app/actions/platform';
import { timeAgo } from '@/components/app/dashboard';
import { Icon } from '@/components/app/icons';
import { PlanWeekButton } from '@/components/app/plan-week-button';
import { StaffAvatar } from '@/components/app/staff-avatar';
import { SubmitButton } from '@/components/form';
import { apiOrRedirect } from '@/lib/api';
import { activityTone, NETWORK_LABEL, ROLE_LABEL, STANDING_LABEL, standingOf, type TaskProgress } from '@/lib/staff';

interface Member {
  id: string;
  roleKey: string;
  displayName: string;
  state: 'active' | 'paused' | 'archived';
  pausedReason: string | null;
  signature: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
}
interface Task extends TaskProgress {
  staffId: string;
  taskType: string;
  taskName: string;
  autoActionsToday: number;
  rules: { approvals: number; maxPerDay?: number };
}
interface Item {
  id: string;
  staffId: string;
  kind: string;
  title: string;
  createdAt: string;
}
interface Event {
  id: string;
  staffId: string | null;
  type: string;
  summary: string;
  createdAt: string;
}
interface Account {
  id: string;
  network: string;
  name: string;
  health: 'ok' | 'degraded' | 'broken';
}

const TABS = [
  ['overview', 'Overview'],
  ['work', 'Waiting for you'],
  ['trust', 'Trust'],
  ['routines', 'Routines'],
  ['brief', 'Brief'],
] as const;
type Tab = (typeof TABS)[number][0];

const STANDING_PILL = {
  paused: 'pill',
  probation: 'pill pill-warn',
  ready: 'pill pill-accent',
  trusted: 'pill pill-ok',
} as const;

/** What each task may do now, in words, with the colour of its standing. */
function trustState(task: Task): { label: string; pill: string; note: string } {
  if (task.autonomy === 'off') return { label: 'Switched off', pill: 'pill', note: 'This task does not run.' };
  if (task.autonomy === 'act') {
    return {
      label: 'Acts alone',
      pill: 'pill pill-ok',
      note: `Acted alone ${task.autoActionsToday} time${task.autoActionsToday === 1 ? '' : 's'} today. Guardrails still check everything.`,
    };
  }
  if (task.mode === 'off') return { label: 'Always asks you', pill: 'pill', note: 'You chose to review every one.' };
  const done = Math.min(task.progress.approvals, task.rules.approvals);
  return task.progress.met
    ? {
        label: 'Ready to promote',
        pill: 'pill pill-accent',
        note: `${done} of ${task.rules.approvals} clean approvals.`,
      }
    : { label: 'Asks you', pill: 'pill pill-warn', note: `${done} of ${task.rules.approvals} clean approvals so far.` };
}

/** The brief in the owner's words: the answers given at hire, labelled, skipping anything left empty. */
function briefRows(member: Member): [string, string][] {
  const s = member.settings;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').join(' · ') : '';
  const rows: [string, string][] =
    member.roleKey === 'sales_manager'
      ? [
          ['Ideal customer', text(s.idealCustomer)],
          ['Problem solved', text(s.problem)],
          ['May offer', text(s.offer)],
          ['Always comes to you', text(s.escalateWhen)],
          ['Sends people to', text(s.ctaUrl)],
          ['Signs emails', text(member.signature)],
        ]
      : [
          ['Goal of each post', text(s.goal)],
          ['Topics', list(s.pillars)],
          ['Posts a week, per account', typeof s.cadence === 'number' ? String(s.cadence) : ''],
          ['Never posts about', text(s.neverPost)],
        ];
  return rows.filter(([, value]) => value);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await apiOrRedirect<Member[]>('/staff', `/app/staff/${id}`, { workspace: true });
  const member = staff.ok ? staff.data.find((candidate) => candidate.id === id) : undefined;
  return { title: member?.displayName ?? 'Staff member' };
}

export default async function StaffMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: requested } = await searchParams;
  const tab: Tab = TABS.some(([key]) => key === requested) ? (requested as Tab) : 'overview';
  const here = `/app/staff/${id}`;
  const [staff, autopilot, inbox, activity, accounts] = await Promise.all([
    apiOrRedirect<Member[]>('/staff', here, { workspace: true }),
    apiOrRedirect<Task[]>('/autopilot', here, { workspace: true }),
    apiOrRedirect<Item[]>('/inbox', here, { workspace: true }),
    apiOrRedirect<Event[]>('/activity', here, { workspace: true }),
    apiOrRedirect<Account[]>('/social/accounts', here, { workspace: true }),
  ]);
  if (!staff.ok) return <p className="text-danger">{staff.problem.title}</p>;
  const member = staff.data.find((candidate) => candidate.id === id && candidate.state !== 'archived');
  if (!member) notFound();

  const tasks = autopilot.ok ? autopilot.data.filter((task) => task.staffId === id) : [];
  const waiting = inbox.ok ? inbox.data.filter((item) => item.staffId === id) : [];
  const events = activity.ok ? activity.data.filter((event) => event.staffId === id) : [];
  const accountIds = Array.isArray(member.settings.accountIds) ? (member.settings.accountIds as string[]) : [];
  const postsTo = accounts.ok ? accounts.data.filter((account) => accountIds.includes(account.id)) : [];
  const standing = standingOf(member.state, tasks);
  const social = member.roleKey === 'social_media';
  const paused = member.state === 'paused';

  return (
    <section className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/app/staff" className="hover:text-foreground">
          My staff
        </Link>{' '}
        / <span className="text-foreground">{member.displayName}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-4">
        <StaffAvatar name={member.displayName} roleKey={member.roleKey} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">{member.displayName}</h1>
            <span className={STANDING_PILL[standing]}>{STANDING_LABEL[standing]}</span>
          </div>
          <p className="text-sm text-muted">
            {ROLE_LABEL[member.roleKey] ?? member.roleKey} · hired {timeAgo(member.createdAt)}
            {postsTo.length ? ` · posts to ${postsTo.map((account) => NETWORK_LABEL[account.network]).join(', ')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <form action={setStaffStateAction}>
            <input type="hidden" name="staffId" value={member.id} />
            <input type="hidden" name="state" value={paused ? 'active' : 'paused'} />
            <SubmitButton variant="secondary" pendingLabel={paused ? 'Resuming…' : 'Pausing…'}>
              {paused ? `Put ${member.displayName} back to work` : `Pause ${member.displayName}`}
            </SubmitButton>
          </form>
          {social && !paused ? <PlanWeekButton staffId={member.id} /> : null}
        </div>
      </header>

      {paused ? (
        <p className="rounded-xl bg-subtle px-4 py-3 text-sm text-text-2">
          {member.displayName} is paused{member.pausedReason ? ` (${member.pausedReason.toLowerCase()})` : ''}. Nothing
          new starts; work already waiting for you stays in Review work.
        </p>
      ) : null}

      <nav
        aria-label={`${member.displayName}'s pages`}
        className="-mb-px flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === 'overview' ? here : `${here}?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-muted hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {label}
            {key === 'work' && waiting.length ? (
              <span className="ml-1.5 text-amber tabular-nums">{waiting.length}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
          <div className="min-w-0 space-y-8">
            <WaitingList items={waiting.slice(0, 5)} total={waiting.length} here={here} name={member.displayName} />
            <section aria-labelledby="recent-h" className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 id="recent-h" className="font-semibold">
                  Recent work
                </h2>
                <Link href={`/app/activity?staff=${member.id}`} className="text-sm text-accent">
                  All activity
                </Link>
              </div>
              {events.length === 0 ? (
                <p className="text-sm text-muted">Nothing yet. Their first piece of work shows up here.</p>
              ) : (
                <ol className="divide-y divide-line-soft border-y border-line-soft">
                  {events.slice(0, 6).map((event) => {
                    const tone = activityTone(event.type);
                    return (
                      <li key={event.id} className="flex items-start justify-between gap-4 py-3">
                        <p className="text-sm">
                          {tone === 'bad' ? <span className="sr-only">Problem: </span> : null}
                          {event.summary}
                        </p>
                        <span
                          className={`flex-none text-xs ${tone === 'bad' ? 'text-danger' : tone === 'good' ? 'text-ok' : 'text-muted'}`}
                        >
                          {timeAgo(event.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
          <div className="min-w-0 space-y-8">
            <TrustPanel tasks={tasks} name={member.displayName} />
            {social ? <PostsTo accounts={postsTo} /> : null}
          </div>
        </div>
      ) : null}

      {tab === 'work' ? (
        <WaitingList items={waiting} total={waiting.length} here={here} name={member.displayName} />
      ) : null}

      {tab === 'trust' ? (
        <div className="max-w-3xl space-y-4">
          <TrustPanel tasks={tasks} name={member.displayName} />
          <p className="text-sm text-muted">
            To change how many approvals a task needs, or to let it act alone, use{' '}
            <Link href="/app/autopilot" className="text-accent">
              the promotion rules
            </Link>
            .
          </p>
        </div>
      ) : null}

      {tab === 'routines' ? (
        <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
          {social ? (
            <>
              <RoutineCard
                href="/app/feeds"
                title="Feeds"
                text="News and blogs to watch. New articles become post drafts for you to approve."
              />
              <RoutineCard
                href="/app/recurring"
                title="Recurring posts"
                text="Posts that go out on a schedule, such as a Monday tip."
              />
            </>
          ) : (
            <>
              <RoutineCard href="/app/leads" title="Leads" text="The people they write to. Add or import more." />
              <RoutineCard
                href="/app/suppressions"
                title="Do not contact"
                text="Anyone here is never written to, whatever list they appear on."
              />
            </>
          )}
        </div>
      ) : null}

      {tab === 'brief' ? (
        <div className="max-w-3xl space-y-3">
          {briefRows(member).length === 0 ? (
            <p className="text-sm text-muted">No brief was given at hire.</p>
          ) : (
            <dl className="card grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
              {briefRows(member).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-sm text-muted">
            The brief is set when you hire. Facts, prices and claims come from{' '}
            <Link href="/app/company" className="text-accent">
              Business info
            </Link>
            , which every staff member shares.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function WaitingList({ items, total, here, name }: { items: Item[]; total: number; here: string; name: string }) {
  return (
    <section aria-labelledby="waiting-h" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="waiting-h" className="font-semibold">
          Waiting for you
        </h2>
        {total > items.length ? (
          <Link href={`${here}?tab=work`} className="text-sm text-accent">
            See all {total}
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing from {name} is waiting for you.</p>
      ) : (
        <ul className="card divide-y divide-line-soft">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/inbox?item=${item.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2"
              >
                <span className="w-24 flex-none font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
                  {item.kind.replace(/[._]/g, ' ')}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                <span className="flex-none text-xs text-muted">{timeAgo(item.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrustPanel({ tasks, name }: { tasks: Task[]; name: string }) {
  return (
    <section aria-labelledby="trust-h" className="card space-y-5 p-5">
      <div className="space-y-1">
        <h2 id="trust-h" className="font-semibold">
          Trust
        </h2>
        <p className="text-sm text-muted">What {name} may do alone. Each task earns it separately.</p>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">Nothing that posts or sends yet.</p>
      ) : (
        <ul className="space-y-4">
          {tasks.map((task) => {
            const state = trustState(task);
            const climbing = task.autonomy === 'draft' && task.mode !== 'off';
            return (
              <li key={task.taskType} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{task.taskName}</span>
                  <span className={state.pill}>{state.label}</span>
                </div>
                {climbing ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-social"
                      style={{ width: `${Math.min(100, (100 * task.progress.approvals) / task.rules.approvals)}%` }}
                    />
                  </div>
                ) : null}
                <p className="text-xs text-muted">{state.note}</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">
        Always comes to you, promoted or not: complaints, refunds, legal questions, and anything outside your confirmed
        facts.
      </p>
    </section>
  );
}

function PostsTo({ accounts }: { accounts: Account[] }) {
  const health = {
    ok: ['Working', 'text-ok'],
    degraded: ['Renew soon', 'text-amber'],
    broken: ['Reconnect', 'text-danger'],
  };
  return (
    <section aria-labelledby="posts-h" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="posts-h" className="font-semibold">
          Where they post
        </h2>
        <Link href="/app/accounts" className="text-sm text-accent">
          Connections
        </Link>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">No account chosen, so they draft but cannot post.</p>
      ) : (
        <ul className="card divide-y divide-line-soft">
          {accounts.map((account) => {
            const [label, colour] = health[account.health];
            return (
              <li key={account.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 truncate">
                  {NETWORK_LABEL[account.network] ?? account.network} · {account.name}
                </span>
                <span className={`flex-none text-xs font-medium ${colour}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RoutineCard({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="card flex items-start gap-3 p-5 hover:border-line-strong">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      <Icon name="chevron" size={16} />
    </Link>
  );
}
