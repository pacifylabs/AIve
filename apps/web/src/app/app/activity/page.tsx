import type { WorkspaceResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import { SectionTabs } from '@/components/app/section-tabs';
import { StaffAvatar } from '@/components/app/staff-avatar';
import { apiOrRedirect } from '@/lib/api';
import { activityTone, groupByDay } from '@/lib/staff';

export const metadata = { title: 'Activity' };

interface Event {
  id: string;
  staffId: string | null;
  type: string;
  summary: string;
  createdAt: string;
}
interface Member {
  id: string;
  roleKey: string;
  displayName: string;
  state: string;
}

const DOT = { bad: 'bg-danger', warn: 'bg-amber', good: 'bg-ok', neutral: 'bg-line-strong' } as const;

/** Everything staff did, newest first, by day. Filter to one staff member with ?staff=<id>. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  const { staff: only } = await searchParams;
  const [events, staff, workspace] = await Promise.all([
    apiOrRedirect<Event[]>('/activity', '/app/activity', { workspace: true }),
    apiOrRedirect<Member[]>('/staff', '/app/activity', { workspace: true }),
    apiOrRedirect<WorkspaceResponse>('/workspace', '/app/activity', { workspace: true }),
  ]);
  const members = staff.ok ? staff.data.filter((member) => member.state !== 'archived') : [];
  const byId = new Map(members.map((member) => [member.id, member]));
  const shown = events.ok ? events.data.filter((event) => !only || event.staffId === only) : [];
  const timeZone = workspace.ok ? workspace.data.timezone : 'UTC';
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });

  return (
    <>
      <SectionTabs section="activity" />
      <section className="max-w-4xl space-y-6">
        <div className="space-y-1">
          <h1 className="page-title">What your staff did</h1>
          <p className="text-muted">Every draft, post and check, with what happened in the end. The last 100 events.</p>
        </div>

        {members.length > 1 ? (
          <nav aria-label="Filter by staff member" className="flex flex-wrap gap-2">
            <Link
              href="/app/activity"
              aria-current={only ? undefined : 'page'}
              className="chip aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background"
            >
              Everyone
            </Link>
            {members.map((member) => (
              <Link
                key={member.id}
                href={`/app/activity?staff=${member.id}`}
                aria-current={only === member.id ? 'page' : undefined}
                className="chip aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background"
              >
                {member.displayName}
              </Link>
            ))}
          </nav>
        ) : null}

        {!events.ok ? (
          <p className="text-danger">{events.problem.title}</p>
        ) : shown.length === 0 ? (
          <div className="empty">
            <h2 className="font-medium">Nothing yet</h2>
            <p className="mt-1 text-sm text-muted">
              When your staff draft, post or stop something for safety, it is recorded here, so you can always see what
              happened and why.
            </p>
            {members.length === 0 ? (
              <Link href="/app/hire" className="btn btn-primary mt-4">
                Hire your first staff member
              </Link>
            ) : null}
          </div>
        ) : (
          groupByDay(shown, timeZone).map((day) => (
            <section key={day.label} aria-label={day.label} className="space-y-1">
              <h2 className="eyebrow pb-2">{day.label}</h2>
              <ol className="divide-y divide-line-soft border-t border-line-soft">
                {day.items.map((event) => {
                  const member = event.staffId ? byId.get(event.staffId) : undefined;
                  const tone = activityTone(event.type);
                  return (
                    <li key={event.id} className="flex items-start gap-3 py-3">
                      {member ? (
                        <StaffAvatar name={member.displayName} roleKey={member.roleKey} size="sm" />
                      ) : (
                        <span aria-hidden="true" className="grid size-7 flex-none place-items-center">
                          <span className={`size-2.5 rounded-full ${DOT[tone]}`} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          {tone === 'bad' ? <span className="sr-only">Problem: </span> : null}
                          {event.summary}
                        </p>
                        <p className="text-xs text-muted">
                          {member ? `${member.displayName} · ` : ''}
                          {time(event.createdAt)}
                        </p>
                      </div>
                      {tone !== 'neutral' ? (
                        <span aria-hidden="true" className={`mt-2 size-2 flex-none rounded-full ${DOT[tone]}`} />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </section>
    </>
  );
}
