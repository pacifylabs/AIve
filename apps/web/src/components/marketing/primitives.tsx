import Link from 'next/link';
import type { ReactNode } from 'react';

/** Small building blocks shared by every marketing page. Styles live in app/(marketing)/marketing.css. */

export function Tick({ stroke = '#1E7A52' }: { stroke?: string }) {
  return (
    <svg
      className="tick"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
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
      style={dark ? { background: 'transparent', color: '#FFFFFF', borderColor: '#3A3A38' } : undefined}
    >
      {children}
    </Link>
  );
}

export type StaffKey = 'social' | 'sales';

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
  const label = who === 'social' ? 'SM' : who === 'sales' ? 'SL' : 'YOU';
  return (
    <span
      className={`tile ${cls}${large ? ' tile-lg' : ''}`}
      style={small ? { width: 22, height: 22, borderRadius: 6, fontSize: 9 } : undefined}
      aria-hidden="true"
    >
      {label}
    </span>
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
  const quiet = dark ? { stroke: '#2E2E2C' } : undefined;
  const strong = dark ? { stroke: '#BFE3CF' } : undefined;
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
