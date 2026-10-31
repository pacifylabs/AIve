import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { CtaBand, Dock } from '@/components/marketing/calls-to-action';
import { Carousel } from '@/components/marketing/interactive';
import { Arrow, Badge, Eyebrow, PillLink, SignalLines, StaffTile, TickList } from '@/components/marketing/primitives';

export const metadata: Metadata = {
  title: { absolute: 'AI as a Staff — AI staff that earn your trust' },
  description:
    'Hire AI staff for social media and sales. They start on probation, work only from facts you confirm, and act on their own once you promote them.',
  alternates: { canonical: '/' },
};

function FloatCard({
  style,
  className,
  tone,
  children,
}: {
  style: CSSProperties;
  className: string;
  tone?: 'dark';
  children: ReactNode;
}) {
  return (
    <div
      className={`float ${className}`}
      style={{ ...style, ...(tone === 'dark' ? { background: '#111111' } : {}) }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

const WORK = [
  ['social', 'ok', 'Posted', 'Why onboarding stalls in week two', 'LINKEDIN · MON 10:00'],
  ['sales', 'ok', 'Sent', 'First email to Dana Okafor', 'APPROVED · 1 EDIT'],
  ['social', 'wait', 'Watch to approve', '30-second kickoff checklist video', 'INSTAGRAM · TEMPLATE'],
  ['sales', 'wait', 'Handed to you', 'Reply asks for a yearly discount', 'RULE · DISCOUNTS'],
  ['sales', 'ink', 'Stopped for good', '“Please take me off your list”', 'OPT-OUT · INSTANT'],
  ['social', 'grey', 'Draft', 'Reply to a question on Facebook', 'COMMENT · 2 MIN AGO'],
  ['sales', 'ok', 'Call transferred', 'Jane Mensah, 40-seat enquiry', 'VOICE · 02:31'],
  ['social', 'ok', 'Lead created', '“How much for 10 seats?”', 'INSTAGRAM → SALES'],
] as const;

const STEPS = [
  ['Brief once', "We read your website. You confirm what's true."],
  ['Hire and connect', 'Pick a role, answer five questions, connect one account.'],
  ['Approve on probation', 'Everything waits in one inbox until you say yes.'],
  ['Promote when ready', 'A clean record unlocks acting alone, task by task.'],
] as const;

export default function HomePage() {
  const slides = [
    <article
      key="social"
      className="card"
      style={{
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StaffTile who="social" large />
        <div className="stack" style={{ gap: 2 }}>
          <h3 className="h3">Social Media Staff</h3>
          <span className="small">Keeps your accounts active and sounding like you.</span>
        </div>
      </div>
      <TickList
        items={[
          'Plans a week of posts around your offers',
          'Makes short videos you watch before they post',
          'Turns buying comments into sales leads',
        ]}
      />
      <div style={{ marginTop: 'auto' }}>
        <PillLink href="/staff/social-media">MEET SOCIAL MEDIA STAFF →</PillLink>
      </div>
    </article>,
    <article
      key="sales"
      className="card"
      style={{
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StaffTile who="sales" large />
        <div className="stack" style={{ gap: 2 }}>
          <h3 className="h3">Sales Manager Staff</h3>
          <span className="small">Follows up properly and knows when to stop.</span>
        </div>
      </div>
      <TickList
        items={[
          'Writes first emails and follow-ups from your mailbox',
          'Sorts every reply, stops at the first “no”',
          'Answers your sales line, puts callers through to you',
        ]}
      />
      <div style={{ marginTop: 'auto' }}>
        <PillLink href="/staff/sales-manager">MEET SALES MANAGER STAFF →</PillLink>
      </div>
    </article>,
    <article
      key="team"
      className="card"
      style={{
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <StaffTile who="social" large />
        <StaffTile who="sales" large />
      </div>
      <h3 className="h3">Better together</h3>
      <p className="body">
        Hire both and they pass work to each other: a comment becomes a lead, a lead becomes a conversation, and you
        approve the reply.
      </p>
      <div style={{ marginTop: 'auto' }}>
        <PillLink href="/pricing">SEE THE TEAM PLAN →</PillLink>
      </div>
    </article>,
    <article
      key="next"
      style={{
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        height: '100%',
        boxSizing: 'border-box',
        border: '1px dashed #CFCFCA',
        borderRadius: 18,
      }}
    >
      <span className="tile tile-lg" style={{ background: '#EDEDE9', color: '#5E5E5B' }} aria-hidden="true">
        +
      </span>
      <h3 className="h3">Your next hire</h3>
      <p className="body">More roles are on the way. Tell us which job you&apos;d hand over next.</p>
      <div style={{ marginTop: 'auto' }}>
        <PillLink href="/early-access">TELL US →</PillLink>
      </div>
    </article>,
  ];

  return (
    <>
      {/* Hero with live background */}
      <section aria-labelledby="hero-title" className="page-hero" style={{ paddingBottom: 72 }}>
        <div className="live-bg" aria-hidden="true">
          <div className="live-grid" />
          <SignalLines />
        </div>

        <FloatCard className="bob" style={{ left: '6%', top: 120 }}>
          <StaffTile who="social" />
          <span className="float-text">
            <span style={{ fontSize: 13, fontWeight: 500 }}>LinkedIn post drafted</span>
            <span style={{ fontSize: 12, color: '#5E5E5B' }}>Waiting for you · 09:12</span>
          </span>
        </FloatCard>
        <FloatCard className="bob-2" style={{ left: '3%', top: 300 }}>
          <StaffTile who="sales" />
          <span className="float-text">
            <span style={{ fontSize: 13, fontWeight: 500 }}>First email to Dana Okafor</span>
            <span style={{ fontSize: 12, color: '#17643F' }}>Approved with one edit</span>
          </span>
        </FloatCard>
        <FloatCard className="bob-3" style={{ right: '6%', top: 140 }}>
          <StaffTile who="sales" />
          <span className="float-text">
            <span style={{ fontSize: 13, fontWeight: 500 }}>Call · 2 min 14 s</span>
            <span style={{ fontSize: 12, color: '#8A4B05' }}>Handed to you: volume pricing</span>
          </span>
        </FloatCard>
        <FloatCard className="bob" tone="dark" style={{ right: '3%', top: 320 }}>
          <span className="tile" style={{ background: '#2A2A28', color: '#BFE3CF' }}>
            SL
          </span>
          <span className="float-text">
            <span style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}>Promoted after 20 approvals</span>
            <span style={{ fontSize: 12, color: '#C9C9C4' }}>Now sends first emails on its own</span>
          </span>
        </FloatCard>

        <div
          className="wrap"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 24,
          }}
        >
          <span className="cta-note enter">
            <span className="live-dot" />
            Early access is open · Social Media and Sales staff
          </span>
          <h1 id="hero-title" className="h1 enter" style={{ maxWidth: 760 }}>
            Staff that earn
            <br />
            <span className="muted-head">your trust.</span>
          </h1>
          <p className="lead enter-2" style={{ maxWidth: 560 }}>
            Hire AI staff for social media and sales. They start on probation, work only from facts you confirm, and act
            on their own once you promote them.
          </p>
          <div className="cta-row enter-2" style={{ marginTop: 4 }}>
            <Link href="/early-access" className="btn btn-dark btn-xl">
              Join early access <Arrow />
            </Link>
            <a href="#floor" className="btn btn-light btn-xl">
              Watch them work
            </a>
          </div>
          <p className="small" style={{ margin: 0 }}>
            Free 7-day trial at launch. No card needed.
          </p>
        </div>

        {/* Live staff floor */}
        <div id="floor" className="wrap" style={{ position: 'relative', zIndex: 2, marginTop: 72 }}>
          <div
            className="floor"
            role="img"
            aria-label="Example workspace: Social Media Staff finds a lead, Sales Manager Staff drafts follow-ups, and four items wait in your approval inbox."
          >
            <div className="floor-bar" aria-hidden="true">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="live-dot" />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Northfield Studio · today</span>
                <span className="small hide-sm">example workspace</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }} className="hide-sm">
                <Badge tone="grey">2 staff</Badge>
                <Badge tone="wait">4 waiting for you</Badge>
              </div>
            </div>
            <div className="floor-body" aria-hidden="true">
              <div className="lanes">
                <div className="node">
                  <div className="node-head">
                    <StaffTile who="social" />
                    <span className="stack">
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Social Media Staff</span>
                      <span style={{ fontSize: 12, color: '#17643F' }}>Working</span>
                    </span>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: '#5E5E5B' }}>
                    PLANNING THIS WEEK
                  </span>
                  <div className="meter">
                    <span />
                  </div>
                  <span className="small">3 of 5 posts drafted · 1 video script</span>
                </div>
                <div className="wire" />
                <div className="node">
                  <div className="node-head">
                    <Badge tone="ok">Lead found</Badge>
                  </div>
                  <span style={{ fontSize: 13, lineHeight: 1.5 }}>Instagram comment: “How much for 10 seats?”</span>
                  <span className="small">Passed to Sales with the exact question.</span>
                </div>
                <div className="wire w2" />
                <div className="node">
                  <div className="node-head">
                    <StaffTile who="sales" />
                    <span className="stack">
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Sales Manager Staff</span>
                      <span style={{ fontSize: 12, color: '#17643F' }}>Drafting</span>
                    </span>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: '#5E5E5B' }}>
                    12 FOLLOW-UPS FROM TUESDAY
                  </span>
                  <div className="meter meter-amber">
                    <span />
                  </div>
                  <span className="small typing">Hi Dana, thanks for joining on Tuesday</span>
                </div>
                <div className="wire w3" />
                <div className="node" style={{ borderColor: '#111111' }}>
                  <div className="node-head">
                    <StaffTile who="you" />
                    <span className="stack">
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Your approval inbox</span>
                      <span style={{ fontSize: 12, color: '#8A4B05' }}>4 waiting</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="btn btn-dark btn-sm" style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }}>
                      Approve
                    </span>
                    <span className="btn btn-light btn-sm" style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }}>
                      Edit
                    </span>
                  </div>
                  <span className="badge b-ink" style={{ alignSelf: 'flex-start' }}>
                    Promotion available
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <p className="strip">
          <span>Posts to Facebook, Instagram, LinkedIn and X</span>
          <span aria-hidden="true" className="hide-sm">
            ·
          </span>
          <span>Emails from your own mailbox</span>
          <span aria-hidden="true" className="hide-sm">
            ·
          </span>
          <span>Answers your phone line</span>
        </p>
      </div>

      {/* Staff slider */}
      <section aria-labelledby="staff-title" className="section">
        <div className="wrap stack" style={{ gap: 40 }}>
          <div className="stack" style={{ gap: 14, maxWidth: 600 }}>
            <Eyebrow>01 · THE STAFF</Eyebrow>
            <h2 id="staff-title" className="h2">
              Meet your staff.
            </h2>
            <p className="lead">
              Clear job descriptions: what each one does, what it never does, and what it hands to you.
            </p>
          </div>
          <Carousel label="Staff roles" slides={slides} positions={3} />
        </div>
      </section>

      {/* How it works teaser */}
      <section aria-labelledby="how-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap stack" style={{ gap: 44 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            <div className="stack" style={{ gap: 14, maxWidth: 620 }}>
              <Eyebrow>02 · HOW IT WORKS</Eyebrow>
              <h2 id="how-title" className="h2">
                Brief once. Hire. Approve. Promote.
              </h2>
            </div>
            <PillLink href="/how-it-works">SEE THE FULL WORKFLOW →</PillLink>
          </div>
          <ol className="grid4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {STEPS.map(([title, text], i) => (
              <li
                key={title}
                className="card"
                style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <span className="mono" style={{ fontSize: 12, color: '#1E7A52' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="h3" style={{ fontSize: 19 }}>
                  {title}
                </h3>
                <p className="body" style={{ fontSize: 14 }}>
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Week of work marquee */}
      <section aria-labelledby="week-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap stack" style={{ gap: 14, marginBottom: 40 }}>
          <Eyebrow>03 · A WEEK OF WORK</Eyebrow>
          <h2 id="week-title" className="h2">
            Work that shows its working.
          </h2>
          <p className="lead" style={{ maxWidth: 560 }}>
            Every action has a source, a status and a person who approved it. An example week:
          </p>
        </div>
        <div className="marquee">
          {/* The list is drawn twice so the loop is seamless; the copy is hidden from screen readers. */}
          <div className="marquee-track">
            {[0, 1].map((copy) =>
              WORK.map(([who, tone, status, title, meta]) => (
                <div key={`${copy}-${title}`} className="work-card" aria-hidden={copy === 1 ? true : undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <StaffTile who={who} />
                    <Badge tone={tone}>{status}</Badge>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{title}</span>
                  <span className="mono" style={{ fontSize: 11, color: '#5E5E5B' }}>
                    {meta}
                  </span>
                </div>
              )),
            )}
          </div>
        </div>
      </section>

      {/* Safety teaser */}
      <section aria-labelledby="safety-title" className="dark section">
        <div className="wrap stack" style={{ gap: 48 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            <div className="stack" style={{ gap: 14, maxWidth: 640 }}>
              <Eyebrow>04 · SAFETY</Eyebrow>
              <h2 id="safety-title" className="h2">
                What always comes to you.
              </h2>
              <p className="lead">Built into the product, not buried in settings. Promoted or not.</p>
            </div>
            <PillLink href="/safety" dark>
              READ THE SAFETY RULES →
            </PillLink>
          </div>
          <div className="safety-grid">
            {[
              ['Facts only', 'Prices and claims come only from your confirmed company record.'],
              [
                'Your reputation stays yours',
                'Your own mailbox, slow daily limits, and opt-outs that stop contact instantly.',
              ],
              [
                'A person on every hard call',
                'Discounts, contracts and complaints always come to you, live on the phone.',
              ],
            ].map(([title, text], i) => (
              <div key={title} className="safety-item">
                <span className="mono" style={{ fontSize: 12, color: '#BFE3CF' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="h3" style={{ fontSize: 18 }}>
                  {title}
                </h3>
                <p className="small" style={{ margin: 0 }}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section aria-labelledby="pricing-title" className="section">
        <div className="wrap">
          <div
            className="card"
            style={{ padding: 48, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 32 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 24,
                flexWrap: 'wrap',
              }}
            >
              <div className="stack" style={{ gap: 14, maxWidth: 560 }}>
                <Eyebrow>05 · PRICING</Eyebrow>
                <h2 id="pricing-title" className="h2" style={{ fontSize: 38 }}>
                  Pay per staff member. Never more than your cap.
                </h2>
              </div>
              <Link href="/pricing" className="btn btn-light">
                Compare plans <Arrow />
              </Link>
            </div>
            <div className="grid3">
              {[
                ['Assistant', 'Drafts everything. You approve everything.', false],
                ['Manager', 'Earns the right to act on its own.', true],
                ['Team', 'Both roles at Manager level, one cap.', false],
              ].map(([name, text, featured]) => (
                <div
                  key={name as string}
                  className="stack"
                  style={{ gap: 6, borderTop: featured ? '2px solid #111111' : '1px solid #EDEDE9', paddingTop: 18 }}
                >
                  <span style={{ fontSize: 17, fontWeight: 500 }}>{name}</span>
                  <span className="small">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Hire your first staff member."
        sub="Start on probation. Promote when you're ready. No card needed."
      />
      <Dock />
    </>
  );
}
