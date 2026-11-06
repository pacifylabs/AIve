import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/app/icons';
import { ThemeToggle } from '@/components/app/theme-toggle';

/** The frame for sign-in, sign-up and the other account screens. */
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
    <div
      className="relative min-h-dvh"
      style={{
        background:
          'radial-gradient(60rem 30rem at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%), var(--background)',
      }}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <Link href="/" className="flex items-center justify-center gap-2.5 text-sm font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-[0.625rem] text-white"
              style={{ background: 'linear-gradient(135deg, #2563eb, #4f8bff)' }}
            >
              <Icon name="bot" size={18} />
            </span>
            AI Staff
          </Link>
          <div className="card space-y-5 p-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
            </div>
            {children}
          </div>
          {footer ? <div className="text-center text-sm text-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
