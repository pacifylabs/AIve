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
      href: '/app/hire',
      cta: 'Hire',
      done: facts.hasStaff,
    },
    {
      label: 'Approve a first draft',
      text: 'Drafts wait in your inbox. Nothing goes out until you approve it.',
      href: '/app/inbox',
      cta: 'Open inbox',
      done: facts.hasApproved,
    },
  ];
}

export interface PrimaryAction {
  label: string;
  href: string;
}

/** The header's main button follows what matters most now: drafts waiting, then setup, then writing a post. */
export function primaryAction(waiting: number, steps: SetupStep[]): PrimaryAction {
  if (waiting > 0) return { label: `Review ${waiting} draft${waiting === 1 ? '' : 's'}`, href: '/app/inbox' };
  if (steps.some((step) => !step.done)) return { label: 'Finish setup', href: '#setup' };
  return { label: 'New post', href: '/app/compose' };
}

export interface WeekFigures {
  postsOut: number;
  engagement: number;
  /** Null when no connected network reports it. */
  reach: number | null;
  followers: number;
}

/** The last seven days, from the posts list, the top-posts readings and the per-account stats. */
export function weekFigures(
  posts: PostState[],
  top: { engagement: number }[],
  stats: { reach: number | null; change: number }[],
  now = new Date(),
): WeekFigures {
  const since = now.getTime() - 7 * 86_400_000;
  const reaches = stats.map((stat) => stat.reach).filter((value): value is number => value != null);
  return {
    postsOut: posts.filter((post) => {
      const at = new Date(post.scheduledFor).getTime();
      return post.state === 'published' && at >= since && at <= now.getTime();
    }).length,
    engagement: top.reduce((sum, post) => sum + post.engagement, 0),
    reach: reaches.length ? reaches.reduce((sum, value) => sum + value, 0) : null,
    followers: stats.reduce((sum, stat) => sum + stat.change, 0),
  };
}
