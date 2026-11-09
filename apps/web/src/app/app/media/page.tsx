import { deleteMediaAction } from '@/app/actions/social';
import { apiOrRedirect } from '@/lib/api';
import { UploadButton } from './upload-button';

export const metadata = { title: 'Media library' };

interface Item {
  id: string;
  kind: 'image' | 'video';
  name: string;
  width: number | null;
  height: number | null;
  urls: { original: string; square?: string; portrait?: string; landscape?: string };
}

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const library = await apiOrRedirect<{ configured: boolean; items: Item[] }>('/social/media', '/app/media', {
    workspace: true,
  });
  if (!library.ok) return <p className="text-danger">{library.problem.title}</p>;

  return (
    <section className="max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Media library</h1>
        <p className="text-muted">
          Pictures and videos to reuse in posts. On New post you can pick one, and cut a picture to a square (1:1),
          portrait (9:16) or landscape (16:9) shape.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {library.data.configured ? (
        <UploadButton />
      ) : (
        <p className="empty text-sm text-muted">The media library is not set up yet on this server.</p>
      )}
      {library.data.items.length === 0 ? (
        library.data.configured ? (
          <p className="empty text-sm text-muted">Nothing uploaded yet.</p>
        ) : null
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3">
          {library.data.items.map((item) => (
            <li key={item.id} className="card space-y-2 overflow-hidden p-3 text-sm">
              {item.kind === 'image' ? (
                <img
                  src={item.urls.square ?? item.urls.original}
                  alt={item.name}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ) : (
                <video
                  src={item.urls.original}
                  className="aspect-square w-full rounded-lg bg-sunken object-cover"
                  muted
                />
              )}
              <p className="truncate font-medium">{item.name}</p>
              <p className="text-xs text-muted">
                {item.kind === 'image' ? 'Picture' : 'Video'}
                {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
              </p>
              <form action={deleteMediaAction}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="text-danger hover:underline">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
