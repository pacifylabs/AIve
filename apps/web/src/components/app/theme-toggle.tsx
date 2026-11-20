'use client';

import { useEffect, useState } from 'react';
import { currentScheme, type Scheme, syncScheme, toggleScheme } from './theme';
import { Icon } from './icons';

/** Sun and moon button for the top bar. Both labels are always in the markup so it reads right before script runs. */
export function ThemeToggle() {
  const [scheme, setScheme] = useState<Scheme | null>(null);

  useEffect(() => {
    syncScheme();
    setScheme(currentScheme());
    // Another tab can change what is showing.
    const onStorage = () => {
      syncScheme();
      setScheme(currentScheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const dark = scheme === 'dark';
  return (
    <button
      type="button"
      className="btn btn-quiet size-9 !p-0"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setScheme(toggleScheme())}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}
