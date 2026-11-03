import type { ReactNode } from 'react';
import { Eyebrow } from './primitives';

export interface LegalSection {
  /** Anchor for the contents list and deep links, e.g. `your-rights`. */
  id: string;
  title: string;
  body: ReactNode;
}

const CONTACT = 'pacifylabs@gmail.com';

/**
 * Shared layout for the legal pages: title, last-updated date, a contents list that stays in view on wide screens,
 * and numbered sections. Pages pass `draft` until a lawyer has reviewed the text, which shows a notice at the top.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
  draft = true,
}: {
  title: string;
  /** ISO date, shown as "Last updated". */
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
  draft?: boolean;
}) {
  const updatedLabel = new Date(`${updated}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <section aria-labelledby="legal-title" className="section legal">
      <div className="wrap">
        <header className="legal-head">
          <Eyebrow>Legal</Eyebrow>
          <h1 id="legal-title" className="h1-sm">
            {title}
          </h1>
          <p className="small" style={{ margin: 0 }}>
            Last updated <time dateTime={updated}>{updatedLabel}</time>
          </p>
          {draft ? (
            <p className="legal-draft" role="note">
              <strong>Draft for legal review.</strong> This page describes how the product works today. Text in
              [brackets] is still to be filled in, and the final version will be published before launch.
            </p>
          ) : null}
          <div className="legal-intro body">{intro}</div>
        </header>

        <div className="legal-layout">
          <nav aria-label="On this page" className="legal-toc">
            <span className="footer-head">On this page</span>
            <ol>
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>
                    <span className="mono">{String(i + 1).padStart(2, '0')}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="legal-body">
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-title`}
                className="legal-section"
              >
                <h2 id={`${section.id}-title`} className="h3">
                  <span className="mono legal-num">{String(i + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                <div className="legal-text">{section.body}</div>
              </section>
            ))}
            <aside className="legal-contact glass">
              <span style={{ fontWeight: 500 }}>Questions about this page?</span>
              <span className="small">
                Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. A person reads every message.
              </span>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Marks text that still needs a real value before launch, so it can't be mistaken for a final statement. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="legal-placeholder">[{children}]</mark>;
}
