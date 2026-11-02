import type { Metadata } from 'next';
import Link from 'next/link';
import { CtaBand, Dock } from '@/components/marketing/calls-to-action';
import { PlanPicker } from '@/components/marketing/interactive';
import { Arrow, Eyebrow, LiveGrid } from '@/components/marketing/primitives';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Pay per staff member, never more than the cap you set. Assistant, Manager and Team plans; prices are announced at launch and early access members hear first.',
  alternates: { canonical: '/pricing' },
};

const PLANS = [
  {
    name: 'Assistant',
    line: 'Drafts everything. You approve everything.',
    per: 'per staff member, per month',
    featured: false,
  },
  { name: 'Manager', line: 'Earns the right to act on its own.', per: 'per staff member, per month', featured: true },
  { name: 'Team', line: 'Both roles at Manager level.', per: 'for both staff, per month', featured: false },
] as const;

/** Cells marked `muted` are the lesser option, shown in the small grey style as on the canvas. */
const INCLUDED: [string, ...{ text: string; muted?: boolean }[]][] = [
  ['Approval inbox and weekly report', { text: 'Yes' }, { text: 'Yes' }, { text: 'Yes' }],
  ['Promotion to act on its own', { text: 'No', muted: true }, { text: 'Yes' }, { text: 'Yes' }],
  ['Video (Social)', { text: 'Template videos', muted: true }, { text: 'All styles' }, { text: 'All styles' }],
  [
    'Phone line (Sales)',
    { text: 'Answers calls', muted: true },
    { text: 'Plus callbacks people asked for' },
    { text: 'Plus callbacks people asked for' },
  ],
  ['Phone number', { text: '1 per Sales seat' }, { text: '1 per Sales seat' }, { text: '1 included' }],
  ['Spending cap you set', { text: 'Yes' }, { text: 'Yes' }, { text: 'One cap for both' }],
];

const FAQ = [
  [
    'Will it send anything without me?',
    "Not while it's on probation. Every email, post and reply waits in your inbox. A task only acts on its own after you promote it, and you can take that back at any time.",
  ],
  [
    'What happens when I hit my cap?',
    'Your staff pause and we ask whether to top up, upgrade or wait for next month. A call in progress finishes politely first.',
  ],
  [
    'Whose domain does it email from?',
    "Yours. We check your mailbox's sending records first, then send within daily limits that start low and ramp up slowly.",
  ],
  [
    'Does it pretend to be human?',
    "No. On the phone it says it's an AI before anything else. In writing you choose: sign as a named person on your team who agrees to it, or use a name labelled as AI.",
  ],
  [
    'Can I change plans later?',
    'Yes. Upgrades start straight away; downgrades and cancellations take effect at the end of the month, and your data is kept for 30 days after.',
  ],
  [
    'When can I start?',
    "We're opening in small groups. Join early access and we'll email you when your invite is ready.",
  ],
] as const;

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-hero" className="page-hero" style={{ paddingBottom: 56 }}>
        <LiveGrid />
        <div className="wrap center-head enter" style={{ position: 'relative', zIndex: 2 }}>
          <Eyebrow>Pricing</Eyebrow>
          <h1 id="pricing-hero" className="h1-sm">
            Pay per staff member. <span className="muted-head">Never more than your cap.</span>
          </h1>
          <p className="lead">
            A monthly salary for each role, with work included. Prices are announced at launch; early access members
            hear first.
          </p>
        </div>
      </section>

      <section aria-labelledby="picker-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div
            className="card"
            style={{ padding: 36, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 28 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <h2 id="picker-title" className="h3" style={{ fontSize: 26 }}>
                Which plan fits you?
              </h2>
              <span className="small">Pick what you need. We&apos;ll point you to the plan.</span>
            </div>
            <PlanPicker />
          </div>
        </div>
      </section>

      <section aria-labelledby="plans-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap stack" style={{ gap: 32 }}>
          <h2 id="plans-title" className="eyebrow">
            The plans
          </h2>
          <div className="grid3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className="card"
                style={{
                  padding: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                  ...(plan.featured ? { outline: '1.5px solid var(--ink)', outlineOffset: -1.5 } : {}),
                }}
              >
                {plan.featured ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <h3 className="h3">{plan.name}</h3>
                      <span className="badge b-ink">Most room to grow</span>
                    </div>
                    <span className="small" style={{ marginTop: -12 }}>
                      {plan.line}
                    </span>
                  </>
                ) : (
                  <div className="stack" style={{ gap: 6 }}>
                    <h3 className="h3">{plan.name}</h3>
                    <span className="small">{plan.line}</span>
                  </div>
                )}
                <span style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--muted-head)' }}>
                  Price at launch
                </span>
                <span className="small">{plan.per}</span>
                <Link
                  href="/early-access"
                  className={`btn ${plan.featured ? 'btn-dark' : 'btn-light'}`}
                  aria-label={`Join early access for the ${plan.name} plan`}
                >
                  Join early access
                  {plan.featured ? (
                    <>
                      {' '}
                      <Arrow />
                    </>
                  ) : null}
                </Link>
              </article>
            ))}
          </div>

          <div className="card" style={{ padding: '8px 28px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption className="sr-only">What each plan includes</caption>
              <thead>
                <tr className="plan-row mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  <th scope="col">WHAT&apos;S INCLUDED</th>
                  <th scope="col">ASSISTANT</th>
                  <th scope="col">MANAGER</th>
                  <th scope="col">TEAM</th>
                </tr>
              </thead>
              <tbody>
                {INCLUDED.map(([feature, ...cells], i) => (
                  <tr
                    key={feature}
                    className="plan-row"
                    style={i === INCLUDED.length - 1 ? { borderBottom: 0 } : undefined}
                  >
                    <th scope="row">{feature}</th>
                    {cells.map((cell, j) => (
                      <td key={j} className={cell.muted ? 'small' : undefined}>
                        {cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '10px 28px',
              fontSize: 13,
              color: 'var(--muted)',
            }}
          >
            <span>7-day trial, no card</span>
            <span aria-hidden="true" className="hide-sm">
              ·
            </span>
            <span>Extra work bought upfront, never billed after</span>
            <span aria-hidden="true" className="hide-sm">
              ·
            </span>
            <span>Cancel any time</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap stack" style={{ gap: 40, maxWidth: 920 }}>
          <div className="stack" style={{ gap: 16 }}>
            <Eyebrow>Questions</Eyebrow>
            <h2 id="faq-title" className="h2">
              Questions owners ask first.
            </h2>
          </div>
          <div className="faq">
            {FAQ.map(([question, answer], i) => (
              <details key={question} open={i === 0}>
                <summary>
                  {question}
                  <span aria-hidden="true" className="mono" style={{ fontSize: 18, color: 'var(--muted)' }}>
                    +
                  </span>
                </summary>
                <p className="answer">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Hear our prices first."
        sub="Early access members get prices before anyone else, and a 7-day trial with no card."
      />
      <Dock />
    </>
  );
}
