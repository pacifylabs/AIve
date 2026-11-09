import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { repurposePostAction } from '@/app/actions/social';
import { timeAgo } from '@/components/app/dashboard';
import { apiOrRedirect } from '@/lib/api';

export const metadata = { title: 'Results' };

interface TopPost {
  postId: string;
  accountName: string;
  network: string;
  body: string;
  publishedAt: string;
  permalink: string | null;
  engagement: number;
  reach: number | null;
  metrics: Record<string, number>;
}

const WINDOWS = [7, 30, 90] as const;
const LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  discord: 'Discord',
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; asked?: string; error?: string }>;
}) {
  const { days: raw, asked, error } = await searchParams;
  const days = WINDOWS.find((window) => String(window) === raw) ?? 30;
  const top = await apiOrRedirect<TopPost[]>(`/social/top-posts?days=${days}&limit=10`, '/app/results', {
    workspace: true,
  });
  if (!top.ok) return <p className="text-danger">{top.problem.title}</p>;

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Results</h1>
        <p className="text-muted">
          Your best posts by likes, comments and shares. Pick one and your Social Media Staff member writes a fresh take
          on it. It goes to your inbox as a draft; nothing is posted until you approve it.
        </p>
      </div>

      <nav aria-label="Time window" className="flex gap-2 text-sm">
        {WINDOWS.map((window) => (
          <Link
            key={window}
            href={`/app/results?days=${window}`}
            aria-current={window === days ? 'page' : undefined}
            className={window === days ? 'btn btn-primary' : 'btn'}
          >
            Last {window} days
          </Link>
        ))}
      </nav>

      {asked ? (
        <p className="rounded-xl border border-line-soft bg-surface-soft px-3 py-2 text-sm" role="status">
          A draft is on its way to your <Link href="/app/inbox" className="text-accent hover:underline">inbox</Link>.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {top.data.length === 0 ? (
        <p className="empty text-sm text-muted">
          Nothing to rank yet. Numbers arrive a day after a post goes out, and again after a week.
        </p>
      ) : (
        <ol className="space-y-3">
          {top.data.map((post, index) => (
            <li key={post.postId} className="card space-y-3 p-5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted">
                  #{index + 1} · {post.accountName} on {LABEL[post.network] ?? post.network} · {timeAgo(post.publishedAt)}
                </p>
                <p className="shrink-0 font-medium">{post.engagement.toLocaleString()} reactions</p>
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap">{post.body}</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  {post.reach === null ? 'Reach not given by this network' : `${post.reach.toLocaleString()} seen`}
                  {post.permalink ? (
                    <>
                      {' · '}
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        View post
                      </a>
                    </>
                  ) : null}
                </p>
                <form action={repurposePostAction}>
                  <input type="hidden" name="postId" value={post.postId} />
                  <input type="hidden" name="requestId" value={randomUUID()} />
                  <input type="hidden" name="days" value={days} />
                  <button type="submit" className="btn">
                    Repurpose with AI
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
