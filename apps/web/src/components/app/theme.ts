/**
 * The app's colour scheme. By default the page follows the system (`<meta name="color-scheme" content="light dark">`).
 * The top-bar toggle pins light or dark by changing that meta tag and remembering the choice. The storage key is the
 * one the marketing site uses, so a visitor's pick follows them between the site and the app.
 */

export const SCHEME_KEY = 'theme';

/**
 * Runs in the head before first paint so a pinned scheme never flashes the wrong one. Small on purpose, and wrapped in
 * try/catch because storage can be blocked: the page then simply follows the system.
 */
export const schemeBootScript = `(function(){try{var s=localStorage.getItem('${SCHEME_KEY}');if(s==='light'||s==='dark')document.querySelector('meta[name="color-scheme"]').content=s}catch(e){}})();`;

export type Scheme = 'light' | 'dark';

const meta = () => document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');

const systemScheme = (): Scheme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** The scheme the page is showing now. */
export function currentScheme(): Scheme {
  const pinned = meta()?.content;
  return pinned === 'light' || pinned === 'dark' ? pinned : systemScheme();
}

/** Re-reads the saved choice, for when the app is entered from a page that did not run the boot script. */
export function syncScheme(): void {
  try {
    const saved = localStorage.getItem(SCHEME_KEY);
    const tag = meta();
    if (tag) tag.content = saved === 'light' || saved === 'dark' ? saved : 'light dark';
  } catch {
    // Storage blocked: keep following the system.
  }
}

/**
 * Switches to the other scheme. Going back to what the system already shows clears the saved choice, so the page
 * follows the system again; anything else is pinned. The system setting is never "corrected" behind the person's back.
 */
export function toggleScheme(): Scheme {
  const next: Scheme = currentScheme() === 'dark' ? 'light' : 'dark';
  const tag = meta();
  try {
    if (next === systemScheme()) {
      localStorage.removeItem(SCHEME_KEY);
      if (tag) tag.content = 'light dark';
    } else {
      localStorage.setItem(SCHEME_KEY, next);
      if (tag) tag.content = next;
    }
  } catch {
    // The choice still applies for this visit.
    if (tag) tag.content = next;
  }
  return next;
}
