import { removeSuppressionAction } from '@/app/actions/sales';
import { apiOrRedirect } from '@/lib/api';
import { AddSuppressionForm } from './suppression-form';

export const metadata = { title: 'Do not contact' };

interface Suppression {
  id: string;
  value: string;
  reason: 'opt_out' | 'bounce' | 'complaint' | 'manual';
  note: string | null;
}

const REASON: Record<Suppression['reason'], string> = {
  opt_out: 'Asked to stop',
  bounce: 'Address bounced',
  complaint: 'Marked as spam',
  manual: 'Added by you',
};

export default async function SuppressionsPage() {
  const rows = await apiOrRedirect<Suppression[]>('/suppressions', '/app/suppressions', { workspace: true });
  if (!rows.ok) return <p className="text-danger">{rows.problem.title}</p>;
  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Do not contact</h1>
        <p className="text-muted">
          Your staff never write to these addresses. Only the ones you added yourself can be removed.
        </p>
      </div>
      {rows.data.length === 0 ? (
        <p className="text-sm text-muted">
          Nobody yet. People who ask to stop, and addresses that bounce, appear here automatically.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span>
                <span className="font-medium">{row.value}</span>
                <span className="text-muted">
                  {' '}
                  · {REASON[row.reason]}
                  {row.note ? ` · ${row.note}` : ''}
                </span>
              </span>
              {row.reason === 'manual' ? (
                <form action={removeSuppressionAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className="text-danger hover:underline">
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
        <h2 className="font-medium">Add one</h2>
        <AddSuppressionForm />
      </div>
    </section>
  );
}
