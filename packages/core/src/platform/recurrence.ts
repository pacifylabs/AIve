/** Weekdays are numbered as in JavaScript: 0 is Sunday, 6 is Saturday. */
export type Recurrence =
  | { kind: 'weekly'; weekdays: number[]; everyWeeks: number }
  | { kind: 'monthly_day'; dayOfMonth: number }
  /** `nth` is 1 to 4, or 5 for the last such weekday of the month. */
  | { kind: 'monthly_weekday'; nth: 1 | 2 | 3 | 4 | 5; weekday: number };

const DAY_MS = 86_400_000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The Monday of the week a date falls in, so "every two weeks" counts whole weeks from the start. */
const mondayMs = (date: string) => {
  const ms = toMs(date);
  return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
};

/**
 * The dates (YYYY-MM-DD) a rule falls on between `from` and `to`, never before `startsOn` or after `endsOn`. Pure calendar
 * arithmetic, so it does not depend on a time zone: the time of day and the zone are applied by the caller.
 * - Weekly: the chosen weekdays, every `everyWeeks` weeks counted from the week of `startsOn`.
 * - Monthly on a day: that day of the month, or the last day in a month that is too short for it (the 31st in April).
 * - Monthly on a weekday: the first to fourth, or last, of that weekday in the month.
 */
export function occurrences(
  rule: Recurrence,
  startsOn: string,
  endsOn: string | null,
  from: string,
  to: string,
): string[] {
  const first = Math.max(toMs(from), toMs(startsOn));
  const last = Math.min(toMs(to), endsOn ? toMs(endsOn) : Number.POSITIVE_INFINITY);
  const found: string[] = [];
  for (let ms = first; ms <= last; ms += DAY_MS) {
    const date = new Date(ms);
    const day = date.getUTCDate();
    const length = daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
    let hit = false;
    if (rule.kind === 'weekly') {
      const weeks = Math.round((mondayMs(toDate(ms)) - mondayMs(startsOn)) / (7 * DAY_MS));
      hit = rule.weekdays.includes(date.getUTCDay()) && weeks % Math.max(rule.everyWeeks, 1) === 0;
    } else if (rule.kind === 'monthly_day') {
      hit = day === Math.min(rule.dayOfMonth, length);
    } else if (date.getUTCDay() === rule.weekday) {
      hit = rule.nth === 5 ? day + 7 > length : Math.ceil(day / 7) === rule.nth;
    }
    if (hit) found.push(toDate(ms));
  }
  return found;
}
