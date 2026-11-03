import { cancelPostAction, resolvePostAction } from '@/app/actions/social';
import { apiOrRedirect } from '@/lib/api';

export const metadata = { title: 'Calendar' };

interface Post {
  id: string;
  body: string;
  state: 'scheduled' | 'published' | 'failed' | 'cancelled';
  scheduledFor: string;
  permalink: string | null;
  account: { name: string; network: string; health: string } | null;
  publish: { state: string; error: string | null } | null;
}

const STATE: Record<Post['state'], string> = {
  scheduled: 'Scheduled',
  published: 'Published',
  failed: 'Needs you',
  cancelled: 'Cancelled',
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export default async function CalendarPage() {
  const posts = await apiOrRedirect<Post[]>('/social/posts', '/app/calendar', { workspace: true });
  if (!posts.ok) return <p className="text-danger">{posts.problem.title}</p>;

  const days = new Map<string, Post[]>();
  for (const post of posts.data) {
    const key = post.scheduledFor.slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), post]);
  }

  return (
    <section className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-muted">Posts that are scheduled, published or waiting on you. Times are shown in UTC.</p>
      </div>
      {posts.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <h2 className="font-medium">No posts yet</h2>
          <p className="mt-1 text-sm text-muted">Approve a weekly plan in your inbox and the posts appear here.</p>
        </div>
      ) : null}
      {[...days.entries()].map(([key, items]) => (
        <div key={key} className="space-y-2">
          <h2 className="text-sm font-medium">{day(items[0]!.scheduledFor)}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {items.map((post) => (
              <li key={post.id} className="space-y-2 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {post.account?.name ?? 'Account removed'}
                    <span className="text-muted">
                      {' '}
                      · {post.account?.network} · {new Date(post.scheduledFor).toISOString().slice(11, 16)}
                    </span>
                  </span>
                  <span className={post.state === 'failed' ? 'text-danger' : 'text-muted'}>{STATE[post.state]}</span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-muted">{post.body}</p>
                {post.publish?.error && post.state !== 'published' ? (
                  <p className="text-xs text-danger">{post.publish.error}</p>
                ) : null}
                <div className="flex flex-wrap gap-4">
                  {post.permalink ? (
                    <a href={post.permalink} className="text-accent hover:underline" rel="noreferrer" target="_blank">
                      View post
                    </a>
                  ) : null}
                  {post.state === 'scheduled' ? (
                    <form action={cancelPostAction}>
                      <input type="hidden" name="id" value={post.id} />
                      <button type="submit" className="text-danger hover:underline">
                        Cancel
                      </button>
                    </form>
                  ) : null}
                  {post.state === 'failed' ? (
                    <>
                      <form action={resolvePostAction}>
                        <input type="hidden" name="id" value={post.id} />
                        <input type="hidden" name="outcome" value="retry" />
                        <button type="submit" className="font-medium text-accent hover:underline">
                          Post it again
                        </button>
                      </form>
                      <form action={resolvePostAction}>
                        <input type="hidden" name="id" value={post.id} />
                        <input type="hidden" name="outcome" value="published" />
                        <button type="submit" className="hover:underline">
                          It is already up
                        </button>
                      </form>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
