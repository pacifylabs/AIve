/**
 * Light/dark theme for the marketing site. The choice lives as `theme-dark` on the `.page` element; a visitor's
 * explicit pick is saved, otherwise the site follows their system setting.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
export const THEME_DARK_CLASS = 'theme-dark';

/**
 * Runs inline as the first child of `.page`, before the page paints, so a dark-mode visitor never sees a light flash.
 * Kept dependency-free and wrapped in try/catch because storage can be blocked.
 */
export const themeBootScript = `(function(){try{var p=document.currentScript.parentElement;var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)p.classList.add('${THEME_DARK_CLASS}')}catch(e){}})();`;

function pageElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.page');
}

export function readTheme(): Theme {
  return pageElement()?.classList.contains(THEME_DARK_CLASS) ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, remember: boolean): void {
  pageElement()?.classList.toggle(THEME_DARK_CLASS, theme === 'dark');
  if (!remember) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode, policy): the choice still applies for this visit.
  }
}

export function hasSavedTheme(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Calls `onChange` whenever the theme class on `.page` changes, whoever changed it. Returns the unsubscribe. */
export function watchTheme(onChange: (theme: Theme) => void): () => void {
  const page = pageElement();
  if (!page) return () => {};
  const observer = new MutationObserver(() => onChange(readTheme()));
  observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
