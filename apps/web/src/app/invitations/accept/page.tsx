import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { readSession } from '@/lib/session';
import { AcceptInvitationForm } from './accept-form';

export const metadata = { title: 'Accept invitation', referrer: 'no-referrer' };

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token)
    return <AuthCard title="This link is incomplete" subtitle="Open the invitation link from your email again." />;

  const { refreshToken } = await readSession();
  const back = `/invitations/accept?token=${encodeURIComponent(token)}`;
  if (!refreshToken) {
    return (
      <AuthCard
        title="You've been invited"
        subtitle="Sign in, or create an account with the email address the invitation was sent to."
      >
        <div className="flex gap-3 text-sm">
          <Link
            href={`/login?next=${encodeURIComponent(back)}`}
            className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground"
          >
            Sign in
          </Link>
          <Link href="/signup" className="rounded-md border border-border px-4 py-2 font-medium">
            Create an account
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Join the workspace" subtitle="Accept to start working with the team.">
      <AcceptInvitationForm token={token} />
    </AuthCard>
  );
}
