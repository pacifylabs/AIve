import Link from 'next/link';
import { Arrow } from './primitives';

/** The dark closing band at the end of every page. */
export function CtaBand({ title, sub }: { title: string; sub: string }) {
  return (
    <section aria-labelledby="cta-band-title" style={{ padding: '40px 0 96px' }}>
      <div className="wrap">
        <div
          className="dark"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 28,
            padding: '96px 32px 210px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 24,
          }}
        >
          {/* The night side of the Earth rising from the bottom edge. */}
          <div className="cta-horizon" aria-hidden="true" />
          <span
            className="cta-note"
            style={{
              position: 'relative',
              background: 'rgba(255,255,255,.08)',
              borderColor: 'rgba(255,255,255,.16)',
              color: 'var(--on-band)',
            }}
          >
            <span className="live-dot" />
            Early access is open
          </span>
          <h2 id="cta-band-title" className="h2" style={{ position: 'relative', maxWidth: 720 }}>
            {title}
          </h2>
          <p className="lead" style={{ position: 'relative', maxWidth: 520 }}>
            {sub}
          </p>
          <Link
            href="/early-access"
            className="btn btn-white btn-xl"
            style={{ position: 'relative', width: '100%', maxWidth: 520 }}
          >
            Join early access <Arrow />
          </Link>
          <Link href="/how-it-works" style={{ position: 'relative', fontSize: 14, color: 'var(--on-band-muted)' }}>
            or see how it works first
          </Link>
        </div>
      </div>
    </section>
  );
}

/** The floating bar that follows the reader down the page; it fades in after the hero and out at the end. */
export function Dock() {
  return (
    <div className="dock">
      <div className="dock-inner">
        <span className="live-dot" />
        <span className="dock-text" style={{ fontSize: 14 }}>
          Early access is open
        </span>
        <Link href="/early-access" className="btn btn-white btn-sm">
          Join early access <Arrow />
        </Link>
      </div>
    </div>
  );
}
