/** Time-zone arithmetic with no dependency: the workspace's wall clock to an instant and back. */
/** Milliseconds the zone is ahead of UTC at instant `at`. */
function offsetMs(at: Date, timeZone: string): number {
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
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `timeZone` reads `date` (YYYY-MM-DD) and `time` (HH:MM). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes: the offset can differ either side of a daylight-saving change.
  const first = new Date(naive - offsetMs(new Date(naive), timeZone));
  return new Date(naive - offsetMs(first, timeZone));
}

/** The calendar date (YYYY-MM-DD) of instant `at` in `timeZone`. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
