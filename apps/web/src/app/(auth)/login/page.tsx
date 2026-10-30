import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { LoginForm } from '../forms';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;
  return (
    <AuthCard
      title="Sign in"
      subtitle={reset ? 'Your password was changed. Sign in with the new one.' : undefined}
      footer={
        <div className="space-y-2">
          <p>
            <Link href="/forgot-password" className="text-accent hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p>
            New here?{' '}
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm next={next ?? '/app'} />
    </AuthCard>
  );
}
