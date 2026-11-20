/**
 * The app's colour scheme. It opens in light, like KudiBooks; the top-bar toggle pins dark (or back to light) by
 * changing `<meta name="color-scheme">` and remembering the choice. The storage key is the one the marketing site
 * uses, so a visitor's pick follows them between the site and the app.
 */

export const SCHEME_KEY = 'theme';

export type Scheme = 'light' | 'dark';

/** What shows until someone chooses otherwise. */
const DEFAULT: Scheme = 'light';

/**
 * Runs in the head before first paint so a pinned scheme never flashes the wrong one. Small on purpose, and wrapped in
 * try/catch because storage can be blocked: the page then simply stays light.
 */
export const schemeBootScript = `(function(){try{var s=localStorage.getItem('${SCHEME_KEY}');if(s==='light'||s==='dark')document.querySelector('meta[name="color-scheme"]').content=s}catch(e){}})();`;

const meta = () => document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');

/** The scheme the page is showing now. */
export function currentScheme(): Scheme {
  const pinned = meta()?.content;
  return pinned === 'dark' ? 'dark' : DEFAULT;
}

/** Re-reads the saved choice, for when the app is entered from a page that did not run the boot script. */
export function syncScheme(): void {
  try {
    const saved = localStorage.getItem(SCHEME_KEY);
    const tag = meta();
    if (tag) tag.content = saved === 'dark' ? 'dark' : DEFAULT;
  } catch {
    // Storage blocked: stay light.
  }
}

/** Switches to the other scheme and remembers it. */
export function toggleScheme(): Scheme {
  const next: Scheme = currentScheme() === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(SCHEME_KEY, next);
  } catch {
    // The choice still applies for this visit.
  }
  const tag = meta();
  if (tag) tag.content = next;
  return next;
}
