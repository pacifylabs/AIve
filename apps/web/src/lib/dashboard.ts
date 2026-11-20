/** The Dashboard's decisions, kept apart from its markup so they can be tested: what to warn about, what to set up next. */

export interface AccountHealth {
  id: string;
  name: string;
  health: 'ok' | 'degraded' | 'broken';
  healthReason: string | null;
}

export interface PostState {
  state: 'scheduled' | 'published' | 'failed' | 'cancelled';
  scheduledFor: string;
}

export interface Alert {
  id: string;
  tone: 'danger' | 'warn';
  text: string;
  href: string;
  cta: string;
}

/** What stops work now: accounts that cannot post or soon will not, and posts that failed. Each with its fix. */
export function alertsFor(accounts: AccountHealth[], posts: PostState[]): Alert[] {
  const alerts: Alert[] = [];
  for (const account of accounts) {
    if (account.health === 'ok') continue;
    const broken = account.health === 'broken';
    alerts.push({
      id: `account-${account.id}`,
      tone: broken ? 'danger' : 'warn',
      text: broken
        ? `${account.name} cannot post until it is reconnected.`
        : `${account.name}'s login runs out soon.${account.healthReason ? ` ${account.healthReason}` : ''}`,
      href: '/app/accounts',
      cta: broken ? 'Reconnect' : 'Renew',
    });
  }
  const failed = posts
    .filter((post) => post.state === 'failed')
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  if (failed.length) {
    alerts.push({
      id: 'posts-failed',
      tone: 'danger',
      text: `${failed.length} post${failed.length === 1 ? '' : 's'} this month did not go out.`,
      href: `/app/calendar#day-${failed[0]!.scheduledFor.slice(0, 10)}`,
      cta: 'See why',
    });
  }
  // Broken first: they stop posting today.
  return alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1));
}

export interface SetupStep {
  label: string;
  text: string;
  href: string;
  cta: string;
  done: boolean;
}

export interface SetupFacts {
  /** The company profile says what the company does. */
  hasCompany: boolean;
  /** A social account or a mailbox: somewhere for staff to work. */
  hasChannel: boolean;
  hasStaff: boolean;
  /** Anything approved or decided in the inbox yet. */
  hasApproved: boolean;
}

export function setupSteps(facts: SetupFacts): SetupStep[] {
  return [
    {
      label: 'Tell us about your company',
      text: 'What you do and how you sound. Staff write from this, and it can be read from your website.',
      href: '/app/company',
      cta: 'Add details',
      done: facts.hasCompany,
    },
    {
      label: 'Connect an account or a mailbox',
      text: 'A social account to post to, or a mailbox to send sales email from.',
      href: '/app/accounts',
      cta: 'Connect',
      done: facts.hasChannel,
    },
    {
      label: 'Hire a staff member',
      text: 'Pick a role and answer a few questions. They start drafting for your approval.',
      href: '/app/welcome',
      cta: 'Hire',
      done: facts.hasStaff,
    },
    {
      label: 'Approve a first draft',
      text: 'Drafts wait in Review work. Nothing goes out until you approve it.',
      href: '/app/inbox',
      cta: 'Review work',
      done: facts.hasApproved,
    },
  ];
}

/** "Good morning" and so on, by the hour where the workspace is, with the person's first name when we have it. */
export function greeting(name: string, timeZone: string, now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  const part = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
