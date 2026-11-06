export { localDate, zonedTimeToUtc } from '@ai-staff/core';
import { localDate } from '@ai-staff/core';

const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

/** The Monday on or after the day after `at`: the start of the week being planned. */
export function nextWeekStart(at: Date, timeZone: string): string {
  const today = localDate(at, timeZone);
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const untilMonday = (8 - weekday) % 7 || 7;
  return addDays(today, untilMonday);
}

export const weekDates = (weekStart: string): string[] =>
  Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
