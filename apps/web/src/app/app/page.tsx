import type { MeResponse, WorkspaceResponse } from '@ai-staff/contracts';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';
import { CreateWorkspaceForm } from './workspace-forms';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const me = await apiOrRedirect<MeResponse>('/me', '/app');
  if (!me.ok) return <p className="text-danger">{me.problem.title}</p>;

  if (me.data.workspaces.length === 0) {
    return (
      <section className="mx-auto max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Set up your workspace</h1>
          <p className="text-muted">
            Your AI staff, approvals and billing live in a workspace. You can invite your team next.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <CreateWorkspaceForm />
        </div>
      </section>
    );
  }

  const { workspaceId } = await readSession();
  const selected = me.data.workspaces.find((workspace) => workspace.id === workspaceId) ?? me.data.workspaces[0]!;
  const workspace = await apiOrRedirect<WorkspaceResponse>('/workspace', '/app', { workspace: true });
  const name = workspace.ok ? workspace.data.name : selected.name;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <p className="text-muted">
          You are {selected.role === 'owner' ? 'an owner' : selected.role === 'admin' ? 'an admin' : 'a member'} of this
          workspace.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <h2 className="font-medium">No staff hired yet</h2>
        <p className="mt-1 text-sm text-muted">
          Social Media Staff and Sales Manager Staff arrive in the next milestones.
        </p>
      </div>
    </section>
  );
}
