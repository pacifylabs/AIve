/** How the app talks about staff: role names and colours, the tone of an activity, and a member's standing. */

export const ROLE_LABEL: Record<string, string> = {
  social_media: 'Social Media Staff',
  sales_manager: 'Sales Manager Staff',
};

export type RoleTone = 'social' | 'sales';

/** Each role's identity colour. Unknown roles borrow Social's, so a new role still renders. */
export function roleTone(roleKey: string): RoleTone {
  return roleKey === 'sales_manager' ? 'sales' : 'social';
}

export const NETWORK_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  discord: 'Discord',
};

const BAD = new Set([
  'post.failed',
  'post.missed',
  'post.chain_incomplete',
  'account.broken',
  'account.expired',
  'task.dead',
  'autonomy.demoted',
  'post.uncertain',
]);
const WARN = new Set(['account.expiring']);
const GOOD = new Set(['post.published', 'autonomy.promoted_auto', 'autonomy.promoted']);

export type Tone = 'bad' | 'warn' | 'good' | 'neutral';

/** Whether an activity is a problem, a warning, a win, or just a record. */
export function activityTone(type: string): Tone {
  if (BAD.has(type)) return 'bad';
  if (WARN.has(type)) return 'warn';
  if (GOOD.has(type)) return 'good';
  return 'neutral';
}

export interface DatedItem {
  createdAt: string;
}

/**
 * Splits a newest-first list into days in the workspace's time zone, labelled Today, Yesterday or the date, so a
 * long record reads like a diary rather than a log.
 */
export function groupByDay<T extends DatedItem>(
  items: T[],
  timeZone: string,
  now = new Date(),
): { label: string; items: T[] }[] {
  const dayKey = (date: Date) => date.toLocaleDateString('en-CA', { timeZone });
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = dayKey(date);
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone });
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.map(({ label, items: grouped }) => ({ label, items: grouped }));
}

export interface TaskProgress {
  autonomy: 'off' | 'draft' | 'act';
  mode: string;
  progress: { approvals: number; met: boolean };
  rules: { approvals: number };
}

export type Standing = 'paused' | 'probation' | 'ready' | 'trusted';

/**
 * A staff member's standing in plain words. Probation until any task acts alone; "ready" when a task's record
 * already meets the rules but it still asks; "trusted" once at least one task acts on its own.
 */
export function standingOf(state: string, tasks: TaskProgress[]): Standing {
  if (state === 'paused') return 'paused';
  if (tasks.some((task) => task.autonomy === 'act')) return 'trusted';
  if (tasks.some((task) => task.autonomy === 'draft' && task.mode !== 'off' && task.progress.met)) return 'ready';
  return 'probation';
}

export const STANDING_LABEL: Record<Standing, string> = {
  paused: 'Paused',
  probation: 'On probation',
  ready: 'Ready for promotion',
  trusted: 'Promoted',
};

/** What each role does, never does and needs, for the hiring cards. Written to match the role definitions. */
export const ROLE_CARD: Record<string, { tagline: string; does: string; never: string; needs: string }> = {
  social_media: {
    tagline: 'Keeps your accounts active and sounding like you',
    does: 'Plans your week, writes posts for each network, repeats what worked, and turns buying comments into leads.',
    never: 'Posts while on probation, invents prices or offers, or replies to complaints.',
    needs: 'One connected social account to post to.',
  },
  sales_manager: {
    tagline: 'Follows up properly and knows when to stop',
    does: "Reads each lead's website, writes first emails and follow-ups, and sorts every reply.",
    never: 'Writes to anyone who opted out, offers discounts, or agrees to contracts.',
    needs: 'A mailbox on your own domain, and a few leads.',
  },
};
