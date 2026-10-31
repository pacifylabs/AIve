'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Arrow } from './primitives';

const LINKS = [
  { href: '/staff/social-media', label: 'Social Media Staff' },
  { href: '/staff/sales-manager', label: 'Sales Manager Staff' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/safety', label: 'Safety' },
  { href: '/pricing', label: 'Pricing' },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the phone menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link
          href="/"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#111111' }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#F6F6F4' }} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>AI as a Staff</span>
        </Link>
        <nav aria-label="Main" className="nav-links">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/login" className="nav-login" style={{ fontSize: 13, textDecoration: 'none', color: '#3A3A38' }}>
            Log in
          </Link>
          <Link href="/early-access" className="btn btn-dark btn-sm nav-cta">
            Join early access <Arrow />
          </Link>
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
            style={{ width: 40, height: 40 }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-menu" aria-label="Mobile" style={{ borderTop: '1px solid #E6E6E2', background: '#FFFFFF' }}>
          <div className="wrap" style={{ display: 'flex', flexDirection: 'column', paddingTop: 8, paddingBottom: 16 }}>
            {[...LINKS, { href: '/early-access', label: 'Join early access' }, { href: '/login', label: 'Log in' }].map(
              (link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={pathname === link.href ? 'page' : undefined}
                  style={{ fontSize: 17, textDecoration: 'none', padding: '14px 0', borderBottom: '1px solid #EDEDE9' }}
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
