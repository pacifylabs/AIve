import type { MeResponse } from '@ai-staff/contracts';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connectNetworkAction } from '@/app/actions/social';
import { ConnectLoginForm, type LoginField } from '@/app/app/accounts/login-form';
import { AddFactForm, type Profile, WebsiteReader } from '@/app/app/company/company-forms';
import { HireForm, type MailboxOption } from '@/app/app/hire/hire-form';
import { type AccountOption, SocialHireForm } from '@/app/app/hire/social-hire-form';
import { ConnectMailboxForm } from '@/app/app/mailboxes/mailbox-forms';
import { CreateWorkspaceForm } from '@/app/app/workspace-forms';
import { type Fact, FactsList } from '@/components/app/facts-list';
import { Icon } from '@/components/app/icons';
import { StaffAvatar } from '@/components/app/staff-avatar';
import { apiOrRedirect } from '@/lib/api';
import { readSession } from '@/lib/session';
import { NETWORK_LABEL, ROLE_CARD, ROLE_LABEL } from '@/lib/staff';
import { type OnboardingStep, STEP_LABELS, nextStep } from '@/lib/onboarding';

export const metadata = { title: 'Set up' };

interface Role {
  key: string;
  name: string;
  summary: string;
  interview: { key: string; question: string }[];
}
interface Network {
  network: string;
  label: string;
  configured: boolean;
  auth: 'oauth' | 'credentials';
  fields: LoginField[];
}

const ROLES = ['social_media', 'sales_manager'] as const;
type RoleKey = (typeof ROLES)[number];

/**
 * The guided path from sign-up to a first hire at work: welcome, choose a hire, business info, connect, the brief.
 * Each step reuses the real forms, so nothing done here has to be done again elsewhere. `step` and `role` live in the
 * address, so the page can be left and picked up; without them the first unfinished step opens.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; role?: string }>;
}) {
  const query = await searchParams;
  const me = await apiOrRedirect<MeResponse>('/me', '/app/welcome');
  if (!me.ok) return <p className="text-danger">{me.problem.title}</p>;
  const first = me.data.name.trim().split(/\s+/)[0] ?? '';

  if (me.data.workspaces.length === 0) {
    return (
      <Frame step="start" role={null}>
        <div className="max-w-3xl space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted">Welcome{first ? `, ${first}` : ''}</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Hire AI staff who earn your trust, one approval at a time.
            </h1>
            <p className="text-lg text-muted">
              Your staff write posts and sales emails for your business. Here is how it goes.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              [
                'Brief them once',
                'We read your website. You confirm what is true. They never invent prices or offers.',
              ],
              ['They start on probation', 'Every post and email waits for your yes. Nothing goes out without you.'],
              [
                'Promote when ready',
                'A clean record lets them act alone, task by task. Money and complaints always come to you.',
              ],
            ].map(([title, text], index) => (
              <li key={title} className="card space-y-2 p-5">
                <span className="font-mono text-xs text-accent">0{index + 1}</span>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
          <div className="card max-w-md p-6">
            <CreateWorkspaceForm />
          </div>
        </div>
      </Frame>
    );
  }

  const { workspaceId } = await readSession();
  const workspace = me.data.workspaces.find((candidate) => candidate.id === workspaceId) ?? me.data.workspaces[0]!;
  const opts = { workspace: true } as const;
  const [roles, company, accounts, networks, mailboxes, staff] = await Promise.all([
    apiOrRedirect<Role[]>('/roles', '/app/welcome', opts),
    apiOrRedirect<{ profile: Profile; facts: Fact[] }>('/company', '/app/welcome', opts),
    apiOrRedirect<AccountOption[]>('/social/accounts', '/app/welcome', opts),
    apiOrRedirect<Network[]>('/social/networks', '/app/welcome', opts),
    apiOrRedirect<MailboxOption[]>('/mailboxes', '/app/welcome', opts),
    apiOrRedirect<{ id: string; roleKey: string; state: string }[]>('/staff', '/app/welcome', opts),
  ]);
  const role: RoleKey | null = ROLES.find((key) => key === query.role) ?? null;
  const facts = company.ok ? company.data.facts : [];
  const state = {
    role,
    confirmedFacts: facts.filter((fact) => fact.confirmedAt).length,
    socialAccounts: accounts.ok ? accounts.data.length : 0,
    mailboxes: mailboxes.ok ? mailboxes.data.length : 0,
    hired: staff.ok ? staff.data.filter((member) => member.state !== 'archived').map((member) => member.roleKey) : [],
  };
  const requested = STEP_LABELS.some(([key]) => key === query.step) ? (query.step as OnboardingStep) : null;
  const step = requested ?? nextStep(state);
  // Every step after the choice needs a role; without one, start from the choice.
  if (step !== 'role' && step !== 'start' && !role) redirect('/app/welcome?step=role');
  const canEdit = workspace.role === 'owner' || workspace.role === 'admin';
  const link = (to: OnboardingStep) => `/app/welcome?step=${to}${role ? `&role=${role}` : ''}`;
  const roleInfo = roles.ok ? roles.data.find((candidate) => candidate.key === role) : undefined;
  const questions = Object.fromEntries((roleInfo?.interview ?? []).map((item) => [item.key, item.question]));

  return (
    <Frame step={step} role={role}>
      {step === 'role' || step === 'start' ? (
        <div className="max-w-4xl space-y-6">
          <Heading
            eyebrow="Choose a hire"
            title="Who do you want to hire first?"
            text="You can hire the other one later. Your business info carries over, so it takes a couple of minutes."
          />
          <ul className="grid gap-4 md:grid-cols-2">
            {ROLES.map((key) => {
              const card = ROLE_CARD[key]!;
              const already = state.hired.includes(key);
              return (
                <li key={key}>
                  <Link
                    href={`/app/welcome?step=business&role=${key}`}
                    className="card flex h-full flex-col gap-4 p-6 transition-colors hover:border-line-strong"
                  >
                    <span className="flex items-center gap-3">
                      <StaffAvatar name={ROLE_LABEL[key]!} roleKey={key} />
                      <span>
                        <span className="block text-lg font-semibold">{ROLE_LABEL[key]}</span>
                        <span className="block text-sm text-muted">{card.tagline}</span>
                      </span>
                    </span>
                    <RoleLine label="Does" tone="text-ok" text={card.does} />
                    <RoleLine label="Never" tone="text-danger" text={card.never} />
                    <RoleLine label="Needs" tone="text-muted" text={card.needs} />
                    <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-accent">
                      {already ? 'Hire another' : `Hire ${ROLE_LABEL[key]}`} <Icon name="arrow" size={15} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {step === 'business' ? (
        <div className="max-w-4xl space-y-6">
          <Heading
            eyebrow="Your business"
            title={`What should your staff know about ${workspace.name}?`}
            text="Read your website and confirm what is true. Staff only use what you confirm, so they never make up prices or offers."
          />
          {company.ok && canEdit ? (
            <div className="card p-6">
              <WebsiteReader profile={company.data.profile} />
            </div>
          ) : null}
          {facts.length ? <FactsList facts={facts} canEdit={canEdit} /> : null}
          {canEdit ? (
            <details className="card p-6">
              <summary className="cursor-pointer font-medium">
                No website, or something missing? Add a fact yourself
              </summary>
              <div className="mt-4 max-w-xl">
                <AddFactForm />
              </div>
            </details>
          ) : null}
          <Continue
            ready={state.confirmedFacts > 0}
            href={link('connect')}
            label="Continue"
            waiting="Confirm at least one fact to continue."
            skip={{ href: link('connect'), label: 'Skip for now' }}
          />
        </div>
      ) : null}

      {step === 'connect' ? (
        <div className="max-w-3xl space-y-6">
          {role === 'sales_manager' ? (
            <>
              <Heading
                eyebrow="Connect"
                title="Which mailbox should your Sales Manager write from?"
                text="Your own address, so replies come to you and your reputation stays yours. We check its records and send you a test first."
              />
              {state.mailboxes > 0 ? (
                <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">
                  <Icon name="check" size={16} /> Mailbox connected.
                </p>
              ) : (
                <div className="card p-6">
                  <ConnectMailboxForm />
                </div>
              )}
              <Continue
                ready={state.mailboxes > 0}
                href={link('brief')}
                label="Continue to the brief"
                waiting="Connect a mailbox to continue."
              />
            </>
          ) : (
            <>
              <Heading
                eyebrow="Connect"
                title="Where should your Social Media Staff post?"
                text="Connect at least one account. You sign in at the network; we never see your password."
              />
              {accounts.ok && accounts.data.length ? (
                <ul className="card divide-y divide-line-soft">
                  {accounts.data.map((account) => (
                    <li key={account.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                      <span>
                        {NETWORK_LABEL[account.network] ?? account.network} · {account.name}
                      </span>
                      <span className="pill pill-ok">Connected</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="space-y-3">
                {(networks.ok ? networks.data : [])
                  .filter((network) => network.configured)
                  .map((network) => (
                    <li key={network.network} className="card p-5">
                      {network.auth === 'oauth' ? (
                        <form action={connectNetworkAction} className="flex items-center justify-between gap-3">
                          <input type="hidden" name="network" value={network.network} />
                          <span className="font-medium">{network.label}</span>
                          <button type="submit" className="btn btn-sm">
                            Connect
                          </button>
                        </form>
                      ) : (
                        <details>
                          <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
                            {network.label}
                            <span className="btn btn-sm">Connect</span>
                          </summary>
                          <div className="mt-4">
                            <ConnectLoginForm network={network.network} fields={network.fields} />
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
              </ul>
              <p className="text-sm text-muted">
                Networks not listed here are not switched on for this workspace yet. After signing in at a network you
                land on Connections; a link there brings you back to this step.
              </p>
              <Continue
                ready={state.socialAccounts > 0}
                href={link('brief')}
                label="Continue to the brief"
                waiting="Connect an account to continue: your staff member needs somewhere to post."
              />
            </>
          )}
        </div>
      ) : null}

      {step === 'brief' ? (
        <div className="max-w-3xl space-y-6">
          <Heading
            eyebrow="The brief"
            title={`Brief your new ${ROLE_LABEL[role ?? 'social_media']}`}
            text="A few questions. When you finish, they start on probation and get to work straight away."
          />
          <div className="card p-6">
            {role === 'sales_manager' ? (
              <HireForm mailboxes={mailboxes.ok ? mailboxes.data : []} questions={questions} />
            ) : (
              <SocialHireForm accounts={accounts.ok ? accounts.data : []} questions={questions} />
            )}
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

/** The page frame: the steps on the left (a strip on a phone), the step itself on the right. */
function Frame({ step, role, children }: { step: OnboardingStep; role: string | null; children: React.ReactNode }) {
  const index = STEP_LABELS.findIndex(([key]) => key === step);
  return (
    <div className="mx-auto grid max-w-6xl gap-8 pt-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12 lg:pt-10">
      <nav aria-label="Setup steps" className="lg:sticky lg:top-10 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {STEP_LABELS.map(([key, label], position) => {
            const done = position < index;
            const current = position === index;
            const reachable = done && (key === 'role' || role);
            const body = (
              <>
                <span
                  className={`grid size-6 flex-none place-items-center rounded-full text-xs font-semibold ${
                    done ? 'bg-ok-soft text-ok' : current ? 'bg-accent text-accent-foreground' : 'bg-subtle text-muted'
                  }`}
                >
                  {done ? <Icon name="check" size={12} /> : position + 1}
                </span>
                <span className={`whitespace-nowrap ${current ? 'font-semibold' : 'text-muted'}`}>{label}</span>
              </>
            );
            return (
              <li key={key} aria-current={current ? 'step' : undefined}>
                {reachable ? (
                  <Link
                    href={`/app/welcome?step=${key}${role ? `&role=${role}` : ''}`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-subtle"
                  >
                    {body}
                  </Link>
                ) : (
                  <span
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${current ? 'bg-subtle' : ''}`}
                  >
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-6 hidden text-xs leading-relaxed text-muted lg:block">
          Leave at any point. Everything you have done is saved, and this page opens at the step you reached.
        </p>
      </nav>
      <div className="min-w-0 pb-16">{children}</div>
    </div>
  );
}

function Heading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{eyebrow}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="text-muted">{text}</p>
    </div>
  );
}

function RoleLine({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <span className="block space-y-1 text-sm">
      <span className={`block text-xs font-medium ${tone}`}>{label}</span>
      <span className="block text-text-2">{text}</span>
    </span>
  );
}

/** The step's way on: a button once the step is done, a plain note of what is missing before then. */
function Continue({
  ready,
  href,
  label,
  waiting,
  skip,
}: {
  ready: boolean;
  href: string;
  label: string;
  waiting: string;
  skip?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
      {ready ? (
        <Link href={href} className="btn btn-primary">
          {label} <Icon name="arrow" size={15} />
        </Link>
      ) : (
        <p className="text-sm text-muted">{waiting}</p>
      )}
      {skip && !ready ? (
        <Link href={skip.href} className="btn btn-quiet">
          {skip.label}
        </Link>
      ) : null}
    </div>
  );
}
