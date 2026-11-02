import type { ReactNode } from 'react';
import { Eyebrow } from './primitives';

/**
 * Shared shell for the legal pages. The text is a placeholder until the real
 * policy is written and reviewed; the notice says so on the page.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby="legal-title" className="section" style={{ paddingTop: 96 }}>
      <div className="wrap stack" style={{ gap: 20, maxWidth: 760 }}>
        <Eyebrow>Legal</Eyebrow>
        <h1 id="legal-title" className="h1-sm">
          {title}
        </h1>
        <p className="badge b-wait" style={{ alignSelf: 'flex-start' }}>
          Draft · the full text is published before launch
        </p>
        <div className="stack body" style={{ gap: 14 }}>
          {children}
        </div>
        <p className="small">
          Questions? Email <a href="mailto:pacifylabs@gmail.com">pacifylabs@gmail.com</a>.
        </p>
      </div>
    </section>
  );
}
