import Link from 'next/link';
import type { Tag } from '@/components/app/tag';
import { apiOrRedirect } from '@/lib/api';
import type { LibraryItem } from './media-picker';
import { ComposeForm, type ComposeStart } from './compose-form';
import { ComposePreview } from './compose-preview';

export const metadata = { title: 'New post' };

interface Account {
  id: string;
  network: string;
  name: string;
  health: 'ok' | 'degraded' | 'broken';
}
/** A chain that stopped part-way: what was never posted is offered again as a new chain. */
interface Unfinished {
  id: string;
  accountId: string;
  followUps: string[];
  followUpsSent: number;
}
interface Template {
  id: string;
  name: string;
  body: string;
  firstComment: string | null;
  linkUrl: string | null;
  media: string[];
  accountIds: string[];
  tagId: string | null;
}

const BLANK: ComposeStart = {
  followUps: [],
  body: '',
  firstComment: '',
  linkUrl: '',
  mediaUrls: '',
  accountIds: [],
  tagId: '',
};

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; rest?: string }>;
}) {
  const { template: templateId, rest } = await searchParams;
  const [accounts, templates, tags, left, library] = await Promise.all([
    apiOrRedirect<Account[]>('/social/accounts', '/app/compose', { workspace: true }),
    apiOrRedirect<Template[]>('/social/templates', '/app/compose', { workspace: true }),
    apiOrRedirect<Tag[]>('/social/tags', '/app/compose', { workspace: true }),
    rest ? apiOrRedirect<Unfinished[]>('/social/posts', '/app/compose', { workspace: true }) : null,
    apiOrRedirect<{ items: LibraryItem[] }>('/social/media', '/app/compose', { workspace: true }),
  ]);
  const unfinished = left?.ok ? left.data.find((post) => post.id === rest) : undefined;
  if (!accounts.ok) return <p className="text-danger">{accounts.problem.title}</p>;
  const usable = accounts.data.filter((account) => account.health !== 'broken');
  const saved = templates.ok ? templates.data : [];
  const chosen = saved.find((template) => template.id === templateId);
  const remaining = unfinished ? unfinished.followUps.slice(unfinished.followUpsSent) : [];
  const start: ComposeStart =
    unfinished && remaining.length
      ? { ...BLANK, body: remaining[0]!, followUps: remaining.slice(1), accountIds: [unfinished.accountId] }
      : chosen
        ? {
            followUps: [],
            body: chosen.body,
            firstComment: chosen.firstComment ?? '',
            linkUrl: chosen.linkUrl ?? '',
            mediaUrls: chosen.media.join('\n'),
            accountIds: chosen.accountIds,
            tagId: chosen.tagId ?? '',
          }
        : BLANK;

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-1">
        <h1 className="page-title">New post</h1>
        <p className="text-muted">
          Write a post yourself. It goes out as soon as you post it, or at the time you pick. It appears on the
          calendar, where you can cancel it until it is sent.
        </p>
      </div>
      {usable.length === 0 ? (
        <div className="empty max-w-3xl">
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
        <>
          {saved.length ? (
            <form method="get" className="flex max-w-3xl flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 space-y-1 text-sm font-medium">
                Start from a template
                <select name="template" className="field font-normal" defaultValue={chosen?.id ?? ''}>
                  <option value="">A blank post</option>
                  {saved.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn">
                Use it
              </button>
            </form>
          ) : null}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,48rem)_minmax(16rem,24rem)]">
            <div className="card p-6">
              {/* One id per page view, so sending the form twice makes one post. The key restarts the form for a new template. */}
              <ComposeForm
                key={chosen?.id ?? unfinished?.id ?? 'blank'}
                requestId={crypto.randomUUID()}
                accounts={usable}
                tags={tags.ok ? tags.data : []}
                library={library.ok ? library.data.items : []}
                start={start}
                draftName={`compose:${chosen?.id ?? unfinished?.id ?? 'blank'}`}
              />
            </div>
            <ComposePreview />
          </div>
        </>
      )}
    </section>
  );
}
