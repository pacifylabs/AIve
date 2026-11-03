import Link from 'next/link';
import { apiOrRedirect } from '@/lib/api';

export const metadata = { title: 'Pipeline' };

interface Conversation {
  id: string;
  subject: string;
  state: 'active' | 'waiting' | 'needs_human' | 'closed';
  handledBy: 'staff' | 'human';
  lastClassification: string | null;
  needsHumanReason: string | null;
  lastMessageAt: string | null;
  lead: { name: string | null; company: string | null; email: string | null } | null;
}

const COLUMNS: { state: Conversation['state']; title: string; hint: string }[] = [
  { state: 'needs_human', title: 'Needs you', hint: 'Pricing, contracts, complaints, anyone who wants a person.' },
  { state: 'active', title: 'In progress', hint: 'They replied and an answer is being prepared.' },
  { state: 'waiting', title: 'Waiting for them', hint: 'We wrote last.' },
  { state: 'closed', title: 'Ended', hint: 'Opted out, bounced or closed.' },
];

export default async function PipelinePage() {
  const conversations = await apiOrRedirect<Conversation[]>('/conversations', '/app/pipeline', { workspace: true });
  if (!conversations.ok) return <p className="text-danger">{conversations.problem.title}</p>;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-muted">
          Every conversation your Sales Manager is having. Open one to read it or take it over.
        </p>
      </div>
      {conversations.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <h2 className="font-medium">No conversations yet</h2>
          <p className="mt-1 text-sm text-muted">They start when a first email is approved and sent.</p>
        </div>
      ) : null}
      {COLUMNS.map((column) => {
        const items = conversations.data.filter((conversation) => conversation.state === column.state);
        if (!items.length) return null;
        return (
          <div key={column.state} className="space-y-2">
            <h2 className="text-sm font-medium">
              {column.title} <span className="text-muted">({items.length})</span>
            </h2>
            <p className="text-xs text-muted">{column.hint}</p>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {items.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/app/pipeline/${conversation.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-background"
                  >
                    <span>
                      <span className="font-medium">
                        {conversation.lead?.name ?? conversation.lead?.email ?? 'Lead'}
                      </span>
                      <span className="text-muted"> · {conversation.subject}</span>
                    </span>
                    <span className="text-muted">
                      {conversation.handledBy === 'human'
                        ? 'You are handling it'
                        : (conversation.lastClassification?.replace('_', ' ') ?? '')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
