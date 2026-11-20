import type { MeResponse } from '@ai-staff/contracts';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';
import { type Fact, FactsList } from '@/components/app/facts-list';
import { AddFactForm, WebsiteReader, type Profile, ProfileForm } from './company-forms';

export const metadata = { title: 'Business info' };

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

  const confirmed = facts.filter((fact) => fact.confirmedAt).length;
  const toConfirm = facts.length - confirmed;

  return (
    <section className="max-w-5xl space-y-10">
      <div className="space-y-1">
        <h1 className="page-title">Business info</h1>
        <p className="text-muted">
          What every staff member knows about your business. They only use what you have confirmed here; prices, offers
          and claims anywhere else are refused.
        </p>
      </div>

      <section aria-labelledby="site-heading" className="card space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="site-heading" className="font-semibold">
            Start from your website
          </h2>
          <p className="text-sm text-muted">
            We read a few pages of your site and suggest facts. Nothing is used until you confirm it.
          </p>
        </div>
        {canEdit ? <WebsiteReader profile={profile} /> : <p className="text-sm text-muted">Ask an admin to do this.</p>}
      </section>

      <section aria-labelledby="facts-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="facts-heading" className="text-lg font-semibold">
            Facts
          </h2>
          {facts.length ? (
            <p className="text-sm text-muted">
              {confirmed} confirmed{toConfirm ? ` · ${toConfirm} waiting for you to confirm` : ''}
            </p>
          ) : null}
        </div>
        {facts.length === 0 ? (
          <div className="empty">
            <h3 className="font-medium">No facts yet</h3>
            <p className="mt-1 text-sm text-muted">
              Read your website above, or add what you sell, your offers and prices yourself.
            </p>
          </div>
        ) : (
          <FactsList facts={facts} canEdit={canEdit} />
        )}
        {canEdit ? (
          <details className="card max-w-xl p-6">
            <summary className="cursor-pointer font-medium">Add a fact yourself</summary>
            <div className="mt-4">
              <AddFactForm />
            </div>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="profile-heading" className="card max-w-3xl space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="profile-heading" className="font-semibold">
            How you sound and who you sell to
          </h2>
          <p className="text-sm text-muted">
            Filled in from your website when you read it. Change anything that is off.
          </p>
        </div>
        <ProfileForm key={profile.prefilledAt ?? 'none'} profile={profile} canEdit={canEdit} />
      </section>
    </section>
  );
}
