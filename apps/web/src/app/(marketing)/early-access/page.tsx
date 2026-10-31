import type { Metadata } from 'next';
import { EarlyAccessForm } from '@/components/marketing/early-access-form';
import { LiveGrid } from '@/components/marketing/primitives';

export const metadata: Metadata = {
  title: 'Join early access',
  description:
    "Join the early access list for AI as a Staff. We open in small groups, and you'll hear our prices before anyone else.",
  alternates: { canonical: '/early-access' },
};

const ROLES = ['social', 'sales', 'both'] as const;
type Role = (typeof ROLES)[number];

/** The role pages link here with ?role=…; anything else falls back to "both". */
function toRole(value: string | string[] | undefined): Role {
  return ROLES.find((role) => role === value) ?? 'both';
}

const STEPS = [
  ['You join the list', 'We only email you about your invite and the launch.'],
  ['Your invite arrives', 'With launch prices and a 7-day trial. No card.'],
  ['First drafts, same sitting', 'Enter your website, confirm the facts, hire, approve.'],
] as const;

export default async function EarlyAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { role } = await searchParams;
  return (
    <section aria-labelledby="ea-title" className="page-hero" style={{ paddingTop: 96 }}>
      <LiveGrid />
      <div className="wrap split" style={{ position: 'relative', zIndex: 2, alignItems: 'start' }}>
        <div className="stack enter" style={{ gap: 22 }}>
          <span className="cta-note" style={{ alignSelf: 'flex-start' }}>
            <span className="live-dot" />
            Early access is open
          </span>
          <h1 id="ea-title" className="h1-sm">
            Hire your first <span className="muted-head">staff member.</span>
          </h1>
          <p className="lead">
            Tell us where to send your invite. We open in small groups, and you&apos;ll hear our prices before anyone
            else.
          </p>
          <ol className="list" style={{ gap: 18, marginTop: 12 }}>
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <span className="tile tile-sm" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 500 }}>{title}</span>
                  <span className="small">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card enter-2" style={{ padding: 36 }}>
          <EarlyAccessForm role={toRole(role)} />
        </div>
      </div>
    </section>
  );
}
