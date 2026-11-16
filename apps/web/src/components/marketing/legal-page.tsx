import type { ReactNode } from 'react';
import { CONTACT } from '@/lib/site';
import { Eyebrow } from './primitives';

/** When the legal pages last changed. Update it with any change to their text. */
export const LEGAL_UPDATED = '16 November 2026';

/** Shared shell for the legal pages: title, date, summary, then numbered sections. */
export function LegalPage({ title, summary, children }: { title: string; summary: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby="legal-title" className="section" style={{ paddingTop: 96 }}>
      <div className="wrap stack" style={{ gap: 20, maxWidth: 760 }}>
        <Eyebrow>Legal</Eyebrow>
        <h1 id="legal-title" className="h1-sm">
          {title}
        </h1>
        <p className="small" style={{ margin: 0 }}>
          Last updated {LEGAL_UPDATED}
        </p>
        <p className="lead">{summary}</p>
        <div className="legal body">{children}</div>
        <p className="small">
          Questions? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </div>
    </section>
  );
}

/** One numbered part of a legal page. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="h3">{title}</h2>
      {children}
    </section>
  );
}
