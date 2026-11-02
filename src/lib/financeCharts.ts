import type { FinanceReport, IncomeKind, InvoiceRow } from '../types';
import { AGING_RAMP, MONEY_COLOR, SERIES, STATUS_COLOR } from '../components/charts/palette';

/**
 * What each finance chart draws, built from what the server returned. Nothing here defines money differently from the
 * server: it only rearranges the report's figures, or adds up whole cents from invoice rows. Where invoice rows are
 * used, the sum is checked against the report's own figure, and the chart says when they disagree.
 */

export interface Series {
  key: string;
  label: string;
  color: string;
  /** Cents, one per category. */
  values: number[];
}

export interface ColumnData {
  categories: string[];
  series: Series[];
  /** A line drawn over the columns, on the same axis and in the same units. */
  line?: Series;
}

export interface Part {
  key: string;
  label: string;
  color: string;
  cents: number;
  /** How many invoices, when the part counts any. */
  count?: number;
}

export interface Ranked {
  key: string;
  label: string;
  sub?: string;
  cents: number;
}

export const INCOME_LABEL: Record<IncomeKind, string> = {
  subscription: 'Memberships and plans',
  manual: 'Rooms, desks and other charges',
  kept_deposit: 'Security deposits we kept',
  advance: 'Advances received',
  amenities: 'Amenities (tea, coffee, food)',
};

/** The income kinds in a fixed order, so each keeps its colour whatever the period shows. */
const INCOME_ORDER: IncomeKind[] = ['subscription', 'manual', 'kept_deposit', 'advance', 'amenities'];

/** Money in and money out each month, with the net result as a line. */
export function moneyByMonth(r: FinanceReport): ColumnData {
  return {
    categories: r.monthly.map((m) => m.month),
    series: [
      { key: 'in', label: 'Money in', color: MONEY_COLOR.in, values: r.monthly.map((m) => m.collectedCents) },
      { key: 'out', label: 'Money out', color: MONEY_COLOR.out, values: r.monthly.map((m) => m.expensesCents) },
    ],
    line: { key: 'net', label: 'Net result', color: MONEY_COLOR.net, values: r.monthly.map((m) => m.netCents) },
  };
}

/** What was invoiced each month next to the money that came in. */
export function billedVsCollected(r: FinanceReport): ColumnData {
  return {
    categories: r.monthly.map((m) => m.month),
    series: [
      { key: 'invoiced', label: 'Invoiced', color: MONEY_COLOR.invoiced, values: r.monthly.map((m) => m.invoicedCents) },
      { key: 'in', label: 'Money in', color: MONEY_COLOR.in, values: r.monthly.map((m) => m.collectedCents) },
    ],
  };
}

/** Income by kind, month by month, stacked. Kinds with nothing in the period are left out but keep their colours. */
export function incomeMix(r: FinanceReport): ColumnData {
  const byKind = new Map(r.profitLoss.income.map((x) => [x.kind, x.byMonth]));
  const n = r.profitLoss.months.length;
  return {
    categories: r.profitLoss.months,
    series: INCOME_ORDER.map((kind, i) => ({ key: kind, label: INCOME_LABEL[kind], color: SERIES[i]!, values: Array.from({ length: n }, (_, j) => byKind.get(kind)?.[j] ?? 0) })).filter((s) =>
      s.values.some((v) => v !== 0),
    ),
  };
}

/** Receivables by how late they are, as of today, as parts of one whole. */
export function agingParts(r: FinanceReport): Part[] {
  const a = r.receivablesAging;
  return [
    { key: 'current', label: 'Not yet due', color: AGING_RAMP[0], cents: a.current.amountCents, count: a.current.count },
    { key: 'days1to30', label: '1 to 30 days late', color: AGING_RAMP[1], cents: a.days1to30.amountCents, count: a.days1to30.count },
    { key: 'days31to60', label: '31 to 60 days late', color: AGING_RAMP[2], cents: a.days31to60.amountCents, count: a.days31to60.count },
    { key: 'days61plus', label: 'Over 60 days late', color: AGING_RAMP[3], cents: a.days61plus.amountCents, count: a.days61plus.count },
  ];
}

/** The total the server says is owed: every open invoice's balance, as of today. */
export const agingTotal = (r: FinanceReport) => agingParts(r).reduce((s, p) => s + p.cents, 0);

/** The server's list of invoices stops at this many, newest first. */
export const INVOICE_LIST_LIMIT = 500;

/**
 * The invoices issued in the period (void ones left out), split into what has been paid, what is still to pay and not
 * yet late, and what is overdue. Their total must equal the report's "invoiced"; `matches` says whether it does.
 */
export function invoiceProgress(rows: InvoiceRow[], from: string, to: string, reportInvoicedCents: number) {
  const inPeriod = rows.filter((i) => i.status !== 'void' && i.issueDate >= from && i.issueDate <= to);
  let paid = 0;
  let open = 0;
  let late = 0;
  let total = 0;
  let paidCount = 0;
  let openCount = 0;
  let lateCount = 0;
  for (const i of inPeriod) {
    total += i.totalCents;
    paid += i.paidCents;
    if (i.status === 'paid') paidCount++;
    else if (i.overdue) {
      late += i.balanceCents;
      lateCount++;
    } else {
      open += i.balanceCents;
      openCount++;
    }
  }
  const parts: Part[] = [
    { key: 'paid', label: 'Paid', color: STATUS_COLOR.good, cents: paid, count: paidCount },
    { key: 'open', label: 'To pay, not yet due', color: STATUS_COLOR.pending, cents: open, count: openCount },
    { key: 'overdue', label: 'Overdue', color: STATUS_COLOR.critical, cents: late, count: lateCount },
  ];
  // The list is newest first: if it was cut short, invoices from the start of the period may be missing.
  const cut = rows.length >= INVOICE_LIST_LIMIT;
  return { parts, totalCents: total, count: inPeriod.length, paidShare: total > 0 ? paid / total : null, matches: total === reportInvoicedCents, cut };
}

/**
 * Who owes the most, from the open invoices: one row per member, largest first, then everyone else in one line.
 * `matches` says whether the balances add up to the server's figure for everything owed.
 */
export function topDebtors(open: InvoiceRow[], owedCents: number, limit = 8) {
  const by = new Map<string, Ranked & { count: number; overdueCents: number }>();
  for (const i of open) {
    if (i.status !== 'open' || i.balanceCents <= 0) continue;
    const row = by.get(i.memberId) ?? { key: i.memberId, label: i.memberName, sub: i.company || undefined, cents: 0, count: 0, overdueCents: 0 };
    row.cents += i.balanceCents;
    row.count++;
    if (i.overdue) row.overdueCents += i.balanceCents;
    by.set(i.memberId, row);
  }
  const all = [...by.values()].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
  const top = all.slice(0, limit);
  const rest = all.slice(limit);
  const total = all.reduce((s, r) => s + r.cents, 0);
  return {
    rows: top,
    others: rest.length ? { count: rest.length, cents: rest.reduce((s, r) => s + r.cents, 0) } : null,
    totalCents: total,
    matches: total === owedCents,
  };
}

/** A ranked list from the report's breakdowns, largest first, with zero rows left out. */
export const ranked = (rows: { key: string; label: string; cents: number }[]): Ranked[] => rows.filter((r) => r.cents !== 0).sort((a, b) => b.cents - a.cents);

/** A share for display: whole percent, "<1%" for small non-zero parts, never "-0%". */
export function shareText(part: number, whole: number) {
  if (!(whole > 0) || part <= 0) return '0%';
  const pct = (part / whole) * 100;
  if (pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}
