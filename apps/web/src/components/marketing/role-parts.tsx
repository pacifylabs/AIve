import Link from 'next/link';
import type { ReactNode } from 'react';
import { Arrow, Badge, Eyebrow, LiveGrid, StaffTile, type StaffKey } from './primitives';

/** Pieces shared by the two role pages. */

export function RoleHero({
  who,
  roleName,
  titleStart,
  titleEnd,
  lead,
  primaryLabel,
  secondary,
  aside,
}: {
  who: StaffKey;
  roleName: string;
  titleStart: string;
  titleEnd: string;
  lead: string;
  primaryLabel: string;
  secondary: { href: string; label: string };
  aside: ReactNode;
}) {
  return (
    <section aria-labelledby="role-hero" className="page-hero">
      <LiveGrid />
      <div className="wrap split-even" style={{ position: 'relative', zIndex: 2 }}>
        <div className="stack enter" style={{ gap: 22 }}>
          <span className="cta-note" style={{ alignSelf: 'flex-start' }}>
            <StaffTile who={who} small />
            {roleName}
          </span>
          <h1 id="role-hero" className="h1-sm">
            {titleStart} <span className="muted-head">{titleEnd}</span>
          </h1>
          <p className="lead">{lead}</p>
          <div className="cta-row" style={{ justifyContent: 'flex-start' }}>
            <Link href={`/early-access?role=${who}`} className="btn btn-dark btn-xl">
              {primaryLabel} <Arrow />
            </Link>
            <Link href={secondary.href} className="btn btn-light btn-xl">
              {secondary.label}
            </Link>
          </div>
        </div>
        <div className="enter-2">{aside}</div>
      </div>
    </section>
  );
}

/** A card listing rows of "quote · status", used for plans, replies and comments. */
export function StatusList({
  heading,
  live,
  rows,
}: {
  heading: string;
  live?: string;
  rows: { text: ReactNode; tone: 'wait' | 'ok' | 'grey' | 'ink'; status: string }[];
}) {
  return (
    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}
      >
        <span className="eyebrow" style={{ fontSize: 11 }}>
          {heading}
        </span>
        {live ? (
          <span className="badge b-ok">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            {live}
          </span>
        ) : null}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : undefined,
            fontSize: 13,
          }}
        >
          <span style={{ minWidth: 0 }}>{row.text}</span>
          <Badge tone={row.tone}>{row.status}</Badge>
        </div>
      ))}
    </div>
  );
}

/** The Social Media Staff hero card: day, network, topic and status in columns, as on the canvas. */
export function WeekPlan({
  rows,
}: {
  rows: {
    day: string;
    network: string;
    topic: string;
    tone: 'ok' | 'wait' | 'grey';
    status: string;
    typing?: boolean;
  }[];
}) {
  return (
    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="eyebrow" style={{ fontSize: 11 }}>
          THIS WEEK&apos;S PLAN · EXAMPLE
        </span>
        <span className="badge b-ok">
          <span className="live-dot" style={{ width: 6, height: 6 }} />
          Planning
        </span>
      </div>
      {rows.map((row, i) => (
        <div
          key={row.day}
          style={{
            display: 'grid',
            gridTemplateColumns: '44px 84px minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : undefined,
            fontSize: 13,
          }}
        >
          <span className="mono" style={{ color: 'var(--muted)' }}>
            {row.day}
          </span>
          <span>{row.network}</span>
          <span style={{ minWidth: 0 }} className={row.typing ? 'typing' : undefined}>
            {row.topic}
          </span>
          <Badge tone={row.tone}>{row.status}</Badge>
        </div>
      ))}
    </div>
  );
}

export interface AutonomyRow {
  task: string;
  starts: string;
  alone: { text: string; tone?: 'ok' | 'grey' | 'ink' };
}

export function AutonomySection({ intro, rows }: { intro: string; rows: AutonomyRow[] }) {
  const grid = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr)',
    gap: 16,
  } as const;
  return (
    <section aria-labelledby="earn-title" className="section" style={{ paddingTop: 0 }}>
      <div className="wrap split">
        <div className="stack" style={{ gap: 16 }}>
          <Eyebrow>What it can earn</Eyebrow>
          <h2 id="earn-title" className="h2">
            Trust is earned per task.
          </h2>
          <p className="body">{intro}</p>
        </div>
        <div className="card" style={{ padding: '8px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption className="sr-only">What this staff member can do on its own</caption>
            <thead>
              <tr
                className="mono"
                style={{
                  ...grid,
                  padding: '14px 0',
                  borderBottom: '1px solid var(--line-soft)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  textAlign: 'left',
                }}
              >
                <th scope="col" style={{ fontWeight: 400 }}>
                  TASK
                </th>
                <th scope="col" style={{ fontWeight: 400 }}>
                  STARTS AS
                </th>
                <th scope="col" style={{ fontWeight: 400 }}>
                  CAN ACT ALONE
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.task}
                  style={{
                    ...grid,
                    padding: '16px 0',
                    borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : undefined,
                    fontSize: 14,
                    alignItems: 'center',
                  }}
                >
                  <th scope="row" style={{ fontWeight: 400, textAlign: 'left' }}>
                    {row.task}
                  </th>
                  <td className="small">{row.starts}</td>
                  <td>
                    {row.alone.tone ? (
                      <Badge tone={row.alone.tone}>{row.alone.text}</Badge>
                    ) : (
                      <span className="small">{row.alone.text}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function NumberedQuestions({ heading, questions }: { heading: string; questions: string[] }) {
  return (
    <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Eyebrow>{heading}</Eyebrow>
      <ol className="list">
        {questions.map((question, i) => (
          <li key={question}>
            <span className="mono" style={{ color: 'var(--accent)', fontSize: 12, paddingTop: 2 }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            {question}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Text on the left, illustration on the right, inside a capability tab. */
export function CapabilityPanel({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="split">
      <div className="stack" style={{ gap: 12 }}>
        <h3 className="h3">{title}</h3>
        <p className="body">{text}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}
