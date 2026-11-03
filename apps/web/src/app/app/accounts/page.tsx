import { connectNetworkAction, disconnectAccountAction } from '@/app/actions/social';
import { apiOrRedirect } from '@/lib/api';
import { PickAccountsForm } from './pick-form';

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
  const [accounts, networks, choice] = await Promise.all([
    apiOrRedirect<Account[]>('/social/accounts', '/app/accounts', { workspace: true }),
    apiOrRedirect<Network[]>('/social/networks', '/app/accounts', { workspace: true }),
    pending
      ? apiOrRedirect<Pending>(`/social/pending/${encodeURIComponent(pending)}`, '/app/accounts', { workspace: true })
      : null,
  ]);
  if (!accounts.ok) return <p className="text-danger">{accounts.problem.title}</p>;

  return (
    <section className="max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-muted">
          The social accounts your staff post to. You sign in at the network; we never see your password.
        </p>
      </div>
      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {choice?.ok ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
          <PickAccountsForm pending={pending!} accounts={choice.data.accounts} />
        </div>
      ) : pending ? (
        <p className="text-sm text-muted">That sign-in expired. Connect again below.</p>
      ) : null}

      {accounts.data.length === 0 ? (
        <p className="text-sm text-muted">Nothing connected yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {accounts.data.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <span className="font-medium">{account.name}</span>
                <span className="text-muted"> · {account.network}</span>
                {account.health !== 'ok' ? (
                  <span className="block text-danger">
                    Needs to be reconnected{account.healthReason ? `: ${account.healthReason}` : ''}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-4">
                {account.health !== 'ok' ? (
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
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3">
        <h2 className="font-medium">Connect an account</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {networks.ok
            ? networks.data.map((network) => (
                <li key={network.network} className="rounded-xl border border-border bg-surface p-4 text-sm">
                  <p className="font-medium">{network.label}</p>
                  {network.configured ? (
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
    </section>
  );
}
