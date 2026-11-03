import { apiOrRedirect } from '@/lib/api';
import { HireForm, type MailboxOption } from './hire-form';

export const metadata = { title: 'Hire' };

interface Role {
  key: string;
  name: string;
  summary: string;
  jobDescription: string[];
  interview: { key: string; question: string }[];
}

export default async function HirePage() {
  const [roles, mailboxes] = await Promise.all([
    apiOrRedirect<Role[]>('/roles', '/app/hire', { workspace: true }),
    apiOrRedirect<MailboxOption[]>('/mailboxes', '/app/hire', { workspace: true }),
  ]);
  if (!roles.ok) return <p className="text-danger">{roles.problem.title}</p>;
  const role = roles.data.find((candidate) => candidate.key === 'sales_manager');
  if (!role) return <p className="text-muted">No roles are available yet.</p>;
  const questions = Object.fromEntries(role.interview.map((item) => [item.key, item.question]));

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Hire a {role.name.replace(' Staff', '')}</h1>
        <p className="text-muted">{role.summary}</p>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {role.jobDescription.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {mailboxes.ok && mailboxes.data.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
          Connect a mailbox first, on the Mailboxes page, so there is somewhere to send from.
        </p>
      ) : null}
      <div className="rounded-xl border border-border bg-surface p-6">
        <HireForm mailboxes={mailboxes.ok ? mailboxes.data : []} questions={questions} />
      </div>
    </section>
  );
}
