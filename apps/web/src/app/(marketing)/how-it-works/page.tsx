import type { Metadata } from 'next';
import Link from 'next/link';
import { CtaBand, Dock } from '@/components/marketing/calls-to-action';
import { type DemoStep, DemoStepper } from '@/components/marketing/interactive';
import { Arrow, Badge, Eyebrow, LiveGrid, StaffTile } from '@/components/marketing/primitives';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Every task follows the same path: your facts, a budget check, a draft with sources, rule checks, your approval, then action and a record.',
  alternates: { canonical: '/how-it-works' },
};

const PATH = [
  { n: '01 · TRIGGER', title: 'You ask, or a schedule runs', text: '“Follow up Tuesday’s webinar.”', cls: '' },
  { n: '02 · CONTEXT', title: 'Company record', text: 'Only facts you confirmed.', cls: '' },
  { n: '03 · BUDGET', title: 'Spend set aside', text: 'Never past your monthly cap.', cls: '' },
  { n: '04 · DRAFT', title: 'Staff writes it', text: 'With its sources attached', cls: 'turn', typing: true },
  {
    n: '05 · CHECKS',
    title: 'Rules run on the draft',
    text: 'Facts, links, banned words, opt-out line.',
    cls: 'back g5',
    accent: 'amber',
  },
  {
    n: '06 · YOU',
    title: 'Approve, edit or reject',
    text: 'Skipped only once a task is promoted.',
    cls: 'back g6',
    accent: 'ink',
  },
  { n: '07 · ACTION', title: 'Sent or published', text: 'From your accounts, within limits.', cls: 'back g7' },
  { n: '08 · RECORD', title: 'Logged and learned', text: 'Feeds its track record and promotion.', cls: 'end g8' },
] as const;

function CardHead({ title, sub, badge }: { title: string; sub: string; badge: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '16px 18px',
        borderBottom: '1px solid #EDEDE9',
      }}
    >
      <StaffTile who="sales" />
      <span className="stack" style={{ gap: 1, flexGrow: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
        <span className="mono" style={{ fontSize: 11, color: '#5E5E5B' }}>
          {sub}
        </span>
      </span>
      {badge}
    </div>
  );
}

const EMAIL_STEPS: DemoStep[] = [
  {
    title: 'You ask',
    text: 'One line in plain words, like briefing a new hire.',
    scene: (
      <>
        <div
          style={{
            alignSelf: 'flex-end',
            maxWidth: 400,
            background: '#111111',
            color: '#FFFFFF',
            borderRadius: '18px 18px 4px 18px',
            padding: '14px 16px',
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Follow up with the 12 people who came to Tuesday&apos;s webinar. Mention the recording.
        </div>
        <div className="card" style={{ maxWidth: 440, padding: 18, display: 'flex', gap: 12 }}>
          <StaffTile who="sales" />
          <div className="stack" style={{ gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Sales Manager Staff</span>
            <span style={{ fontSize: 14, lineHeight: 1.55, color: '#2E2E2C' }}>
              On it. I&apos;ll read each company&apos;s site and draft 12 emails for your approval. Nothing goes out
              until you say so.
            </span>
            <span className="badge b-grey" style={{ alignSelf: 'flex-start' }}>
              12 drafts queued
            </span>
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'It drafts, with sources',
    text: 'Every claim traces back to their site or your confirmed facts.',
    scene: (
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <CardHead
          title="Draft 1 of 12"
          sub="TO DANA OKAFOR, NORTHFIELD STUDIO"
          badge={<Badge tone="wait">Waiting for you</Badge>}
        />
        <div className="stack" style={{ padding: 18, gap: 10, fontSize: 14, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 500 }}>Subject: Tuesday&apos;s webinar recording</span>
          <span style={{ color: '#2E2E2C' }}>
            Hi Dana, thanks for joining on Tuesday. Here&apos;s the recording. Your site mentions onboarding 30+ clients
            a quarter; would a 15-minute look at how teams that size cut status emails be useful?
          </span>
          <span style={{ color: '#2E2E2C' }}>
            If this isn&apos;t for you, just say so and I won&apos;t write again.
          </span>
        </div>
        <div
          className="mono"
          style={{
            margin: '0 18px 18px',
            padding: '10px 12px',
            borderRadius: 10,
            background: '#F6F6F4',
            fontSize: 11,
            lineHeight: 1.7,
            color: '#5E5E5B',
          }}
        >
          SOURCE northfield.studio/about · read 09:02
          <br />
          FACT USED 15-minute intro call · confirmed by you
        </div>
      </div>
    ),
  },
  {
    title: 'You edit and approve',
    text: 'Your edits teach it. Nothing sends until you say so.',
    scene: (
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <CardHead title="Draft 1 of 12" sub="TO DANA OKAFOR" badge={<Badge tone="ok">Approved</Badge>} />
        <div style={{ padding: 18, fontSize: 14, lineHeight: 1.6, color: '#2E2E2C' }}>
          …would <del style={{ color: '#8A4B05' }}>a 15-minute look at how teams that size cut status emails</del>{' '}
          <ins
            style={{
              textDecoration: 'none',
              background: '#EAF3EE',
              color: '#17643F',
              padding: '0 3px',
              borderRadius: 4,
            }}
          >
            a short call about cutting status emails
          </ins>{' '}
          be useful?
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            padding: '0 18px 18px',
            fontSize: 12,
            color: '#5E5E5B',
          }}
        >
          <span>Your edit is remembered for the next 11.</span>
          <span className="mono">sent from you@northfield.studio · 09:41</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Its record builds',
    text: 'Approvals, edits and rejections, counted per task.',
    scene: (
      <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="eyebrow" style={{ fontSize: 11 }}>
          TRACK RECORD · FIRST EMAILS · LAST 30 DAYS
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 40, fontWeight: 500, letterSpacing: '-0.03em' }}>18</span>
          <span className="small">of 20 approvals needed</span>
        </div>
        <div className="meter" role="img" aria-label="18 of 20 approvals">
          <span style={{ width: '90%', animation: 'none' }} />
        </div>
        <span className="small">Median edit 9% · no complaints · no bounces</span>
      </div>
    ),
  },
  {
    title: 'You decide on promotion',
    text: 'A clean record unlocks the offer. Only you can accept it.',
    scene: (
      <div
        style={{
          background: '#111111',
          color: '#FFFFFF',
          borderRadius: 18,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 20px 50px rgba(17,17,17,.25)',
        }}
      >
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: '#BFE3CF' }}>
          PROMOTION AVAILABLE
        </span>
        <span style={{ fontSize: 20, lineHeight: 1.35, fontWeight: 500 }}>
          First emails have a clean record. Let your Sales Manager Staff send them on its own?
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: '#C9C9C4' }}>
          Replies about pricing, contracts or complaints still come to you, promoted or not.
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-hidden="true">
          <span className="btn btn-sm btn-white">Promote</span>
          <span className="btn btn-sm" style={{ color: '#C9C9C4', border: '1px solid #3A3A38' }}>
            Not yet
          </span>
        </div>
      </div>
    ),
  },
];

const CALL_STEPS: DemoStep[] = [
  {
    title: 'A caller rings your line',
    text: "It answers in your business's name and says it's an AI.",
    scene: (
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <CardHead
          title="Incoming call · your sales line"
          sub="00:04 · AI DISCLOSED · RECORDING NOTICE"
          badge={
            <span className="badge b-ok">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Live
            </span>
          }
        />
        <div className="stack" style={{ padding: 18, gap: 12, fontSize: 14, lineHeight: 1.6 }}>
          <span>
            <b style={{ fontWeight: 500 }}>Staff</b> Hi, you&apos;ve reached Northfield Studio. I&apos;m the
            studio&apos;s AI assistant, and this call may be recorded. How can I help?
          </span>
          <span>
            <b style={{ fontWeight: 500 }}>Caller</b> We&apos;re looking for onboarding help for about 40 clients.
          </span>
        </div>
      </div>
    ),
  },
  {
    title: 'It knows its limits',
    text: 'Discounts, contracts and complaints go to a person.',
    scene: (
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <CardHead
          title="Call · Jane Mensah, Halden Logistics"
          sub="02:14"
          badge={<Badge tone="wait">Transferring to you</Badge>}
        />
        <div className="stack" style={{ padding: 18, gap: 12, fontSize: 14, lineHeight: 1.6 }}>
          <span>
            <b style={{ fontWeight: 500 }}>Caller</b> Can you do a better price if we sign for a year?
          </span>
          <span>
            <b style={{ fontWeight: 500 }}>Staff</b> That&apos;s one for the team. I&apos;m connecting you now, one
            moment.
          </span>
        </div>
      </div>
    ),
  },
  {
    title: 'You pick up, already briefed',
    text: "A one-line summary before you're connected.",
    scene: (
      <>
        <div
          style={{
            background: '#111111',
            color: '#FFFFFF',
            borderRadius: 18,
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: '#F2C98A' }}>
            WHISPERED TO YOU BEFORE CONNECTING
          </span>
          <span style={{ fontSize: 16, lineHeight: 1.5 }}>
            Jane Mensah, Halden Logistics. Wants annual pricing for 40 clients. Already watched the webinar.
          </span>
        </div>
        <div
          className="card"
          style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start' }}
        >
          <span className="live-dot" />
          <span style={{ fontSize: 14, fontWeight: 500 }}>You picked up · 02:31</span>
        </div>
      </>
    ),
  },
];

const FIRST_DAY = [
  ['Enter your website', 'We draft your company record from it.'],
  ['Confirm the facts', 'Keep, edit or delete each one. Prices stay unconfirmed until you tick them.'],
  ['Hire and connect', 'Five questions and one account: a social network or your mailbox.'],
  ['Approve your first drafts', 'Your inbox opens with real work already in it.'],
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <section aria-labelledby="how-hero" className="page-hero" style={{ paddingBottom: 64 }}>
        <LiveGrid />
        <div className="wrap center-head enter" style={{ position: 'relative', zIndex: 2 }}>
          <Eyebrow>HOW IT WORKS</Eyebrow>
          <h1 id="how-hero" className="h1-sm">
            From task to done, <span className="muted-head">with you in charge.</span>
          </h1>
          <p className="lead">
            Every piece of work follows the same path. The model only proposes; the rules and you decide what happens.
          </p>
          <div className="cta-row">
            <Link href="/early-access" className="btn btn-dark btn-xl">
              Join early access <Arrow />
            </Link>
            <a href="#demo" className="btn btn-light btn-xl">
              Try the demo
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="flow-title" className="section" style={{ paddingTop: 24 }}>
        <div className="wrap">
          <div className="floor">
            <div className="floor-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="live-dot" />
                <h2 id="flow-title" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
                  The path every task takes
                </h2>
              </div>
              <span className="mono small hide-sm">SAME FOR EVERY ROLE</span>
            </div>
            <div className="floor-body" style={{ padding: '48px 40px' }}>
              <ol className="graph" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {PATH.map((node) => (
                  <li
                    key={node.n}
                    className={`gnode ${node.cls}`}
                    style={
                      'accent' in node ? { borderColor: node.accent === 'amber' ? '#C27A12' : '#111111' } : undefined
                    }
                  >
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: 'accent' in node ? (node.accent === 'amber' ? '#8A4B05' : '#111111') : '#1E7A52',
                      }}
                    >
                      {node.n}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{node.title}</span>
                    <span className={`small${'typing' in node ? ' typing' : ''}`}>{node.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section id="demo" aria-labelledby="demo-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap stack" style={{ gap: 22 }}>
          <Eyebrow>TRY IT</Eyebrow>
          <h2 id="demo-title" className="h2">
            Watch a morning&apos;s work.
          </h2>
          <DemoStepper
            stories={[
              { key: 'email', label: 'Sales emails', steps: EMAIL_STEPS },
              { key: 'call', label: 'A phone call', steps: CALL_STEPS },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="day-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap stack" style={{ gap: 40 }}>
          <div className="center-head">
            <Eyebrow>YOUR FIRST DAY</Eyebrow>
            <h2 id="day-title" className="h2">
              Real drafts before you close the tab.
            </h2>
          </div>
          <ol className="grid4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {FIRST_DAY.map(([title, text], i) => (
              <li
                key={title}
                className="card"
                style={{
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  border: i === 3 ? '1px solid #111111' : undefined,
                }}
              >
                <span className="mono" style={{ fontSize: 12, color: i === 3 ? '#111111' : '#1E7A52' }}>
                  STEP {i + 1}
                </span>
                <span style={{ fontSize: 16, fontWeight: 500 }}>{title}</span>
                <span className="small">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand
        title="See it with your own business."
        sub="Join early access and your first drafts are written from your own website."
      />
      <Dock />
    </>
  );
}
