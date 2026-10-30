import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { ResetPasswordForm } from '../forms';

export const metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthCard title="This link is incomplete" subtitle="Open the link from the email again, or ask for a new one.">
        <Link href="/forgot-password" className="text-sm text-accent hover:underline">
          Send a new reset link
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" subtitle="You'll be signed out everywhere else.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
