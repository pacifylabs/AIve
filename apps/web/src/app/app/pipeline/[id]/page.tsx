import { notFound } from 'next/navigation';
import { closeLeadAction, giveBackAction, resolveSendAction, takeOverAction } from '@/app/actions/sales';
import { apiOrRedirect } from '@/lib/api';
import { ReplyForm } from './reply-form';

export const metadata = { title: 'Conversation' };

interface Detail {
  id: string;
  subject: string;
  state: 'active' | 'waiting' | 'needs_human' | 'closed';
  handledBy: 'staff' | 'human';
  needsHumanReason: string | null;
  lead: { id: string; name: string | null; email: string | null; company: string | null } | null;
  uncertainSends: string[];
  messages: {
    id: string;
    direction: 'in' | 'out';
    author: string;
    body: string;
    delivery: string;
    occurredAt: string;
  }[];
}

const DELIVERY: Record<string, string> = {
  queued: 'Waiting to send',
  sending: 'Sending',
  accepted: 'Sent',
  uncertain: 'May not have gone',
  failed: 'Refused by the mail server',
  cancelled: 'Not sent',
  bounced: 'Bounced',
  received: '',
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await apiOrRedirect<Detail>(`/conversations/${encodeURIComponent(id)}`, `/app/pipeline/${id}`, {
    workspace: true,
  });
  if (!result.ok) {
    if (result.problem.status === 404) notFound();
    return <p className="text-danger">{result.problem.title}</p>;
  }
  const c = result.data;
  const closed = c.state === 'closed';

  return (
    <section className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{c.lead?.name ?? c.lead?.email ?? 'Conversation'}</h1>
        <p className="text-muted">
          {c.subject}
          {c.lead?.company ? ` · ${c.lead.company}` : ''}
        </p>
        {c.needsHumanReason ? (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="note">
            Needs you: {c.needsHumanReason}
          </p>
        ) : null}
      </div>

      {c.uncertainSends.map((intentId) => (
        <div key={intentId} className="space-y-2 rounded-md border border-danger/40 bg-danger/10 p-4 text-sm">
          <p>An email here may or may not have gone out. It will not be sent again unless you say so.</p>
          <div className="flex gap-4">
            {(['sent', 'retry'] as const).map((outcome) => (
              <form key={outcome} action={resolveSendAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="intentId" value={intentId} />
                <input type="hidden" name="outcome" value={outcome} />
                <button type="submit" className="font-medium underline">
                  {outcome === 'sent' ? 'It did go out' : 'Send it again'}
                </button>
              </form>
            ))}
          </div>
        </div>
      ))}

      <ol className="space-y-3">
        {c.messages.map((message) => (
          <li
            key={message.id}
            className={`rounded-xl border border-border p-4 text-sm ${message.direction === 'in' ? 'bg-surface' : 'bg-background'}`}
          >
            <p className="mb-2 text-xs text-muted">
              {message.direction === 'in'
                ? 'They wrote'
                : message.author === 'human'
                  ? 'You wrote'
                  : 'Your Sales Manager wrote'}{' '}
              ·{' '}
              <time dateTime={message.occurredAt} suppressHydrationWarning>
                {new Date(message.occurredAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
              {DELIVERY[message.delivery] ? ` · ${DELIVERY[message.delivery]}` : ''}
            </p>
            <p className="whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ol>

      {!closed ? (
        c.handledBy === 'human' ? (
          <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
            <h2 className="font-medium">You are handling this conversation</h2>
            <p className="text-sm text-muted">
              Your Sales Manager has stopped and will not write here until you give it back.
            </p>
            <ReplyForm id={c.id} />
            <form action={giveBackAction}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="text-sm font-medium text-accent hover:underline">
                Give it back to your Sales Manager
              </button>
            </form>
          </div>
        ) : (
          <form action={takeOverAction}>
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-background"
            >
              Take over this conversation
            </button>
          </form>
        )
      ) : null}

      {c.lead ? (
        <div className="flex gap-4 border-t border-border pt-4 text-sm">
          {(['won', 'lost'] as const).map((state) => (
            <form key={state} action={closeLeadAction}>
              <input type="hidden" name="leadId" value={c.lead!.id} />
              <input type="hidden" name="state" value={state} />
              <button type="submit" className="text-muted hover:underline">
                Mark as {state}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </section>
  );
}
