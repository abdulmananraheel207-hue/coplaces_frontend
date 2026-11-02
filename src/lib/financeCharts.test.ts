import { describe, expect, it } from 'vitest';
import { niceTicks, tickFormatter } from '../components/charts/scale';
import type { FinanceReport, InvoiceRow } from '../types';
import { agingParts, agingTotal, billedVsCollected, incomeMix, INCOME_LABEL, invoiceProgress, INVOICE_LIST_LIMIT, moneyByMonth, ranked, shareText, topDebtors } from './financeCharts';

const report = (o: Partial<FinanceReport> = {}): FinanceReport => ({
  from: '2026-09-01',
  to: '2026-11-03',
  currency: 'PKR',
  totals: { invoicedCents: 300_000, collectedCents: 250_000, expensesCents: 120_000, netCents: 130_000 },
  previous: { from: '2026-06-29', to: '2026-08-31', collectedCents: 0, expensesCents: 0, netCents: 0 },
  incomeByKind: [],
  profitLoss: {
    months: ['2026-09', '2026-10', '2026-11'],
    income: [
      { kind: 'subscription', byMonth: [100_000, 50_000, 0], totalCents: 150_000 },
      { kind: 'manual', byMonth: [0, 0, 0], totalCents: 0 },
      { kind: 'kept_deposit', byMonth: [0, 0, 0], totalCents: 0 },
      { kind: 'advance', byMonth: [0, 90_000, 0], totalCents: 90_000 },
      { kind: 'amenities', byMonth: [0, 0, 10_000], totalCents: 10_000 },
    ],
    costs: [],
  },
  monthly: [
    { month: '2026-09', collectedCents: 100_000, invoicedCents: 120_000, expensesCents: 40_000, netCents: 60_000 },
    { month: '2026-10', collectedCents: 140_000, invoicedCents: 100_000, expensesCents: 160_000, netCents: -20_000 },
    { month: '2026-11', collectedCents: 10_000, invoicedCents: 80_000, expensesCents: 0, netCents: 10_000 },
  ],
  expensesByCategory: [],
  paymentsByMethod: [],
  receivablesAging: {
    current: { count: 2, amountCents: 30_000 },
    days1to30: { count: 1, amountCents: 20_000 },
    days31to60: { count: 0, amountCents: 0 },
    days61plus: { count: 1, amountCents: 5_000 },
  },
  amenities: { owedCents: 0, collectedCents: 0, owedBy: [] },
  deposits: { heldCents: 0, receivedCents: 0, refundedCents: 0, keptCents: 0, advanceCents: 0, movements: [] },
  ...o,
});

let n = 0;
const inv = (o: Partial<InvoiceRow>): InvoiceRow => ({
  id: `i${++n}`,
  number: `NC-${n}`,
  memberId: 'm1',
  memberName: 'Hamza Sheikh',
  company: '',
  kind: 'manual',
  status: 'open',
  issueDate: '2026-10-05',
  dueDate: '2026-10-12',
  totalCents: 10_000,
  paidCents: 0,
  balanceCents: 10_000,
  overdue: false,
  ...o,
});

describe('charts drawn straight from the report', () => {
  it('money in and out by month, with net as a line, uses the report figures unchanged', () => {
    const d = moneyByMonth(report());
    expect(d.categories).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(d.series.map((s) => s.values)).toEqual([
      [100_000, 140_000, 10_000],
      [40_000, 160_000, 0],
    ]);
    expect(d.line!.values).toEqual([60_000, -20_000, 10_000]);
  });

  it('invoiced against money in', () => {
    expect(billedVsCollected(report()).series.map((s) => [s.key, s.values])).toEqual([
      ['invoiced', [120_000, 100_000, 80_000]],
      ['in', [100_000, 140_000, 10_000]],
    ]);
  });

  it('income mix leaves out empty kinds but keeps each kind on its own colour', () => {
    const full = incomeMix(report());
    expect(full.series.map((s) => s.key)).toEqual(['subscription', 'advance', 'amenities']);
    const withManual = incomeMix(report({ profitLoss: { ...report().profitLoss, income: [{ kind: 'manual', byMonth: [1, 0, 0], totalCents: 1 }, { kind: 'advance', byMonth: [0, 1, 0], totalCents: 1 }] } }));
    expect(withManual.series.find((s) => s.key === 'advance')!.color).toBe(full.series.find((s) => s.key === 'advance')!.color);
  });

  it('labels member and contract advances alike', () => {
    expect(INCOME_LABEL.advance).toBe('Advances received');
  });

  it('aging parts and their total are the report figures', () => {
    expect(agingParts(report()).map((p) => [p.key, p.cents, p.count])).toEqual([
      ['current', 30_000, 2],
      ['days1to30', 20_000, 1],
      ['days31to60', 0, 0],
      ['days61plus', 5_000, 1],
    ]);
    expect(agingTotal(report())).toBe(55_000);
  });
});

describe('invoices issued in the period', () => {
  it('splits them into paid, to pay and overdue, which add up to what was invoiced', () => {
    const rows = [
      inv({ status: 'paid', totalCents: 20_000, paidCents: 20_000, balanceCents: 0 }),
      inv({ totalCents: 10_000, paidCents: 4_000, balanceCents: 6_000 }), // part paid, not late
      inv({ totalCents: 5_000, paidCents: 0, balanceCents: 5_000, overdue: true }),
      inv({ status: 'void', totalCents: 99_000, balanceCents: 0 }), // never counted
      inv({ issueDate: '2026-08-31', totalCents: 7_000 }), // before the period
    ];
    const p = invoiceProgress(rows, '2026-09-01', '2026-11-03', 35_000);
    expect(p.parts.map((x) => [x.key, x.cents, x.count])).toEqual([
      ['paid', 24_000, 1],
      ['open', 6_000, 1],
      ['overdue', 5_000, 1],
    ]);
    expect(p.parts.reduce((s, x) => s + x.cents, 0)).toBe(p.totalCents);
    expect(p.totalCents).toBe(35_000);
    expect(p.count).toBe(3);
    expect(p.matches).toBe(true);
    expect(p.cut).toBe(false);
  });

  it('says when the rows do not add up to the report, and when the list was cut short', () => {
    expect(invoiceProgress([inv({})], '2026-09-01', '2026-11-03', 99_999).matches).toBe(false);
    const many = Array.from({ length: INVOICE_LIST_LIMIT }, () => inv({}));
    expect(invoiceProgress(many, '2026-09-01', '2026-11-03', 0).cut).toBe(true);
  });

  it('has no paid share when nothing was invoiced', () => {
    expect(invoiceProgress([], '2026-09-01', '2026-11-03', 0)).toMatchObject({ totalCents: 0, paidShare: null, matches: true });
  });
});

describe('who owes the most', () => {
  it('adds up each member, largest first, and checks against the total owed', () => {
    const open = [
      inv({ memberId: 'a', memberName: 'Ayesha', balanceCents: 3_000 }),
      inv({ memberId: 'b', memberName: 'Bilal', balanceCents: 9_000, overdue: true }),
      inv({ memberId: 'a', memberName: 'Ayesha', balanceCents: 4_000, overdue: true }),
    ];
    const d = topDebtors(open, 16_000);
    expect(d.rows.map((r) => [r.label, r.cents, r.count, r.overdueCents])).toEqual([
      ['Bilal', 9_000, 1, 9_000],
      ['Ayesha', 7_000, 2, 4_000],
    ]);
    expect(d.matches).toBe(true);
    expect(d.others).toBeNull();
    expect(topDebtors(open, 16_001).matches).toBe(false);
  });

  it('puts everyone past the limit into one line', () => {
    const open = Array.from({ length: 10 }, (_, i) => inv({ memberId: `m${i}`, memberName: `M${i}`, balanceCents: 1_000 * (i + 1) }));
    const d = topDebtors(open, 55_000, 8);
    expect(d.rows).toHaveLength(8);
    expect(d.others).toEqual({ count: 2, cents: 3_000 });
    expect(d.totalCents).toBe(55_000);
  });

  it('ignores anything that is not an open balance', () => {
    expect(topDebtors([inv({ status: 'paid', balanceCents: 0 }), inv({ balanceCents: 0 })], 0).rows).toEqual([]);
  });
});

describe('shares and ranking', () => {
  it('writes shares as whole percents, small ones as <1%, never -0%', () => {
    expect(shareText(1, 3)).toBe('33%');
    expect(shareText(1, 1000)).toBe('<1%');
    expect(shareText(0, 100)).toBe('0%');
    expect(shareText(-5, 100)).toBe('0%');
    expect(shareText(5, 0)).toBe('0%');
  });

  it('ranks largest first and drops zero rows', () => {
    expect(ranked([{ key: 'a', label: 'A', cents: 5 }, { key: 'b', label: 'B', cents: 0 }, { key: 'c', label: 'C', cents: 9 }]).map((r) => r.key)).toEqual(['c', 'a']);
  });
});

describe('the axis', () => {
  it('always includes zero and rounds to clean steps', () => {
    expect(niceTicks(0, 1400)).toEqual({ min: 0, max: 1500, ticks: [0, 500, 1000, 1500] });
    expect(niceTicks(-200, 1400).ticks[0]).toBeLessThan(0);
    expect(niceTicks(-200, 1400).ticks).toContain(0);
  });

  it('has a sensible axis with nothing to show', () => {
    expect(niceTicks(0, 0)).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('writes ticks in full under 10,000 and compact above, one style per axis', () => {
    expect([0, 2500, 5000].map(tickFormatter([0, 2500, 5000]))).toEqual(['0', '2,500', '5,000']);
    expect([0, 25000, 50000].map(tickFormatter([0, 25000, 50000]))).toEqual(['0', '25K', '50K']);
    expect(tickFormatter([0, 2_000_000])(1_500_000)).toBe('1.5M');
  });
});
