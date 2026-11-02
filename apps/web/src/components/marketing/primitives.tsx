import Link from 'next/link';
import type { ReactNode } from 'react';

/** Small building blocks shared by every marketing page. Styles live in app/(marketing)/marketing.css. */

export function Tick({ stroke = 'var(--ok)' }: { stroke?: string }) {
  return (
    <svg
      className="tick"
      viewBox="0 0 24 24"
      fill="none"
      style={{ stroke }}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Arrow() {
  return (
    <span className="arrow" aria-hidden="true">
      →
    </span>
  );
}

export function TickList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list">
      {items.map((item, index) => (
        <li key={index}>
          <Tick />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PillLink({ href, children, dark = false }: { href: string; children: ReactNode; dark?: boolean }) {
  return (
    <Link
      href={href}
      className="pill-link"
      style={dark ? { background: 'transparent', color: 'var(--on-band)', borderColor: 'var(--band-line)' } : undefined}
    >
      {children}
    </Link>
  );
}

export type StaffKey = 'social' | 'sales';

const ROLE_NAMES = { social: 'Social Media Staff', sales: 'Sales Manager Staff', you: 'You' } as const;

/** Line icons standing in for each role: a megaphone for social, a briefcase for sales, a person for you. */
export function RoleIcon({ who }: { who: StaffKey | 'you' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {who === 'social' ? (
        <>
          <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5l5.5 4V5.5l-5.5 4H4a1 1 0 0 0-1 1z" />
          <path d="M15.5 9a3.5 3.5 0 0 1 0 6" />
          <path d="M18.5 6.5a7 7 0 0 1 0 11" />
        </>
      ) : who === 'sales' ? (
        <>
          <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
          <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
          <path d="M3 13h18" />
          <path d="M11 13v1.5h2V13" />
        </>
      ) : (
        <>
          <circle cx="12" cy="8.5" r="3.8" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </>
      )}
    </svg>
  );
}

/** A role's icon in its coloured tile. Decorative: the role's name is always written next to it. */
export function StaffTile({
  who,
  large = false,
  small = false,
}: {
  who: StaffKey | 'you';
  large?: boolean;
  small?: boolean;
}) {
  const cls = who === 'social' ? 'tile-sm' : who === 'sales' ? 'tile-sl' : 'tile-you';
  return (
    <span
      className={`tile ${cls}${large ? ' tile-lg' : ''}`}
      style={small ? { width: 22, height: 22, borderRadius: 6 } : undefined}
      title={ROLE_NAMES[who]}
      aria-hidden="true"
    >
      <RoleIcon who={who} />
    </span>
  );
}

/** The logo: a small Earth with an orbit, drawn in theme colours. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="7" style={{ fill: 'var(--accent)' }} />
      <ellipse
        cx="14"
        cy="14"
        rx="12"
        ry="4.6"
        transform="rotate(-22 14 14)"
        style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.6 }}
      />
      <circle cx="24.6" cy="9.8" r="1.9" style={{ fill: 'var(--ink)' }} />
    </svg>
  );
}

export function LiveGrid() {
  return (
    <div className="live-bg" aria-hidden="true">
      <div className="live-grid" />
    </div>
  );
}

/** Dashed signal paths with a travelling marker, behind hero content. */
export function SignalLines({ dark = false }: { dark?: boolean }) {
  const quiet = dark ? { stroke: 'var(--band-line)' } : undefined;
  const strong = dark ? { stroke: 'var(--band-accent)' } : undefined;
  return (
    <svg
      className="live-bg"
      width="100%"
      height="100%"
      viewBox="0 0 1440 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="signal" style={quiet} d="M-40 640 C 260 520, 420 760, 720 620 S 1180 420, 1480 560" />
      <path
        className="signal"
        style={{ ...quiet, animationDuration: '9s' }}
        d="M-40 260 C 300 360, 520 160, 760 260 S 1160 420, 1480 220"
      />
      <path className="signal-strong" style={strong} d="M-40 640 C 260 520, 420 760, 720 620 S 1180 420, 1480 560" />
      <path
        className="signal-strong"
        style={{ ...strong, animationDelay: '-2.5s' }}
        d="M-40 260 C 300 360, 520 160, 760 260 S 1160 420, 1480 220"
      />
    </svg>
  );
}

export function Badge({ tone, children }: { tone: 'wait' | 'ok' | 'grey' | 'ink'; children: ReactNode }) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
