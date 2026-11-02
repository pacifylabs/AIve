import type { Metadata } from 'next';
import { CtaBand, Dock } from '@/components/marketing/calls-to-action';
import { CapabilityTabs } from '@/components/marketing/interactive';
import { Badge, Eyebrow } from '@/components/marketing/primitives';
import {
  AutonomySection,
  CapabilityPanel,
  NumberedQuestions,
  RoleHero,
  StatusList,
  WeekPlan,
} from '@/components/marketing/role-parts';

export const metadata: Metadata = {
  title: 'Social Media Staff',
  description:
    'An AI social media staff member that plans your week, writes for each network, makes short videos you watch before they post, and turns buying comments into leads.',
  alternates: { canonical: '/staff/social-media' },
};

const NETWORKS = ['Facebook Pages', 'Instagram', 'LinkedIn Pages', 'X'];

export default function SocialMediaStaffPage() {
  return (
    <>
      <RoleHero
        who="social"
        roleName="Social Media Staff"
        titleStart="Posts that sound like you."
        titleEnd="Videos you watch first."
        lead="It plans your week, writes for each network, makes short videos from your own products, and spots people ready to buy. Everything waits for you until it has earned more."
        primaryLabel="Hire Social Media Staff"
        secondary={{ href: '/pricing', label: 'See pricing' }}
        aside={
          <WeekPlan
            rows={[
              {
                day: 'Mon',
                network: 'LinkedIn',
                topic: 'Why onboarding stalls in week two',
                tone: 'ok',
                status: 'Approved',
              },
              {
                day: 'Tue',
                network: 'Facebook',
                topic: 'Client spotlight: a 3-day kickoff',
                tone: 'ok',
                status: 'Approved',
              },
              {
                day: 'Wed',
                network: 'Instagram',
                topic: 'Our kickoff checklist, in 30 seconds',
                tone: 'wait',
                status: 'Video',
              },
              {
                day: 'Fri',
                network: 'X',
                topic: '3 questions before hiring an agency',
                tone: 'grey',
                status: 'Drafting',
                typing: true,
              },
            ]}
          />
        }
      />

      <section aria-labelledby="caps-title" className="section" style={{ paddingTop: 48 }}>
        <div className="wrap stack" style={{ gap: 40 }}>
          <div className="center-head">
            <Eyebrow>What it does</Eyebrow>
            <h2 id="caps-title" className="h2">
              Four jobs, done the way you&apos;d do them.
            </h2>
          </div>
          <CapabilityTabs
            label="Capabilities"
            tabs={[
              {
                key: 'plan',
                label: 'Weekly plan',
                panel: (
                  <CapabilityPanel
                    title="A weekly plan from your offers"
                    text="Every Friday it proposes next week's posts: which network, which topic, which of your offers or campaigns. You approve the plan before a single post is written."
                  >
                    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <span className="eyebrow" style={{ fontSize: 11 }}>
                        Plan · next week
                      </span>
                      <span style={{ fontSize: 14 }}>5 posts · 1 video · 3 topics from your company record</span>
                      <div style={{ display: 'flex', gap: 8 }} aria-hidden="true">
                        <span className="btn btn-dark btn-sm">Approve plan</span>
                        <span className="btn btn-light btn-sm">Change</span>
                      </div>
                    </div>
                  </CapabilityPanel>
                ),
              },
              {
                key: 'posts',
                label: 'Posts',
                panel: (
                  <CapabilityPanel
                    title="Written for each network"
                    text="One idea, shaped for where it goes: the right length, the media each network needs, and only links to your own site."
                  >
                    <div className="stack" style={{ gap: 10 }}>
                      {[
                        ['LinkedIn · long form', '1,240 / 3,000'],
                        ['X · short', '268 / 280'],
                      ].map(([name, count]) => (
                        <div
                          key={name}
                          className="card"
                          style={{
                            padding: '16px 18px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{name}</span>
                          <span className="mono small">{count}</span>
                        </div>
                      ))}
                      <div
                        className="card"
                        style={{
                          padding: '16px 18px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: 14 }}>Instagram · needs an image</span>
                        <Badge tone="ok">From your library</Badge>
                      </div>
                    </div>
                  </CapabilityPanel>
                ),
              },
              {
                key: 'video',
                label: 'Video',
                panel: (
                  <CapabilityPanel
                    title="Short videos, always watched first"
                    text="Idea, then script, then a rendered video made from your own product photos. It can't be approved until someone watches it to the end, and it's labelled as AI-made when it posts."
                  >
                    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Badge tone="ok">Idea</Badge>
                        <Badge tone="ok">Script approved</Badge>
                        <Badge tone="ok">Rendered</Badge>
                        <Badge tone="wait">Watch to approve</Badge>
                        <Badge tone="grey">Publish</Badge>
                      </div>
                      <div
                        aria-hidden="true"
                        style={{
                          height: 160,
                          borderRadius: 12,
                          background: '#1B1B1A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: 'var(--surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#111111">
                            <path d="M8 5.5v13l11-6.5z" />
                          </svg>
                        </span>
                      </div>
                      <div className="meter" aria-hidden="true">
                        <span style={{ background: 'var(--band)' }} />
                      </div>
                      <span className="small">Watched 0:18 of 0:30. Finish to approve.</span>
                    </div>
                  </CapabilityPanel>
                ),
              },
              {
                key: 'comments',
                label: 'Comments',
                panel: (
                  <CapabilityPanel
                    title="Comments and messages, sorted"
                    text="It drafts replies within each network's reply window, and hands you anything sensitive. A comment from someone ready to buy becomes a lead for your Sales Manager Staff."
                  >
                    <StatusList
                      heading="TODAY'S COMMENTS"
                      rows={[
                        { text: '“Love this checklist!”', tone: 'grey', status: 'Reply drafted' },
                        { text: '“Do you work with schools?”', tone: 'grey', status: 'Reply drafted' },
                        { text: '“Still waiting on my refund.”', tone: 'wait', status: 'Handed to you' },
                        { text: '“How much for 10 seats?”', tone: 'ok', status: 'Lead for Sales' },
                      ]}
                    />
                  </CapabilityPanel>
                ),
              },
            ]}
          />
        </div>
      </section>

      <AutonomySection
        intro="Each kind of work starts on probation and has its own record. Some things never leave your hands."
        rows={[
          { task: 'Weekly plan', starts: 'Shown to you', alone: { text: 'Yes, from day one' } },
          { task: 'Publishing posts', starts: 'Draft', alone: { text: 'After 20 approvals', tone: 'ok' } },
          { task: 'Replies to comments and messages', starts: 'Draft', alone: { text: 'Not at launch', tone: 'grey' } },
          { task: 'Videos', starts: 'Draft', alone: { text: 'Never', tone: 'ink' } },
          { task: 'Complaints, refunds, legal', starts: 'Handed to you', alone: { text: 'Never', tone: 'ink' } },
        ]}
      />

      <section aria-labelledby="net-title" className="section" style={{ paddingTop: 0 }}>
        <div className="wrap grid2" style={{ gap: 24, alignItems: 'stretch' }}>
          <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Eyebrow>Where it posts</Eyebrow>
            <h2 id="net-title" className="h3" style={{ fontSize: 26 }}>
              Your accounts, connected in one click.
            </h2>
            <ul className="grid2" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
              {NETWORKS.map((network) => (
                <li key={network} className="badge b-grey" style={{ justifyContent: 'center', padding: 12 }}>
                  {network}
                </li>
              ))}
              {['TikTok', 'YouTube Shorts'].map((network) => (
                <li
                  key={network}
                  className="badge"
                  style={{
                    justifyContent: 'center',
                    padding: 12,
                    border: '1px dashed var(--line-dash)',
                    color: 'var(--muted)',
                  }}
                >
                  {network} · coming
                </li>
              ))}
            </ul>
            <span className="small">TikTok and YouTube Shorts join as each network approves us.</span>
          </div>
          <NumberedQuestions
            heading="HIRING TAKES FIVE QUESTIONS"
            questions={[
              'What should people do after seeing your posts?',
              'Which 3 to 5 topics do you want to be known for?',
              'Paste two or three posts you liked.',
              'Anything you never post about?',
              'How often, on which networks?',
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Hire Social Media Staff."
        sub="Your first week's plan arrives as soon as you've connected an account."
      />
      <Dock />
    </>
  );
}
