import { type SendContext, type SendHooks, type SendVerdict, insertRun } from '@ai-staff/core';
import { type EntityManager, type Message, Workspace } from '@ai-staff/db';
import { PLATFORM_DAILY_SENDS_MAX, type SalesSettings, settingsOf } from './settings.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function localParts(at: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.find((part) => part.type === 'weekday')?.value ?? 'Mon',
  );
  return { hour, weekday };
}

/** The first moment from `from` that falls inside the sending window, in `timeZone`. Ported from KudiBooks. */
export function nextWindowStart(from: Date, timeZone: string, hours: SalesSettings['sendingHours']): Date {
  const inside = (at: Date) => {
    const { hour, weekday } = localParts(at, timeZone);
    if (hours.weekdaysOnly && (weekday === 0 || weekday === 6)) return false;
    return hour >= hours.start && hour < hours.end;
  };
  if (inside(from)) return from;
  let at = new Date(Math.ceil(from.getTime() / (15 * MINUTE)) * 15 * MINUTE);
  // Step in quarter hours: a week ahead covers any weekend and any zone offset.
  for (let step = 0; step < 4 * 24 * 8; step += 1) {
    if (inside(at)) return at;
    at = new Date(at.getTime() + 15 * MINUTE);
  }
  return at;
}

/** Midnight at the start of `at`'s day in `timeZone`, as an instant. */
export function localDayStart(at: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offset = asUtc - Math.floor(at.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offset);
}

/**
 * A new mailbox ramps up: 10 new contacts a day on the day it is verified, rising evenly to the configured number over
 * three weeks. Sending a full day's volume from a cold mailbox is how domains get blocked.
 */
export function warmUpCap(configured: number, verifiedAt: Date | null, now: Date): number {
  if (!verifiedAt) return 0;
  const days = Math.max(0, (now.getTime() - verifiedAt.getTime()) / DAY);
  if (configured <= 10 || days >= 21) return configured;
  return Math.floor(10 + ((configured - 10) * days) / 21);
}

async function sentToday(
  m: EntityManager,
  ctx: SendContext,
  dayStart: Date,
  kinds: Message['kind'][],
): Promise<number> {
  const rows = (await m.query(
    `SELECT count(*)::int AS n FROM send_intents i JOIN messages msg ON msg.id = i.message_id
      WHERE i.workspace_id = $1 AND i.staff_id = $2 AND i.state IN ('sending', 'sent', 'uncertain')
        AND msg.kind = ANY($3) AND i.claimed_at >= $4`,
    [ctx.staff.workspaceId, ctx.staff.id, kinds, dayStart],
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/**
 * Sales rules checked at the moment of sending (the platform has already checked suppression, the mailbox and the
 * conversation): sending hours in the recipient's time zone if known, the daily new-contact cap with warm-up, and a
 * backstop on all sends. Ported from KudiBooks `SalesAgentPolicyService.checkSend`.
 */
export const salesSendHooks: SendHooks = {
  async check(m, ctx): Promise<SendVerdict> {
    const settings = settingsOf(ctx.staff);
    const workspace = await m.findOneByOrFail(Workspace, { id: ctx.staff.workspaceId });
    const timeZone = ctx.lead?.timezone || workspace.timezone;

    const windowAt = nextWindowStart(ctx.now, timeZone, settings.sendingHours);
    if (windowAt.getTime() > ctx.now.getTime() + 1000) return { defer: windowAt, reason: 'Outside the sending hours.' };

    const dayStart = localDayStart(ctx.now, workspace.timezone);
    const tomorrow = new Date(dayStart.getTime() + DAY + 5 * MINUTE);
    if ((await sentToday(m, ctx, dayStart, ['first', 'follow_up', 'reply'])) >= PLATFORM_DAILY_SENDS_MAX) {
      return { defer: tomorrow, reason: 'The daily sending limit is reached.' };
    }
    if (ctx.message.kind === 'first') {
      const cap = warmUpCap(settings.dailyNewContacts, ctx.mailbox.verifiedAt, ctx.now);
      if ((await sentToday(m, ctx, dayStart, ['first'])) >= cap) {
        return { defer: tomorrow, reason: `Today's limit of ${cap} new contacts is reached.` };
      }
    }
    return { ok: true };
  },

  /** After a first touch or follow-up goes out, the next follow-up is scheduled, if any are left. */
  async afterSent(m, ctx) {
    if (ctx.message.kind !== 'first' && ctx.message.kind !== 'follow_up') return;
    const settings = settingsOf(ctx.staff);
    const rows = (await m.query(
      `SELECT count(*)::int AS n FROM messages
        WHERE workspace_id = $1 AND conversation_id = $2 AND direction = 'out'
          AND kind IN ('first', 'follow_up') AND delivery = 'accepted'`,
      [ctx.conversation.workspaceId, ctx.conversation.id],
    )) as { n: number }[];
    const step = rows[0]?.n ?? 1;
    if (step > settings.followUps.count) return;
    const gapDays = settings.followUps.gapsDays[step - 1] ?? settings.followUps.gapsDays.at(-1) ?? 3;
    await insertRun(m, {
      workspaceId: ctx.conversation.workspaceId,
      staffId: ctx.staff.id,
      taskType: 'sales_manager.follow_up',
      trigger: 'schedule',
      idempotencyKey: `follow:${ctx.conversation.id}:${step}`,
      input: {
        leadId: ctx.conversation.leadId,
        conversationId: ctx.conversation.id,
        conversationVersion: ctx.conversation.stateVersion,
        step,
      },
      runAt: new Date(ctx.now.getTime() + gapDays * DAY),
      maxAttempts: 3,
    });
  },
};
