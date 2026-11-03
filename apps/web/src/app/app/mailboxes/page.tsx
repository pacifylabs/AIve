import { checkDnsAction, resumeMailboxAction } from '@/app/actions/sales';
import { apiOrRedirect } from '@/lib/api';
import { ConnectMailboxForm, TestMailboxForm } from './mailbox-forms';

export const metadata = { title: 'Mailboxes' };

interface Mailbox {
  id: string;
  address: string;
  displayName: string;
  status: 'pending' | 'verified' | 'error' | 'paused';
  inboundMode: 'imap' | 'forward';
  spfOk: boolean | null;
  dkimOk: boolean | null;
  dmarcOk: boolean | null;
  lastError: string | null;
  lastInboundAt: string | null;
}

const STATUS: Record<Mailbox['status'], string> = {
  pending: 'Not verified yet',
  verified: 'Verified',
  error: 'Needs attention',
  paused: 'Paused',
};

const dns = (value: boolean | null) => (value === null ? 'not checked' : value ? 'found' : 'missing');

export default async function MailboxesPage() {
  const mailboxes = await apiOrRedirect<Mailbox[]>('/mailboxes', '/app/mailboxes', { workspace: true });
  if (!mailboxes.ok) return <p className="text-danger">{mailboxes.problem.title}</p>;

  return (
    <section className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Mailboxes</h1>
        <p className="text-muted">
          Your Sales Manager writes from your own address, so your reputation stays yours. Nothing is sent until the
          mailbox is verified.
        </p>
      </div>

      {mailboxes.data.map((mailbox) => (
        <article key={mailbox.id} className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{mailbox.address}</h2>
            <span
              className={mailbox.status === 'verified' ? 'text-sm text-accent' : 'text-sm text-danger'}
              role="status"
            >
              {STATUS[mailbox.status]}
            </span>
          </header>
          {mailbox.lastError ? (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{mailbox.lastError}</p>
          ) : null}
          <p className="text-sm text-muted">
            Replies: {mailbox.inboundMode === 'imap' ? 'read from the inbox' : 'forwarded to us'}
            {mailbox.lastInboundAt ? `, last one ${new Date(mailbox.lastInboundAt).toISOString().slice(0, 10)}` : ''}.
            DNS: SPF {dns(mailbox.spfOk)}, DKIM {dns(mailbox.dkimOk)}, DMARC {dns(mailbox.dmarcOk)}.
          </p>
          <div className="flex flex-wrap gap-4">
            <form action={checkDnsAction}>
              <input type="hidden" name="id" value={mailbox.id} />
              <button type="submit" className="text-sm font-medium text-accent hover:underline">
                Check DNS records
              </button>
            </form>
            {mailbox.status === 'paused' || mailbox.status === 'error' ? (
              <form action={resumeMailboxAction}>
                <input type="hidden" name="id" value={mailbox.id} />
                <button type="submit" className="text-sm font-medium text-accent hover:underline">
                  Try again
                </button>
              </form>
            ) : null}
          </div>
          {mailbox.status !== 'verified' ? <TestMailboxForm id={mailbox.id} /> : null}
        </article>
      ))}

      <div className="max-w-xl space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="font-medium">Connect a mailbox</h2>
        <ConnectMailboxForm />
      </div>
    </section>
  );
}
