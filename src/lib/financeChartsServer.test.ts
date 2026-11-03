import { describe, expect, it } from 'vitest';
import type { FinanceCharts } from '../types';
import { balancesByMonth, collectionRate, debtorsFrom, invoiceProgressFrom } from './financeCharts';

const month = (m: string, billed: number, collected: number, extra: Partial<FinanceCharts['months'][number]> = {}): FinanceCharts['months'][number] => ({
  month: m,
  billedCents: billed,
  collectedCents: collected,
  collectionRate: billed ? collected / billed : null,
  taxCollectedCents: 0,
  expensesCents: 0,
  incomeByCategory: {},
  expensesByCategory: {},
  moneyInByMethod: {},
  outstandingEndCents: 0,
  overdueEndCents: 0,
  depositsHeldEndCents: 0,
  ...extra,
});

describe('charts from the server', () => {
  it('splits the invoices issued into paid, to pay and overdue, counting what was paid on open ones', () => {
    const p = invoiceProgressFrom({
      paid: { count: 2, totalCents: 10_000, owedCents: 0 },
      open: { count: 3, totalCents: 9_000, owedCents: 7_000 }, // 2,000 paid on them
      void: { count: 1, totalCents: 500, owedCents: 0 },
      overdue: { count: 1, totalCents: 3_000, owedCents: 3_000 },
    });
    expect(p.totalCents).toBe(19_000);
    expect(p.parts.map((x) => [x.key, x.cents, x.count])).toEqual([
      ['paid', 12_000, 2],
      ['open', 4_000, 2],
      ['overdue', 3_000, 1],
    ]);
    expect(p.parts.reduce((s, x) => s + x.cents, 0)).toBe(p.totalCents);
    expect(p.paidShare).toBeCloseTo(12 / 19);
  });

  it('shows the largest debtors and everyone else in one line, adding up to what is owed', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({ memberId: `m${i}`, name: `M${i}`, company: '', owedCents: (10 - i) * 100, overdueCents: 0, oldestDue: '2026-01-01', invoices: 1 }));
    const d = debtorsFrom(list, 6_000, 8);
    expect(d.rows).toHaveLength(8);
    expect(d.rows.reduce((s, r) => s + r.cents, 0) + d.others!.cents).toBe(6_000);
    expect(debtorsFrom(list.slice(0, 2), 1_900).others).toBeNull();
  });

  it('works out the collection rate over the period, and draws the month-end balances', () => {
    const c = { months: [month('2026-01', 10_000, 8_000, { outstandingEndCents: 2_000 }), month('2026-02', 10_000, 11_000)] } as FinanceCharts;
    expect(collectionRate(c)).toBe(95);
    expect(collectionRate({ months: [month('2026-01', 0, 500)] } as FinanceCharts)).toBeNull();
    const b = balancesByMonth(c);
    expect(b.categories).toEqual(['2026-01', '2026-02']);
    expect(b.series.map((s) => s.key)).toEqual(['owed', 'overdue', 'deposits']);
    expect(b.series[0]!.values).toEqual([2_000, 0]);
  });
});
