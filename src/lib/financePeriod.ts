import type { Query } from '@tanstack/react-query';
import { addMonths } from './time';

/** The spans the finance overview and the profit and loss can show, in months ending this month. */
export const PERIODS = ['1', '3', '6', '12'] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = '6';

export const PERIOD_WORD: Record<Period, string> = { '1': 'this month', '3': 'the last 3 months', '6': 'the last 6 months', '12': 'the last 12 months' };

/** The period from the address bar, or the default when it is missing or not one of the choices. */
export const parsePeriod = (raw: string | null | undefined): Period => (PERIODS as readonly string[]).includes(raw ?? '') ? (raw as Period) : DEFAULT_PERIOD;

/** The first day of the earliest month in the period, up to today, both in the location's calendar. */
export function periodRange(months: Period, today: string) {
  return { from: `${addMonths(today.slice(0, 7), -(Number(months) - 1))}-01`, to: today };
}

/** A finance address that keeps the period, so moving between the overview and the profit and loss keeps it. */
export const withPeriod = (path: string, months: Period) => (months === DEFAULT_PERIOD ? path : `${path}?months=${months}`);

/**
 * For react-query's placeholderData: while a new period loads, keep showing the figures already on screen, but only
 * when they are for the same location. Figures from another location are never shown in its place.
 */
export const keepWithinLocation =
  (locationId: string) =>
  <T>(previous: T | undefined, previousQuery: Query<T, Error, T, readonly unknown[]> | undefined): T | undefined =>
    previousQuery?.queryKey[1] === locationId ? previous : undefined;
