/**
 * Review work: turning a staff member's draft into words a person can check, and turning the person's decision back
 * into the payload the API approves. Kept free of React so it can be tested.
 */

export const KIND_LABEL: Record<string, string> = {
  post_draft: 'Post',
  plan: 'Weekly plan',
  email_draft: 'Email',
  reply_draft: 'Reply',
  report: 'Weekly report',
  escalation: 'Needs you',
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/[._]/g, ' ').replace(/^./, (first) => first.toUpperCase());
}

/** Labels for the text a person may edit, in plain words. Anything not listed is not shown as an edit box. */
export const EDITABLE: Record<string, string> = {
  body: 'Text',
  subject: 'Subject',
  firstComment: 'First comment',
  followUps: 'Follow-up replies (put --- between replies)',
  mediaUrls: 'Pictures or video (one web address per line)',
  title: 'Title',
};

export interface PlanIdea {
  id: string;
  network: string;
  accountName: string;
  scheduledFor: string;
  pillar: string;
  angle: string;
}

/** The ideas in a weekly plan, or none when the payload is not a plan. */
export function planIdeas(payload: Record<string, unknown>): PlanIdea[] {
  if (!Array.isArray(payload.items)) return [];
  return payload.items.filter(
    (entry): entry is PlanIdea =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as PlanIdea).id === 'string' &&
      typeof (entry as PlanIdea).scheduledFor === 'string',
  );
}

/** One line per idea, in the same form the staff member writes, so the plan's summary matches what is kept. */
export function planOverview(ideas: PlanIdea[]): string {
  return ideas
    .map(
      (idea) =>
        `${idea.scheduledFor.slice(0, 10)} · ${idea.accountName} (${idea.network}) · ${idea.pillar}: ${idea.angle}`,
    )
    .join('\n');
}

/** The offset of a time zone at a moment, in minutes east of UTC. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** An ISO time as the value of a `datetime-local` input in the workspace's time zone ("2026-11-23T10:00"). */
export function toLocalInput(iso: string, timeZone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const local = new Date(at.getTime() + offsetMinutes(at, timeZone) * 60_000);
  return local.toISOString().slice(0, 16);
}

/** A `datetime-local` value read in the workspace's time zone, back to an ISO time. Null when it is not a time. */
export function fromLocalInput(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset across a daylight-saving change.
  let at = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  at = guess - offsetMinutes(new Date(at), timeZone) * 60_000;
  return new Date(at).toISOString();
}

export type Decision = { ok: true; payload: Record<string, unknown> } | { ok: false; field: string; message: string };

/**
 * Rebuilds the payload a person approves. Text arrives as `payload.<key>` and replaces only text the draft already
 * had; a `scheduledLocal` time replaces `scheduledFor`; a plan keeps only the ideas whose ids were ticked. Everything
 * else in the original (ids, numbers, lists) is carried over untouched.
 */
export function approvedPayload(
  original: Record<string, unknown>,
  form: Iterable<[string, FormDataEntryValue]>,
  timeZone: string,
): Decision {
  const edited: Record<string, unknown> = { ...original };
  const kept: string[] = [];
  let planShown = false;
  for (const [key, value] of form) {
    if (typeof value !== 'string') continue;
    if (key.startsWith('payload.')) {
      const name = key.slice('payload.'.length);
      if (typeof original[name] === 'string') edited[name] = value;
    } else if (key === 'scheduledLocal' && typeof original.scheduledFor === 'string') {
      const iso = fromLocalInput(value, timeZone);
      if (!iso) return { ok: false, field: 'scheduledLocal', message: 'Pick a date and time.' };
      edited.scheduledFor = iso;
    } else if (key === 'keep') {
      kept.push(value);
    } else if (key === 'planShown') {
      planShown = true;
    }
  }
  if (planShown) {
    const ideas = planIdeas(original).filter((idea) => kept.includes(idea.id));
    if (!ideas.length) return { ok: false, field: 'keep', message: 'Keep at least one idea, or reject the plan.' };
    edited.items = ideas;
    if (typeof original.overview === 'string') edited.overview = planOverview(ideas);
  }
  return { ok: true, payload: edited };
}
