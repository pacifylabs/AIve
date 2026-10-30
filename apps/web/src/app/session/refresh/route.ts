import type { TokenPair } from '@ai-staff/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { api } from '@/lib/api';
import { clearSession, readSession, storeTokens } from '@/lib/session';

/** Only same-site paths, so this can't be used to bounce people to another site. */
const safeNext = (value: string | null) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/app');

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const { refreshToken } = await readSession();
  if (refreshToken) {
    const result = await api<TokenPair>('/auth/refresh', { method: 'POST', body: { refreshToken } });
    if (result.ok) {
      await storeTokens(result.data);
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  await clearSession();
  const login = new URL('/login', request.url);
  login.searchParams.set('next', next);
  return NextResponse.redirect(login);
}
