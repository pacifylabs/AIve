import type { MeResponse } from '@ai-staff/contracts';
import { confirmFactAction, removeFactAction } from '@/app/actions/platform';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';
import { AddFactForm, EditFactForm, PrefillButton, type Profile, ProfileForm } from './company-forms';
import { FACT_KINDS } from './fact-kinds';

export const metadata = { title: 'Company' };

interface Fact {
  id: string;
  kind: (typeof FACT_KINDS)[number][0];
  text: string;
  source: 'owner' | 'website';
  sourceUrl: string | null;
  confirmedAt: string | null;
}

export default async function CompanyPage() {
  const [company, me] = await Promise.all([
    apiOrRedirect<{ profile: Profile; facts: Fact[] }>('/company', '/app/company', { workspace: true }),
    apiOrRedirect<MeResponse>('/me', '/app/company'),
  ]);
  if (!company.ok) return <p className="text-danger">{company.problem.title}</p>;

  const { workspaceId } = await readSession();
  const role = me.ok
    ? (me.data.workspaces.find((workspace) => workspace.id === workspaceId) ?? me.data.workspaces[0])?.role
    : null;
  const canEdit = role === 'owner' || role === 'admin';
  const { profile, facts } = company.data;

  return (
    <section className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Company</h1>
        <p className="text-muted">
          Your staff only use what is written here. Prices, offers and claims anywhere else are refused.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="font-medium">Profile</h2>
          <ProfileForm profile={profile} canEdit={canEdit} />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="font-medium">Start from your website</h2>
          <p className="text-sm text-muted">
            We read a few pages of your site and suggest facts. Nothing is used until you confirm it.
          </p>
          {canEdit ? (
            <PrefillButton profile={profile} />
          ) : (
            <p className="text-sm text-muted">Ask an admin to do this.</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Facts</h2>
        {FACT_KINDS.map(([kind, heading]) => {
          const ofKind = facts.filter((fact) => fact.kind === kind);
          if (!ofKind.length) return null;
          return (
            <div key={kind} className="space-y-2">
              <h3 className="text-sm font-medium text-muted">{heading}</h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {ofKind.map((fact) => (
                  <li key={fact.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p>{fact.text}</p>
                      {!fact.confirmedAt ? (
                        <p className="text-xs text-muted">
                          From your website{fact.sourceUrl ? ` (${new URL(fact.sourceUrl).pathname})` : ''}. Not used
                          until you confirm it.
                        </p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {!fact.confirmedAt ? (
                          <form action={confirmFactAction}>
                            <input type="hidden" name="id" value={fact.id} />
                            <button type="submit" className="text-sm font-medium text-accent hover:underline">
                              Confirm
                            </button>
                          </form>
                        ) : null}
                        <EditFactForm id={fact.id} text={fact.text} />
                        <form action={removeFactAction}>
                          <input type="hidden" name="id" value={fact.id} />
                          <button type="submit" className="text-sm text-danger hover:underline">
                            Remove
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {facts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <h3 className="font-medium">No facts yet</h3>
            <p className="mt-1 text-sm text-muted">Add what you sell and your prices, or start from your website.</p>
          </div>
        ) : null}
        {canEdit ? (
          <div className="max-w-xl space-y-3 rounded-xl border border-border bg-surface p-6">
            <h3 className="font-medium">Add a fact</h3>
            <AddFactForm />
          </div>
        ) : null}
      </div>
    </section>
  );
}
