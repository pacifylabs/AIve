import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { VerifyForm } from '../forms';

export const metadata = { title: 'Verify your email' };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  if (!email) redirect('/signup');
  return (
    <AuthCard
      title="Check your email"
      subtitle={
        <>
          We sent a 6-digit code to <strong>{email}</strong>. It expires in 15 minutes.
        </>
      }
    >
      <VerifyForm email={email} />
    </AuthCard>
  );
}
