import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CtaBand, Dock } from '@/components/marketing/calls-to-action';
import { PauseSwitch } from '@/components/marketing/interactive';
import { Arrow, Eyebrow } from '@/components/marketing/primitives';

export const metadata: Metadata = {
  title: 'Safety',
  description:
    'The rules your AI staff follow whatever their record: facts only, your own mailbox, instant opt-outs, AI disclosure on calls, every video watched first, and a spending cap you set.',
  alternates: { canonical: '/safety' },
};

const RULES: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: 'Facts only',
    text: 'Prices, offers and claims come only from your confirmed company record. Unconfirmed means unused.',
    icon: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  },
  {
    title: 'Your mailbox, your limits',
    text: 'Email goes from your own domain after a records check, with daily limits that ramp up slowly.',
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>
    ),
  },
  {
    title: 'Opt-outs are instant',
    text: '“Stop” on any channel ends contact for good. Every email carries an unsubscribe link.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 8l8 8" />
      </>
    ),
  },
  {
    title: "It says it's an AI",
    text: 'Every call opens with that and a recording notice. Calls go out only to people who asked.',
    icon: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  },
  {
    title: 'Every video watched first',
    text: 'No video posts until a person watches it to the end. AI-made videos are labelled when they post.',
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M10 9.5v5l4-2.5z" />
      </>
    ),
  },
  {
    title: 'A spending cap you set',
    text: 'Staff pause at your monthly cap. A call in progress ends politely, never mid-sentence.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
];

const DATA = [
  [
    'Separated by business',
    'Every record belongs to one workspace, enforced in the database itself, not just the app.',
  ],
  ['Connections encrypted', 'Account connections and mailbox passwords are stored encrypted, and never shown again.'],
  [
    'Deleted on request',
    "Remove a contact's data in one step. Call recordings are kept 30 days by default, or not at all.",
  ],
] as const;

export default function SafetyPage() {
  return (
    <>
      <section aria-labelledby="safety-hero" className="dark page-hero">
        <svg
          className="live-bg"
          width="100%"
          height="100%"
          viewBox="0 0 1440 640"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="signal"
            style={{ stroke: 'var(--band-line)' }}
            d="M-40 480 C 300 360, 520 560, 760 440 S 1180 300, 1480 400"
          />
          <path
            className="signal-strong"
            style={{ stroke: 'var(--band-accent)' }}
            d="M-40 480 C 300 360, 520 560, 760 440 S 1180 300, 1480 400"
          />
        </svg>
        <div className="wrap center-head enter" style={{ position: 'relative', zIndex: 2 }}>
          <Eyebrow>Safety</Eyebrow>
          <h1 id="safety-hero" className="h1-sm">
            The rules that never <span style={{ color: '#8F8F8A' }}>get promoted away.</span>
          </h1>
          <p className="lead">
            Your staff can earn more freedom. These rules don&apos;t change, whatever a staff member&apos;s record.
          </p>
          <Link href="/early-access" className="btn btn-white btn-xl">
            Join early access <Arrow />
          </Link>
        </div>
      </section>

      <section aria-labelledby="rules-title" className="dark section" style={{ paddingTop: 24 }}>
        <div className="wrap stack" style={{ gap: 32 }}>
          <h2 id="rules-title" className="eyebrow">
            The rules
          </h2>
          <ul className="safety-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {RULES.map((rule) => (
              <li key={rule.title} className="safety-item">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#BFE3CF"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {rule.icon}
                </svg>
                <h3 className="h3" style={{ fontSize: 18 }}>
                  {rule.title}
                </h3>
                <p className="small" style={{ margin: 0 }}>
                  {rule.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="pause-title" className="section">
        <div className="wrap split">
          <div className="stack" style={{ gap: 16 }}>
            <Eyebrow>Always in control</Eyebrow>
            <h2 id="pause-title" className="h2">
              One switch stops everything.
            </h2>
            <p className="body">
              Pause one task, one staff member or your whole workspace. A pause takes effect before the next action. Try
              it.
            </p>
          </div>
          <PauseSwitch />
        </div>
      </section>

      <section aria-labelledby="data-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap stack" style={{ gap: 40 }}>
          <div className="center-head">
            <Eyebrow>Your data</Eyebrow>
            <h2 id="data-title" className="h2">
              Kept apart, kept short, yours to delete.
            </h2>
          </div>
          <div className="grid3">
            {DATA.map(([title, text]) => (
              <div
                key={title}
                className="card"
                style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <h3 className="h3" style={{ fontSize: 18 }}>
                  {title}
                </h3>
                <p className="body" style={{ fontSize: 14 }}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Hire staff you can trust." sub="Every rule on this page is on from day one." />
      <Dock />
    </>
  );
}
