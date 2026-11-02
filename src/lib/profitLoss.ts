import type { FinanceReport, IncomeKind } from '../types';

export type ResultTone = 'ok' | 'busy' | 'neutral';

/** Green for a profit, red for a loss, and neither for exactly nothing. */
export const toneOf = (cents: number): ResultTone => (cents > 0 ? 'ok' : cents < 0 ? 'busy' : 'neutral');

/** Profit as a whole percentage of income, or null when there was no income to measure it against. */
export function marginOf(netCents: number, incomeCents: number): number | null {
  if (incomeCents <= 0) return null;
  const pct = Math.round((netCents / incomeCents) * 100);
  return pct === 0 ? 0 : pct; // never -0
}

/** The margin as written in the table: "12%", a loss in brackets like the money ("(12%)"), or "-" without income. */
export function marginText(netCents: number, incomeCents: number) {
  const m = marginOf(netCents, incomeCents);
  if (m === null) return '-';
  return m < 0 ? `(${-m}%)` : `${m}%`;
}

/** What the overview says under the profit or loss figure. */
export function marginNote(netCents: number, incomeCents: number) {
  const m = marginOf(netCents, incomeCents);
  if (m === null) return netCents < 0 ? 'No income in this period' : 'No income yet';
  if (netCents < 0) return `The loss is ${-m}% of money in`;
  if (netCents === 0) return 'Money in and out are equal';
  return `${m}% of money in`;
}

/**
 * A row's monthly figures lined up with the months: missing months count as nothing, and figures beyond the last
 * month are dropped. `mismatch` says when either happened, so the page can say so instead of misplacing numbers.
 */
export function fitToMonths(values: readonly number[], months: number) {
  const fitted = Array.from({ length: months }, (_, i) => values[i] ?? 0);
  return { values: fitted, mismatch: values.length !== months };
}

export interface PlRow<K> {
  key: K;
  byMonth: number[];
  /** The server's total for the row. */
  totalCents: number;
}

/** The profit and loss as the table shows it, with every column and the totals worked out from the cells shown. */
export function buildProfitLoss(pl: FinanceReport['profitLoss']) {
  const n = pl.months.length;
  let mismatch = false;
  const fit = (values: readonly number[]) => {
    const f = fitToMonths(values, n);
    if (f.mismatch) mismatch = true;
    return f.values;
  };
  const income: PlRow<IncomeKind>[] = pl.income.map((x) => ({ key: x.kind, byMonth: fit(x.byMonth), totalCents: x.totalCents }));
  const costs: PlRow<string>[] = pl.costs.map((x) => ({ key: x.category, byMonth: fit(x.byMonth), totalCents: x.totalCents }));
  const column = (rows: PlRow<unknown>[], i: number) => rows.reduce((s, r) => s + r.byMonth[i]!, 0);
  const incomeBy = pl.months.map((_, i) => column(income, i));
  const costBy = pl.months.map((_, i) => column(costs, i));
  const netBy = incomeBy.map((v, i) => v - costBy[i]!);
  const incomeTotal = incomeBy.reduce((a, b) => a + b, 0);
  const costTotal = costBy.reduce((a, b) => a + b, 0);
  // A row whose total disagrees with its months means the server counted something the months do not show.
  for (const r of [...income, ...costs]) if (r.byMonth.reduce((a, b) => a + b, 0) !== r.totalCents) mismatch = true;
  return { months: pl.months, income, costs, incomeBy, costBy, netBy, incomeTotal, costTotal, netTotal: incomeTotal - costTotal, mismatch };
}
