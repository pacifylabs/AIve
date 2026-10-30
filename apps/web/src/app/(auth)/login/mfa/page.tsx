import { AuthCard } from '@/components/auth-card';
import { MfaForm } from '../../forms';

export const metadata = { title: 'Two-step sign-in' };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Two-step sign-in" subtitle="Enter the 6-digit code from your authenticator app.">
      <MfaForm next={next ?? '/app'} />
    </AuthCard>
  );
}
