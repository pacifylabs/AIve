import Link from 'next/link';
import { apiOrRedirect } from '@/lib/api';
import { AddLeadForm, ImportLeadsForm } from './lead-forms';

export const metadata = { title: 'Leads' };

interface Lead {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  state: string;
  source: string;
}

const STATE: Record<string, string> = {
  new: 'New',
  researching: 'Reading their site',
  queued: 'Waiting for a first email',
  contacting: 'Contacted',
  replied: 'Replied',
  needs_human: 'Needs you',
  won: 'Won',
  lost: 'Lost',
  stopped: 'Stopped',
};

export default async function LeadsPage() {
  const [leads, staff] = await Promise.all([
    apiOrRedirect<Lead[]>('/leads', '/app/leads', { workspace: true }),
    apiOrRedirect<{ roleKey: string }[]>('/staff', '/app/leads', { workspace: true }),
  ]);
  if (!leads.ok) return <p className="text-danger">{leads.problem.title}</p>;
  const hired = staff.ok && staff.data.some((member) => member.roleKey === 'sales_manager');

  return (
    <section className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-muted">
          People your Sales Manager will research and write to. You approve each first email.
        </p>
      </div>

      {!hired ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
          You need a Sales Manager before adding leads.{' '}
          <Link href="/app/hire" className="font-medium text-accent hover:underline">
            Hire one
          </Link>
          .
        </p>
      ) : null}

      {leads.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <h2 className="font-medium">No leads yet</h2>
          <p className="mt-1 text-sm text-muted">Add one below, or import a list.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {leads.data.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span>
                <span className="font-medium">{lead.name ?? lead.email}</span>
                <span className="text-muted">
                  {lead.company ? ` · ${lead.company}` : ''}
                  {lead.name ? ` · ${lead.email}` : ''}
                </span>
              </span>
              <span className="text-muted">{STATE[lead.state] ?? lead.state}</span>
            </li>
          ))}
        </ul>
      )}

      {hired ? (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
            <h2 className="font-medium">Add a lead</h2>
            <AddLeadForm />
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
            <h2 className="font-medium">Import from a CSV</h2>
            <ImportLeadsForm />
          </div>
        </div>
      ) : null}
    </section>
  );
}
