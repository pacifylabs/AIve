import Link from 'next/link';
import { type Tag, TagPill } from '@/components/app/tag';
import { cancelPostAction, resolvePostAction, setPostTagAction } from '@/app/actions/social';
import { apiOrRedirect } from '@/lib/api';

export const metadata = { title: 'Calendar' };

interface Post {
  id: string;
  body: string;
  state: 'scheduled' | 'published' | 'failed' | 'cancelled';
  scheduledFor: string;
  permalink: string | null;
  /** Set when a person wrote the post by hand. */
  createdBy: string | null;
  tag: Tag | null;
  account: { name: string; network: string; health: string } | null;
  publish: { state: string; error: string | null } | null;
}

const STATE: Record<Post['state'], string> = {
  scheduled: 'Scheduled',
  published: 'Published',
  failed: 'Needs you',
  cancelled: 'Cancelled',
};

/** What the person should see: a post the network is still working on, or one we are unsure about, is not just "Scheduled". */
function label(post: Post): string {
  if (post.state === 'scheduled' && post.publish?.state === 'processing') return 'Processing at the network';
  if (post.state === 'scheduled' && post.publish?.state === 'uncertain') return 'Checking whether it went up';
  return STATE[post.state];
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const [posts, tags] = await Promise.all([
    apiOrRedirect<Post[]>(`/social/posts${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`, '/app/calendar', {
      workspace: true,
    }),
    apiOrRedirect<Tag[]>('/social/tags', '/app/calendar', { workspace: true }),
  ]);
  if (!posts.ok) return <p className="text-danger">{posts.problem.title}</p>;
  const allTags = tags.ok ? tags.data : [];

  const days = new Map<string, Post[]>();
  for (const post of posts.data) {
    const key = post.scheduledFor.slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), post]);
  }

  return (
    <section className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="page-title">Calendar</h1>
          <p className="text-muted">Posts that are scheduled, published or waiting on you. Times are shown in UTC.</p>
        </div>
        <Link href="/app/compose" className="btn btn-primary">
          New post
        </Link>
      </div>
      {allTags.length ? (
        <nav aria-label="Filter by tag" className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/app/calendar"
            aria-current={tag ? undefined : 'page'}
            className={tag ? 'pill' : 'pill pill-accent'}
          >
            All posts
          </Link>
          {allTags.map((item) => (
            <Link
              key={item.id}
              href={`/app/calendar?tag=${item.id}`}
              aria-current={tag === item.id ? 'page' : undefined}
            >
              <span className={tag === item.id ? 'rounded-full ring-2 ring-accent' : ''}>
                <TagPill tag={item} />
              </span>
            </Link>
          ))}
        </nav>
      ) : null}
      {posts.data.length === 0 ? (
        <div className="empty">
          <h2 className="font-medium">No posts yet</h2>
          <p className="mt-1 text-sm text-muted">Approve a weekly plan in your inbox and the posts appear here.</p>
        </div>
      ) : null}
      {[...days.entries()].map(([key, items]) => (
        <div key={key} className="space-y-2">
          <h2 className="text-sm font-medium">{day(items[0]!.scheduledFor)}</h2>
          <ul className="card divide-y divide-line-soft">
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
                  <span className="flex items-center gap-2">
                    {post.tag ? <TagPill tag={post.tag} /> : null}
                    {post.createdBy ? <span className="pill">Written by you</span> : null}
                    <span className={post.state === 'failed' ? 'text-danger' : 'text-muted'}>{label(post)}</span>
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-muted">{post.body}</p>
                {post.publish?.error && post.state !== 'published' ? (
                  <p className="text-xs text-danger">{post.publish.error}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-4">
                  {allTags.length ? (
                    <form action={setPostTagAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={post.id} />
                      <label className="sr-only" htmlFor={`tag-${post.id}`}>
                        Tag for this post
                      </label>
                      <select
                        id={`tag-${post.id}`}
                        name="tagId"
                        defaultValue={post.tag?.id ?? ''}
                        className="field w-auto py-1 text-xs"
                      >
                        <option value="">No tag</option>
                        {allTags.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs font-medium text-accent hover:underline">
                        Set tag
                      </button>
                    </form>
                  ) : null}
                  {post.permalink ? (
                    <a href={post.permalink} className="text-accent hover:underline" rel="noreferrer" target="_blank">
                      View post
                    </a>
                  ) : null}
                  {post.state === 'scheduled' && (!post.publish || post.publish.state === 'pending') ? (
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
