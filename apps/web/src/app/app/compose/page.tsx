import Link from 'next/link';
import { apiOrRedirect } from '@/lib/api';
import { ComposeForm } from './compose-form';

export const metadata = { title: 'New post' };

interface Account {
  id: string;
  network: string;
  name: string;
  health: 'ok' | 'degraded' | 'broken';
}

export default async function ComposePage() {
  const accounts = await apiOrRedirect<Account[]>('/social/accounts', '/app/compose', { workspace: true });
  if (!accounts.ok) return <p className="text-danger">{accounts.problem.title}</p>;
  const usable = accounts.data.filter((account) => account.health !== 'broken');

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">New post</h1>
        <p className="text-muted">
          Write a post yourself. It goes out as soon as you post it, or at the time you pick. It appears on the
          calendar, where you can cancel it until it is sent.
        </p>
      </div>
      {usable.length === 0 ? (
        <div className="empty">
          <h2 className="font-medium">No account to post to</h2>
          <p className="mt-1 text-sm text-muted">
            Connect one on the{' '}
            <Link href="/app/accounts" className="text-accent hover:underline">
              Accounts
            </Link>{' '}
            page first.
          </p>
        </div>
      ) : (
        <div className="card p-6">
          {/* One id per page view, so sending the form twice makes one post. */}
          <ComposeForm requestId={crypto.randomUUID()} accounts={usable} />
        </div>
      )}
    </section>
  );
}
