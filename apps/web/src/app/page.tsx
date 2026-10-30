import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <p className="text-sm font-semibold tracking-tight">AI Staff</p>
      <h1 className="text-4xl font-semibold tracking-tight">
        Hire AI staff who do real work, inside the limits you set.
      </h1>
      <p className="text-lg text-muted">
        Social media and sales staff that start on probation, learn from your approvals, and never send anything you
        wouldn&apos;t.
      </p>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Create an account
        </Link>
        <Link href="/login" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface">
          Sign in
        </Link>
      </div>
    </main>
  );
}
