import type { Metadata } from 'next';
import { CtaBand, Dock } from '@/components/marketing/calls-to-action';
import { CapabilityTabs } from '@/components/marketing/interactive';
import { Badge, Eyebrow, StaffTile } from '@/components/marketing/primitives';
import {
  AutonomySection,
  CapabilityPanel,
  NumberedQuestions,
  RoleHero,
  StatusList,
} from '@/components/marketing/role-parts';

export const metadata: Metadata = {
  title: 'Sales Manager Staff',
  description:
    'An AI sales staff member that researches leads, writes from your own mailbox, sorts every reply and answers your sales line, handing money, contracts and complaints to you.',
  alternates: { canonical: '/staff/sales-manager' },
};

const REPLIES = [
  { text: '“Yes, Thursday works.”', tone: 'wait', status: 'Reply drafted' },
  { text: '“Out of office until the 4th.”', tone: 'grey', status: 'Waiting' },
  { text: '“Please take me off your list.”', tone: 'ink', status: 'Stopped for good' },
  { text: '“Any discount for a year upfront?”', tone: 'wait', status: 'Handed to you' },
] as const;

export default function SalesManagerStaffPage() {
  return (
    <>
      <RoleHero
        who="sales"
        roleName="Sales Manager Staff"
        titleStart="Follows up properly."
        titleEnd="Hands over when it matters."
        lead="It reads each lead's website, writes from your own mailbox, sorts every reply and answers your sales line. Money, contracts and complaints always come to you."
        primaryLabel="Hire Sales Manager Staff"
        secondary={{ href: '/safety', label: 'How it protects you' }}
        aside={<StatusList heading="REPLIES SORTED THIS MORNING · EXAMPLE" live="Live" rows={[...REPLIES]} />}
      />

      <section aria-labelledby="sales-caps" className="section" style={{ paddingTop: 48 }}>
        <div className="wrap stack" style={{ gap: 40 }}>
          <div className="center-head">
            <Eyebrow>WHAT IT DOES</Eyebrow>
            <h2 id="sales-caps" className="h2">
              The follow-up you never have time for.
            </h2>
          </div>
          <CapabilityTabs
            label="Capabilities"
            tabs={[
              {
                key: 'research',
                label: 'Research',
                panel: (
                  <CapabilityPanel
                    title="Reads before it writes"
                    text="For every lead you import or that Social passes over, it reads the company's own website and keeps dated, quoted notes. First emails mention something true about them."
                  >
                    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <span className="eyebrow" style={{ fontSize: 11 }}>
                        RESEARCH · NORTHFIELD STUDIO
                      </span>
                      <span style={{ fontSize: 14, lineHeight: 1.55 }}>
                        “We onboard 30+ new clients every quarter.”
                      </span>
                      <span className="mono small">northfield.studio/about · read 09:02</span>
                    </div>
                  </CapabilityPanel>
                ),
              },
              {
                key: 'email',
                label: 'Emails',
                panel: (
                  <CapabilityPanel
                    title="From your mailbox, never a shared one"
                    text="We check your domain's sending records and send a test first. Daily limits start low and ramp up over three weeks. Every email carries a plain way to stop hearing from you."
                  >
                    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                        <span>SPF · DKIM · DMARC</span>
                        <Badge tone="ok">All found</Badge>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                        <span>Test email</span>
                        <Badge tone="ok">Delivered</Badge>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                        <span>New contacts today</span>
                        <span className="mono small">10 of 10 · ramping</span>
                      </div>
                      <div className="meter" aria-hidden="true">
                        <span />
                      </div>
                    </div>
                  </CapabilityPanel>
                ),
              },
              {
                key: 'replies',
                label: 'Replies',
                panel: (
                  <CapabilityPanel
                    title="Every reply, sorted"
                    text="Interested, a question, an objection, out of office, an opt-out or a bounce. It answers what your facts cover, stops on the first “no”, and hands the rest to you with a one-line reason."
                  >
                    <div
                      className="card"
                      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}
                    >
                      <span>
                        <b style={{ fontWeight: 500 }}>Reply:</b> “Is there a free trial?”
                      </span>
                      <span className="small">Classified: question · fact found: 15-minute intro call</span>
                      <span className="badge b-wait" style={{ alignSelf: 'flex-start' }}>
                        Draft answer waiting for you
                      </span>
                    </div>
                  </CapabilityPanel>
                ),
              },
              {
                key: 'phone',
                label: 'Phone line',
                panel: (
                  <CapabilityPanel
                    title="Your sales line, answered"
                    text="Its own number in the US, Canada or UK, or your existing line forwarded. It says it's an AI, answers from your facts, sends booking links, and puts callers through to you with a whispered summary."
                  >
                    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
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
                        <span className="stack" style={{ flexGrow: 1 }}>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>+1 (415) 555-0118</span>
                          <span className="mono" style={{ fontSize: 11, color: '#5E5E5B' }}>
                            ANSWERS 9:00 TO 18:00
                          </span>
                        </span>
                        <Badge tone="wait">Transferring to you</Badge>
                      </div>
                      <div style={{ padding: '16px 18px', fontSize: 14, lineHeight: 1.55, color: '#2E2E2C' }}>
                        “That&apos;s one for the team. I&apos;m connecting you now, one moment.”
                      </div>
                    </div>
                  </CapabilityPanel>
                ),
              },
            ]}
          />
        </div>
      </section>

      <AutonomySection
        intro="Promotion needs a clean record: approvals with light edits, no complaints, low bounces. One complaint puts that task back on probation."
        rows={[
          { task: 'Lead research', starts: 'Runs', alone: { text: 'Yes, from day one' } },
          { task: 'First emails and follow-ups', starts: 'Draft', alone: { text: 'After 25 approvals', tone: 'ok' } },
          { task: 'Answering questions', starts: 'Draft', alone: { text: 'After 15 approvals', tone: 'ok' } },
          {
            task: 'Callbacks to people who asked',
            starts: 'You approve each',
            alone: { text: 'After 20 calls', tone: 'ok' },
          },
          { task: 'Objections, discounts, contracts', starts: 'Handed to you', alone: { text: 'Never', tone: 'ink' } },
          { task: 'Cold calls', starts: 'Not possible', alone: { text: 'Never', tone: 'ink' } },
        ]}
      />

      <section aria-labelledby="sales-hire" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap grid2" style={{ alignItems: 'stretch' }}>
          <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Eyebrow>YOU BRING THE LEADS</Eyebrow>
            <h2 id="sales-hire" className="h3" style={{ fontSize: 26 }}>
              Import a list, add leads by hand, or let Social Media Staff pass them on.
            </h2>
            <p className="body">
              We don&apos;t sell lists or scrape contacts. You decide who it may write to, and you&apos;re responsible
              for having a lawful reason to.
            </p>
          </div>
          <NumberedQuestions
            heading="HIRING TAKES FIVE QUESTIONS"
            questions={[
              'Who is your ideal customer?',
              'What problem do you solve, in one sentence?',
              'What may it offer without asking you?',
              'What must always come to you?',
              'Where should interested people go?',
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Hire Sales Manager Staff."
        sub="Connect your mailbox, add five leads, and approve your first drafts the same day."
      />
      <Dock />
    </>
  );
}
