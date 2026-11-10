import Link from 'next/link';
import { deleteTagAction, deleteTemplateAction } from '@/app/actions/social';
import { type Tag, TagPill } from '@/components/app/tag';
import { apiOrRedirect } from '@/lib/api';
import { DraftSettingsForm } from './draft-settings-form';
import { TagForm } from './tag-form';
import { type Template, TemplateForm } from './template-form';

export const metadata = { title: 'Templates and tags' };

interface TagRow extends Tag {
  posts: number;
}
interface Account {
  id: string;
  name: string;
  network: string;
  health: string;
}

export default async function TemplatesPage() {
  const [tags, templates, accounts, staff] = await Promise.all([
    apiOrRedirect<TagRow[]>('/social/tags', '/app/templates', { workspace: true }),
    apiOrRedirect<Template[]>('/social/templates', '/app/templates', { workspace: true }),
    apiOrRedirect<Account[]>('/social/accounts', '/app/templates', { workspace: true }),
    apiOrRedirect<{ roleKey: string; settings: { draftTagId?: string | null; chainReplies?: number } }[]>(
      '/staff',
      '/app/templates',
      {
        workspace: true,
      },
    ),
  ]);
  const social = staff.ok ? staff.data.find((member) => member.roleKey === 'social_media') : undefined;
  if (!tags.ok) return <p className="text-danger">{tags.problem.title}</p>;
  if (!templates.ok) return <p className="text-danger">{templates.problem.title}</p>;
  const connected = accounts.ok ? accounts.data : [];
  const tagOf = new Map(tags.data.map((tag) => [tag.id, tag]));
  const nameOf = new Map(connected.map((account) => [account.id, account.name]));

  return (
    <section className="max-w-3xl space-y-10">
      <div className="space-y-1">
        <h1 className="page-title">Templates and tags</h1>
        <p className="text-muted">
          Save posts you write again and again, and colour-tag posts so the calendar can be filtered by them.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="font-medium">Templates</h2>
        {templates.data.length === 0 ? (
          <p className="empty text-sm text-muted">No templates yet. Add one below.</p>
        ) : (
          <ul className="space-y-3">
            {templates.data.map((template) => (
              <li key={template.id} className="card space-y-3 p-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{template.name}</span>
                    {template.tagId && tagOf.get(template.tagId) ? <TagPill tag={tagOf.get(template.tagId)!} /> : null}
                  </span>
                  <Link href={`/app/compose?template=${template.id}`} className="btn btn-primary">
                    Use
                  </Link>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-muted">{template.body}</p>
                {template.accountIds.length ? (
                  <p className="text-xs text-muted">
                    Usually to {template.accountIds.map((id) => nameOf.get(id) ?? 'a removed account').join(', ')}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-start gap-4">
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer font-medium text-accent hover:underline">Edit</summary>
                    <div className="pt-3">
                      <TemplateForm template={template} accounts={connected} tags={tags.data} />
                    </div>
                  </details>
                  <form action={deleteTemplateAction}>
                    <input type="hidden" name="id" value={template.id} />
                    <button type="submit" className="text-danger hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <details className="card p-5">
          <summary className="cursor-pointer font-medium">Add a template</summary>
          <div className="pt-4">
            <TemplateForm accounts={connected} tags={tags.data} />
          </div>
        </details>
      </div>

      <div className="space-y-4">
        <h2 className="font-medium">Tags</h2>
        {tags.data.length === 0 ? (
          <p className="empty text-sm text-muted">No tags yet. Add one below.</p>
        ) : (
          <ul className="card divide-y divide-line-soft">
            {tags.data.map((tag) => (
              <li key={tag.id} className="space-y-3 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <TagPill tag={tag} />
                    <span className="text-xs text-muted">
                      {tag.posts} {tag.posts === 1 ? 'post' : 'posts'}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <Link href={`/app/calendar?tag=${tag.id}`} className="text-accent hover:underline">
                      See on calendar
                    </Link>
                    <form action={deleteTagAction}>
                      <input type="hidden" name="id" value={tag.id} />
                      <button type="submit" className="text-danger hover:underline">
                        Delete
                      </button>
                    </form>
                  </span>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-accent hover:underline">Edit</summary>
                  <div className="pt-3">
                    <TagForm tag={tag} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="card p-5">
          <summary className="cursor-pointer font-medium">Add a tag</summary>
          <div className="pt-4">
            <TagForm />
          </div>
        </details>
      </div>
      {social ? (
        <div className="space-y-4">
          <h2 className="font-medium">How your staff member drafts</h2>
          <div className="card p-5">
            <DraftSettingsForm
              tags={tags.data}
              draftTagId={social.settings.draftTagId ?? null}
              chainReplies={social.settings.chainReplies ?? 0}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
