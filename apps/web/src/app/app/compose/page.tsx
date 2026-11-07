import Link from 'next/link';
import type { Tag } from '@/components/app/tag';
import { apiOrRedirect } from '@/lib/api';
import { ComposeForm, type ComposeStart } from './compose-form';

export const metadata = { title: 'New post' };

interface Account {
  id: string;
  network: string;
  name: string;
  health: 'ok' | 'degraded' | 'broken';
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

const BLANK: ComposeStart = { body: '', firstComment: '', linkUrl: '', mediaUrls: '', accountIds: [], tagId: '' };

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template: templateId } = await searchParams;
  const [accounts, templates, tags] = await Promise.all([
    apiOrRedirect<Account[]>('/social/accounts', '/app/compose', { workspace: true }),
    apiOrRedirect<Template[]>('/social/templates', '/app/compose', { workspace: true }),
    apiOrRedirect<Tag[]>('/social/tags', '/app/compose', { workspace: true }),
  ]);
  if (!accounts.ok) return <p className="text-danger">{accounts.problem.title}</p>;
  const usable = accounts.data.filter((account) => account.health !== 'broken');
  const saved = templates.ok ? templates.data : [];
  const chosen = saved.find((template) => template.id === templateId);
  const start: ComposeStart = chosen
    ? {
        body: chosen.body,
        firstComment: chosen.firstComment ?? '',
        linkUrl: chosen.linkUrl ?? '',
        mediaUrls: chosen.media.join('\n'),
        accountIds: chosen.accountIds,
        tagId: chosen.tagId ?? '',
      }
    : BLANK;

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
        <>
          {saved.length ? (
            <form method="get" className="flex flex-wrap items-end gap-3">
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
          <div className="card p-6">
            {/* One id per page view, so sending the form twice makes one post. The key restarts the form for a new template. */}
            <ComposeForm
              key={chosen?.id ?? 'blank'}
              requestId={crypto.randomUUID()}
              accounts={usable}
              tags={tags.ok ? tags.data : []}
              start={start}
            />
          </div>
        </>
      )}
    </section>
  );
}
