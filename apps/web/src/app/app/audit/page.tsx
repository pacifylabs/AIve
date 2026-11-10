import type { MemberResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import { apiOrRedirect } from '@/lib/api';

export const metadata = { title: 'Audit log' };

interface Entry {
  id: string;
  at: string;
  action: string;
  target: string;
  detail: { status?: number; email?: string };
  ip: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' });

/** A 2xx answer is a success; anything else is the change being refused or failing. */
const outcome = (status?: number) => (status && status < 400 ? 'pill pill-ok' : 'pill pill-danger');

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; q?: string; before?: string }>;
}) {
  const { user, q, before } = await searchParams;
  const query = new URLSearchParams();
  if (user) query.set('user', user);
  if (q) query.set('q', q);
  if (before) query.set('before', before);
  const [log, members] = await Promise.all([
    apiOrRedirect<{ items: Entry[]; next: string | null }>(`/audit?${query}`, '/app/audit', { workspace: true }),
    apiOrRedirect<MemberResponse[]>('/workspace/members', '/app/audit', { workspace: true }),
  ]);
  if (!log.ok) {
    return (
      <p className="text-danger">
        {log.problem.status === 403 ? 'Only owners and admins can see the audit log.' : log.problem.title}
      </p>
    );
  }
  const people = members.ok ? members.data : [];
  const older = log.data.next
    ? new URLSearchParams({ ...(user ? { user } : {}), ...(q ? { q } : {}), before: log.data.next })
    : null;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Audit log</h1>
        <p className="text-muted">
          Every change people in this workspace make, and every sign-in step for their addresses. Times are in UTC. What
          was typed is never stored.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm font-medium">
          Person
          <select name="user" defaultValue={user ?? ''} className="field w-auto font-normal">
            <option value="">Everyone</option>
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1 space-y-1 text-sm font-medium">
          Contains
          <input name="q" defaultValue={q ?? ''} placeholder="posts, tags, login…" className="field font-normal" />
        </label>
        <button type="submit" className="btn">
          Filter
        </button>
      </form>

      {log.data.items.length === 0 ? (
        <p className="empty text-sm text-muted">Nothing recorded for these filters.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Who</th>
                <th className="px-4 py-2 font-medium">What</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {log.data.items.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{when(entry.at)}</td>
                  <td className="px-4 py-2">{entry.user?.name ?? entry.detail.email ?? 'Unknown'}</td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs">{entry.action}</span>
                    {entry.target ? <span className="block text-xs text-muted">{entry.target}</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    {entry.detail.status ? (
                      <span className={outcome(entry.detail.status)}>{entry.detail.status}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{entry.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {older ? (
        <Link href={`/app/audit?${older}`} className="btn">
          Older entries
        </Link>
      ) : null}
    </section>
  );
}
