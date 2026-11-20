import { NextResponse, type NextRequest } from 'next/server';
import { PATH_HEADER } from './lib/request-path';

/**
 * Next.js 16 calls this file `proxy.ts` (formerly middleware). It is only an optimistic check that a session cookie
 * exists; the API verifies the token on every call.
 */
export function proxy(request: NextRequest) {
  const signedIn = Boolean(request.cookies.get('as_refresh')?.value);
  const path = request.nextUrl.pathname;
  if (path.startsWith('/app') && !signedIn) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }
  if ((path === '/' || path === '/login' || path === '/signup') && signedIn) {
    return NextResponse.redirect(new URL('/app', request.url));
  }
  // Layouts cannot read the path, and the app layout needs it to give onboarding the whole screen.
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/', '/login', '/signup', '/app/:path*'] };
