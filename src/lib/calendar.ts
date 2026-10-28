import type { Holiday } from '../types';
import { addDays, addMonths, daysBetween } from './time';

/** 0 is Sunday, like the server's closed weekdays. */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Why the location is shut on a date, or null when it is open. Mirrors the server's rule. */
export function closedReason(date: string, closedWeekdays: string, holidays: Holiday[]): string | null {
  const h = holidays.find((x) => x.date === date);
  if (h) return h.name ? `Closed for ${h.name}` : 'Closed for a holiday';
  return closedWeekdays.split(',').includes(String(weekdayOf(date))) ? 'Closed this day of the week' : null;
}

/** The Monday on or before a date. */
export const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

export const monthFirst = (date: string) => `${date.slice(0, 7)}-01`;
export const monthLast = (date: string) => addDays(`${addMonths(date.slice(0, 7), 1)}-01`, -1);

/** Every date from one to another, both included. */
export const eachDay = (from: string, to: string) => Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));

/** The weeks that show a month, Monday to Sunday, including the days around it. */
export const monthGrid = (date: string) => ({ from: mondayOf(monthFirst(date)), to: addDays(mondayOf(addDays(monthLast(date), 6)), 6) });
