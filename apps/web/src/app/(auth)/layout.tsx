import { after, connection } from 'next/server';
import type { ReactNode } from 'react';
import { wakeApi } from '@/lib/api';

/**
 * Every sign-in page wakes the API as it is shown. The hosted API sleeps when idle and can take over a minute to start,
 * so starting it while the visitor types means the form usually answers straight away.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  await connection();
  after(wakeApi);
  return children;
}
