'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** How often to look, and for how long, before saying it is taking longer than usual. */
const EVERY_MS = 6_000;
const TRIES = 30;

/**
 * Refreshes the page while a new hire's first piece of work is on its way, so it appears without a reload. Stops as
 * soon as it has arrived, and after three minutes says so rather than spinning for ever.
 */
export function FirstWorkWatcher({ arrived }: { arrived: boolean }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (arrived || tries >= TRIES) return;
    const timer = setTimeout(() => {
      router.refresh();
      setTries((count) => count + 1);
    }, EVERY_MS);
    return () => clearTimeout(timer);
  }, [arrived, tries, router]);

  if (arrived) return null;
  return tries >= TRIES ? (
    <p role="status" className="text-sm text-amber">
      This is taking longer than usual. It will still arrive in Review work; you do not need to stay on this page.
    </p>
  ) : (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden="true"
        className="size-3.5 animate-spin rounded-full border-2 border-social border-r-transparent motion-reduce:animate-none"
      />
      Usually a minute or two. This page updates when it lands.
    </p>
  );
}
