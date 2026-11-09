import { connectNetworkAction, disconnectAccountAction, removeMentionAction } from '@/app/actions/social';
import { apiOrRedirect } from '@/lib/api';
import { ConnectLoginForm, type LoginField } from './login-form';
import { MentionForm } from './mention-form';
import { PickAccountsForm } from './pick-form';
import { Sparkline } from '@/components/app/sparkline';
import { SignatureForm } from './signature-form';

export const metadata = { title: 'Accounts' };

interface Account {
  id: string;
  network: string;
  name: string;
  username: string | null;
  health: 'ok' | 'degraded' | 'broken';
  healthReason: string | null;
}
interface Network {
  network: string;
  label: string;
  configured: boolean;
  /** `credentials` networks have no sign-in page: the person pastes a token, app password or webhook address. */
  auth: 'oauth' | 'credentials';
  fields: LoginField[];
}
interface Mention {
  network: string;
  handle: string;
  name: string;
  verified: boolean;
}
interface StaffRow {
  roleKey: string;
  settings: { signatures?: Record<string, string> };
}
interface Stat {
  accountId: string;
  series: { day: string; followers: number }[];
  followers: number;
  change: number;
  changePct: number | null;
}
interface Pending {
  network: string;
  accounts: { externalId: string; name: string; username?: string | null }[];
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string; error?: string }>;
}) {
  const { pending, error } = await searchParams;
  const [accounts, networks, choice, staff, stats, mentions] = await Promise.all([
    apiOrRedirect<Account[]>('/social/accounts', '/app/accounts', { workspace: true }),
    apiOrRedirect<Network[]>('/social/networks', '/app/accounts', { workspace: true }),
    pending
      ? apiOrRedirect<Pending>(`/social/pending/${encodeURIComponent(pending)}`, '/app/accounts', { workspace: true })
      : null,
    apiOrRedirect<StaffRow[]>('/staff', '/app/accounts', { workspace: true }),
    apiOrRedirect<Stat[]>('/social/stats?days=30', '/app/accounts', { workspace: true }),
    apiOrRedirect<Mention[]>('/social/mentions', '/app/accounts', { workspace: true }),
  ]);
  const statOf = new Map((stats.ok ? stats.data : []).map((stat) => [stat.accountId, stat]));
  const signatures = (staff.ok ? staff.data.find((member) => member.roleKey === 'social_media') : null)?.settings
    .signatures;
  if (!accounts.ok) return <p className="text-danger">{accounts.problem.title}</p>;
  const usesLogin = new Set(
    networks.ok ? networks.data.filter((n) => n.auth === 'credentials').map((n) => n.network) : [],
  );
  const needsAttention = new Set(accounts.data.filter((account) => account.health !== 'ok').map((a) => a.network));

  return (
    <section className="max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="page-title">Accounts</h1>
        <p className="text-muted">
          The social accounts your staff post to. You sign in at the network; we never see your password.
        </p>
      </div>
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {choice?.ok ? (
        <div className="space-y-3 card p-6">
          <PickAccountsForm pending={pending!} accounts={choice.data.accounts} />
        </div>
      ) : pending ? (
        <p className="text-sm text-muted">That sign-in expired. Connect again below.</p>
      ) : null}

      {accounts.data.length === 0 ? (
        <p className="text-sm text-muted">Nothing connected yet.</p>
      ) : (
        <ul className="card divide-y divide-line-soft">
          {accounts.data.map((account) => (
            <li key={account.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="font-medium">{account.name}</span>
                  <span className="text-muted"> · {account.network}</span>
                  {statOf.get(account.id) ? (
                    <span className="mt-1 flex items-center gap-3 text-xs text-muted">
                      <span>
                        {statOf.get(account.id)!.followers.toLocaleString('en-GB')} followers ·{' '}
                        {statOf.get(account.id)!.change >= 0 ? '+' : ''}
                        {statOf.get(account.id)!.change.toLocaleString('en-GB')}
                        {statOf.get(account.id)!.changePct !== null
                          ? ` (${statOf.get(account.id)!.changePct}%)`
                          : ''}{' '}
                        in 30 days
                      </span>
                      <Sparkline
                        values={statOf.get(account.id)!.series.map((point) => point.followers)}
                        label="Followers over the last 30 days"
                      />
                    </span>
                  ) : null}
                  {account.health !== 'ok' ? (
                    <span className={account.health === 'degraded' ? 'block text-amber' : 'block text-danger'}>
                      {account.health === 'degraded' ? 'Needs attention soon' : 'Needs to be reconnected'}
                      {account.healthReason ? `: ${account.healthReason}` : ''}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-4">
                  {account.health !== 'ok' && usesLogin.has(account.network) ? (
                    <a href={`#connect-${account.network}`} className="font-medium text-accent hover:underline">
                      Reconnect below
                    </a>
                  ) : account.health !== 'ok' ? (
                    <form action={connectNetworkAction}>
                      <input type="hidden" name="network" value={account.network} />
                      <button type="submit" className="font-medium text-accent hover:underline">
                        Reconnect
                      </button>
                    </form>
                  ) : null}
                  <form action={disconnectAccountAction}>
                    <input type="hidden" name="id" value={account.id} />
                    <button type="submit" className="text-danger hover:underline">
                      Disconnect
                    </button>
                  </form>
                </span>
              </div>
              {account.health !== 'broken' ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-accent hover:underline">
                    {signatures?.[account.id] ? 'Edit sign-off' : 'Add a sign-off'}
                  </summary>
                  <div className="pt-3">
                    <SignatureForm accountId={account.id} current={signatures?.[account.id] ?? ''} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3">
        <h2 className="font-medium">Connect an account</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {networks.ok
            ? networks.data.map((network) => (
                <li key={network.network} className="card p-4 text-sm">
                  <p className="font-medium">{network.label}</p>
                  {network.configured && network.auth === 'credentials' ? (
                    <details
                      id={`connect-${network.network}`}
                      className="mt-2"
                      open={needsAttention.has(network.network)}
                    >
                      <summary className="cursor-pointer font-medium text-accent hover:underline">Connect</summary>
                      <div className="pt-3">
                        <ConnectLoginForm network={network.network} fields={network.fields} />
                      </div>
                    </details>
                  ) : network.configured ? (
                    <form action={connectNetworkAction} className="mt-2">
                      <input type="hidden" name="network" value={network.network} />
                      <button type="submit" className="font-medium text-accent hover:underline">
                        Connect
                      </button>
                    </form>
                  ) : (
                    <p className="mt-2 text-xs text-muted">Not available yet on this server.</p>
                  )}
                </li>
              ))
            : null}
        </ul>
      </div>
      <div className="space-y-3">
        <h2 className="font-medium">Accounts your staff may tag</h2>
        <p className="text-sm text-muted">
          Your staff member never tags anyone it was not given. Save the accounts it may tag, per network. A post that
          tags any other account is stopped.
        </p>
        {mentions.ok && mentions.data.length ? (
          <ul className="card divide-y divide-line-soft">
            {mentions.data.map((mention) => (
              <li
                key={`${mention.network}:${mention.handle}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">@{mention.handle}</span>
                  <span className="text-muted"> · {mention.network}</span>
                  {mention.name ? <span className="text-muted"> · {mention.name}</span> : null}
                  <span className={`ml-2 ${mention.verified ? 'pill pill-ok' : 'pill'}`}>
                    {mention.verified ? 'Confirmed by the network' : 'Your word'}
                  </span>
                </span>
                <form action={removeMentionAction}>
                  <input type="hidden" name="network" value={mention.network} />
                  <input type="hidden" name="handle" value={mention.handle} />
                  <button type="submit" className="text-danger hover:underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <details className="card p-5">
          <summary className="cursor-pointer font-medium">Save an account</summary>
          <div className="pt-4">
            <MentionForm networks={networks.ok ? networks.data : []} />
          </div>
        </details>
      </div>
    </section>
  );
}
