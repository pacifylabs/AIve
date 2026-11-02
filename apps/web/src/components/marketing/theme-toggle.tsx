'use client';

import { useEffect, useState } from 'react';
import { applyTheme, hasSavedTheme, readTheme, type Theme, watchTheme } from './theme';

/** Moon/sun button in the navigation. Until the visitor picks, the site keeps following their system setting. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(readTheme());
    const stopWatching = watchTheme(setTheme);
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = (event: MediaQueryListEvent) => {
      if (!hasSavedTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
    };
    system.addEventListener('change', followSystem);
    return () => {
      stopWatching();
      system.removeEventListener('change', followSystem);
    };
  }, []);

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Dark theme"
      aria-pressed={dark}
      onClick={() => applyTheme(dark ? 'light' : 'dark', true)}
      style={{ width: 40, height: 40 }}
    >
      {dark ? (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      ) : (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
