/**
 * Times shown and chosen in the workspace's own time zone, so a post planned for 09:00 in Lagos reads 09:00, not the
 * 08:00 UTC it is stored as. Only `Intl` is used, so daylight-saving rules come from the platform's time zone data.
 */

function parts(iso: string, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return values as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

/** The calendar day an instant falls on in the zone, as YYYY-MM-DD. */
export function localDate(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The wall-clock time of an instant in the zone, as HH:MM. */
export function localTime(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = parts(instant.toISOString(), timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant that shows the same local time as `iso`, on the local day `day` (YYYY-MM-DD). */
export function sameTimeOnDay(iso: string, day: string, timeZone: string): string {
  const [hour, minute] = localTime(iso, timeZone).split(':').map(Number) as [number, number];
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  // The offset on the target day, checked twice so a day that crosses a daylight-saving change still lands right.
  let guess = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  guess = wall - offsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess).toISOString();
}

/** "Lagos time" for Africa/Lagos; UTC stays UTC. */
export function zoneLabel(timeZone: string): string {
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC') return 'UTC';
  const city = timeZone.split('/').pop()?.replaceAll('_', ' ');
  return city ? `${city} time` : timeZone;
}
