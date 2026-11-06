import { checkFeedAction, pauseFeedAction, removeFeedAction } from '@/app/actions/social';
import { timeAgo } from '@/components/app/dashboard';
import { apiOrRedirect } from '@/lib/api';
import { AddFeedForm } from './add-feed-form';

export const metadata = { title: 'Feeds' };

interface Feed {
  id: string;
  url: string;
  title: string | null;
  accountIds: string[];
  note: string | null;
  state: 'active' | 'paused' | 'error';
  lastCheckedAt: string | null;
  lastError: string | null;
  articles: { id: string; title: string; link: string; state: 'queued' | 'backlog'; createdAt: string }[];
}
interface Account {
  id: string;
  network: string;
  name: string;
  health: 'ok' | 'degraded' | 'broken';
}

const STATE_PILL = { active: 'pill pill-ok', paused: 'pill', error: 'pill pill-danger' } as const;
const STATE_LABEL = { active: 'Watching', paused: 'Paused', error: 'Stopped' } as const;

export default async function FeedsPage() {
  const [feeds, accounts] = await Promise.all([
    apiOrRedirect<Feed[]>('/social/feeds', '/app/feeds', { workspace: true }),
    apiOrRedirect<Account[]>('/social/accounts', '/app/feeds', { workspace: true }),
  ]);
  if (!feeds.ok) return <p className="text-danger">{feeds.problem.title}</p>;
  const connected = accounts.ok ? accounts.data.filter((account) => account.health !== 'broken') : [];
  const nameOf = new Map(connected.map((account) => [account.id, account.name]));

  return (
    <section className="max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="page-title">Feeds</h1>
        <p className="text-muted">
          Add a blog or news feed. When a new article appears, your Social Media Staff member writes a post about it and
          sends it to your inbox. The link to the article is attached for you.
        </p>
      </div>

      {feeds.data.length === 0 ? (
        <p className="empty text-sm text-muted">No feeds yet. Add one below.</p>
      ) : (
        <ul className="space-y-4">
          {feeds.data.map((feed) => (
            <li key={feed.id} className="card space-y-3 p-5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{feed.title ?? feed.url}</p>
                  <p className="truncate text-xs text-muted">{feed.url}</p>
                </div>
                <span className={STATE_PILL[feed.state]}>{STATE_LABEL[feed.state]}</span>
              </div>
              <p className="text-xs text-muted">
                Posts to {feed.accountIds.map((id) => nameOf.get(id) ?? 'a removed account').join(', ')}
                {feed.lastCheckedAt ? ` · checked ${timeAgo(feed.lastCheckedAt)}` : ' · not checked yet'}
              </p>
              {feed.note ? <p className="text-xs text-muted">Note: {feed.note}</p> : null}
              {feed.lastError ? (
                <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                  {feed.state === 'error'
                    ? `Stopped after repeated failures: ${feed.lastError}`
                    : `Last check failed: ${feed.lastError}`}
                </p>
              ) : null}
              {feed.articles.length ? (
                <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
                  {feed.articles.map((article) => (
                    <li key={article.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 truncate hover:underline"
                      >
                        {article.title}
                      </a>
                      <span className="shrink-0 text-xs text-muted">
                        {article.state === 'queued' ? 'Drafted' : 'Skipped (older)'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-4">
                {feed.state !== 'paused' ? (
                  <form action={checkFeedAction}>
                    <input type="hidden" name="id" value={feed.id} />
                    <button type="submit" className="font-medium text-accent hover:underline">
                      Check now
                    </button>
                  </form>
                ) : null}
                <form action={pauseFeedAction}>
                  <input type="hidden" name="id" value={feed.id} />
                  <input type="hidden" name="paused" value={feed.state === 'paused' ? 'false' : 'true'} />
                  <button type="submit" className="font-medium text-accent hover:underline">
                    {feed.state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                </form>
                <form action={removeFeedAction}>
                  <input type="hidden" name="id" value={feed.id} />
                  <button type="submit" className="text-danger hover:underline">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="card space-y-4 p-6">
        <h2 className="font-medium">Add a feed</h2>
        {connected.length === 0 ? (
          <p className="text-sm text-muted">
            Connect a social account first, on the{' '}
            <a href="/app/accounts" className="text-accent hover:underline">
              Accounts
            </a>{' '}
            page.
          </p>
        ) : (
          <AddFeedForm accounts={connected} />
        )}
      </div>
    </section>
  );
}
