import Link from 'next/link';
import { apiOrRedirect } from '@/lib/api';
import { HireForm, type MailboxOption } from './hire-form';
import { type AccountOption, SocialHireForm } from './social-hire-form';

export const metadata = { title: 'Hire' };

interface Role {
  key: string;
  name: string;
  summary: string;
  jobDescription: string[];
  interview: { key: string; question: string }[];
}

export default async function HirePage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: requested } = await searchParams;
  const [roles, mailboxes, accounts] = await Promise.all([
    apiOrRedirect<Role[]>('/roles', '/app/hire', { workspace: true }),
    apiOrRedirect<MailboxOption[]>('/mailboxes', '/app/hire', { workspace: true }),
    apiOrRedirect<AccountOption[]>('/social/accounts', '/app/hire', { workspace: true }),
  ]);
  if (!roles.ok) return <p className="text-danger">{roles.problem.title}</p>;
  const role = roles.data.find((candidate) => candidate.key === requested) ?? roles.data[0];
  if (!role) return <p className="text-muted">No roles are available yet.</p>;
  const questions = Object.fromEntries(role.interview.map((item) => [item.key, item.question]));

  return (
    <section className="max-w-2xl space-y-6">
      <nav aria-label="Roles" className="inline-flex gap-1 rounded-xl border border-border bg-subtle p-1 text-sm">
        {roles.data.map((candidate) => (
          <Link
            key={candidate.key}
            href={`/app/hire?role=${candidate.key}`}
            aria-current={candidate.key === role.key ? 'page' : undefined}
            className="rounded-lg px-3 py-1.5 text-muted aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
          >
            {candidate.name.replace(' Staff', '')}
          </Link>
        ))}
      </nav>
      <div className="space-y-1">
        <h1 className="page-title">Hire {role.name}</h1>
        <p className="text-muted">{role.summary}</p>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {role.jobDescription.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {role.key === 'social_media' ? (
        <div className="card p-6">
          <SocialHireForm accounts={accounts.ok ? accounts.data : []} questions={questions} />
        </div>
      ) : (
        <div className="card p-6">
          <HireForm mailboxes={mailboxes.ok ? mailboxes.data : []} questions={questions} />
        </div>
      )}
    </section>
  );
}
