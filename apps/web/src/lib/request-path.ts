/** The header the proxy sets with the request's path, because a layout cannot read the path itself. */
export const PATH_HEADER = 'x-app-path';

/** Onboarding gets the whole screen: no menu, nothing to wander off to halfway through. */
export function isOnboarding(path: string | null | undefined): boolean {
  return path === '/app/welcome' || (path ?? '').startsWith('/app/welcome/');
}
