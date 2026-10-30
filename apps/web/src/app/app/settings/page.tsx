import type { InvitationResponse, MemberResponse, WorkspaceResponse } from '@ai-staff/contracts';
import { redirect } from 'next/navigation';
import { revokeInvitationAction } from '@/app/actions/workspaces';
import { apiOrRedirect } from '@/lib/api';
import { InviteForm, WorkspaceSettingsForm } from '../workspace-forms';

export const metadata = { title: 'Workspace settings' };

const roleLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

export default async function SettingsPage() {
  const workspace = await apiOrRedirect<WorkspaceResponse>('/workspace', '/app/settings', { workspace: true });
  if (!workspace.ok) redirect('/app');
  const canManage = workspace.data.role !== 'member';
  const [members, invitations] = await Promise.all([
    apiOrRedirect<MemberResponse[]>('/workspace/members', '/app/settings', { workspace: true }),
    canManage
      ? apiOrRedirect<InvitationResponse[]>('/workspace/invitations', '/app/settings', { workspace: true })
      : null,
  ]);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Workspace settings</h1>
        {canManage ? (
          <div className="rounded-xl border border-border bg-surface p-6">
            <WorkspaceSettingsForm name={workspace.data.name} timezone={workspace.data.timezone} />
          </div>
        ) : (
          <p className="text-muted">Only admins and owners can change workspace settings.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Team</h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(members.ok ? members.data : []).map((member) => (
            <li key={member.userId} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{member.name}</span>
                <span className="block text-muted">{member.email}</span>
              </span>
              <span className="text-muted">{roleLabel[member.role]}</span>
            </li>
          ))}
        </ul>

        {canManage ? (
          <>
            <h3 className="font-medium">Invite someone</h3>
            <div className="rounded-xl border border-border bg-surface p-6">
              <InviteForm />
            </div>
            {invitations?.ok && invitations.data.length > 0 ? (
              <>
                <h3 className="font-medium">Pending invitations</h3>
                <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {invitations.data.map((invitation) => (
                    <li key={invitation.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span>
                        {invitation.email} <span className="text-muted">· {roleLabel[invitation.role]}</span>
                      </span>
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="id" value={invitation.id} />
                        <button type="submit" className="text-danger hover:underline">
                          Revoke
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
