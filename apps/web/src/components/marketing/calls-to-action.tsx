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
            padding: '88px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 24,
          }}
        >
          <svg
            className="live-bg"
            width="100%"
            height="100%"
            viewBox="0 0 1200 420"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className="signal"
              style={{ stroke: '#3A3A38' }}
              d="M-20 320 C 240 200, 420 380, 640 260 S 1000 120, 1240 220"
            />
            <path
              className="signal"
              style={{ stroke: '#3A3A38', animationDuration: '9s' }}
              d="M-20 120 C 200 220, 460 60, 700 140 S 1040 300, 1240 90"
            />
            <path
              className="signal-strong"
              style={{ stroke: '#BFE3CF' }}
              d="M-20 320 C 240 200, 420 380, 640 260 S 1000 120, 1240 220"
            />
          </svg>
          <span
            className="cta-note"
            style={{ position: 'relative', background: '#1C1C1B', borderColor: '#2E2E2C', color: '#E4E4E0' }}
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
          <Link href="/how-it-works" style={{ position: 'relative', fontSize: 14, color: '#C9C9C4' }}>
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
