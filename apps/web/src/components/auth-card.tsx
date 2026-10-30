import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="block text-center text-sm font-semibold tracking-tight">
          AI Staff
        </Link>
        <div className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
          {children}
        </div>
        {footer ? <div className="text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </main>
  );
}
