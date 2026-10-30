import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { SignupForm } from '../forms';

export const metadata = { title: 'Create your account' };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Hire AI staff who work inside the limits you set."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
