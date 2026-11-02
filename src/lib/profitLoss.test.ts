import { describe, expect, it } from 'vitest';
import type { FinanceReport } from '../types';
import { buildProfitLoss, fitToMonths, marginNote, marginOf, marginText, toneOf } from './profitLoss';

type Pl = FinanceReport['profitLoss'];

describe('colour of a result', () => {
  it('is green for profit, red for loss and neutral for exactly zero', () => {
    expect(toneOf(1)).toBe('ok');
    expect(toneOf(-1)).toBe('busy');
    expect(toneOf(0)).toBe('neutral');
    expect(toneOf(-0)).toBe('neutral');
  });
});

describe('margin', () => {
  it('is profit as a share of income', () => {
    expect(marginOf(25_000, 100_000)).toBe(25);
    expect(marginText(25_000, 100_000)).toBe('25%');
  });

  it('puts a loss in brackets, like the money, never as a minus', () => {
    expect(marginOf(-20_000, 100_000)).toBe(-20);
    expect(marginText(-20_000, 100_000)).toBe('(20%)');
  });

  it('has no margin without income', () => {
    expect(marginOf(-5000, 0)).toBeNull();
    expect(marginText(-5000, 0)).toBe('-');
    expect(marginText(0, 0)).toBe('-');
  });

  it('never shows minus zero', () => {
    expect(marginOf(-1, 1_000_000)).toBe(0);
    expect(Object.is(marginOf(-1, 1_000_000), -0)).toBe(false);
    expect(marginText(-1, 1_000_000)).toBe('0%');
  });

  it('describes a loss without a double negative', () => {
    expect(marginNote(-20_000, 100_000)).toBe('The loss is 20% of money in');
    expect(marginNote(25_000, 100_000)).toBe('25% of money in');
    expect(marginNote(0, 100_000)).toBe('Money in and out are equal');
    expect(marginNote(0, 0)).toBe('No income yet');
    expect(marginNote(-5000, 0)).toBe('No income in this period');
  });
});

describe('lining figures up with months', () => {
  it('leaves matching figures alone', () => {
    expect(fitToMonths([1, 2, 3], 3)).toEqual({ values: [1, 2, 3], mismatch: false });
  });

  it('counts missing months as nothing and says so', () => {
    expect(fitToMonths([1], 3)).toEqual({ values: [1, 0, 0], mismatch: true });
  });

  it('drops figures beyond the last month and says so', () => {
    expect(fitToMonths([1, 2, 3, 4], 2)).toEqual({ values: [1, 2], mismatch: true });
  });
});

describe('the profit and loss table', () => {
  const pl: Pl = {
    months: ['2026-09', '2026-10', '2026-11'],
    income: [
      { kind: 'subscription', byMonth: [100_000, 120_000, 0], totalCents: 220_000 },
      { kind: 'amenities', byMonth: [500, 0, 250], totalCents: 750 },
    ],
    costs: [{ category: 'rent', byMonth: [80_000, 80_000, 80_000], totalCents: 240_000 }],
  };

  it('adds up every column and the totals from the cells', () => {
    const t = buildProfitLoss(pl);
    expect(t.incomeBy).toEqual([100_500, 120_000, 250]);
    expect(t.costBy).toEqual([80_000, 80_000, 80_000]);
    expect(t.netBy).toEqual([20_500, 40_000, -79_750]);
    expect(t.incomeTotal).toBe(220_750);
    expect(t.costTotal).toBe(240_000);
    expect(t.netTotal).toBe(-19_250);
    expect(t.mismatch).toBe(false);
  });

  it('flags rows whose months do not match the columns, without misplacing numbers', () => {
    const t = buildProfitLoss({ ...pl, income: [{ kind: 'manual', byMonth: [5000], totalCents: 5000 }] });
    expect(t.income[0]!.byMonth).toEqual([5000, 0, 0]);
    expect(t.incomeBy).toEqual([5000, 0, 0]);
    expect(t.mismatch).toBe(true);
  });

  it('flags a row whose server total disagrees with its months', () => {
    const t = buildProfitLoss({ ...pl, costs: [{ category: 'rent', byMonth: [1, 1, 1], totalCents: 4 }] });
    expect(t.mismatch).toBe(true);
  });

  it('works with nothing recorded', () => {
    const t = buildProfitLoss({ months: ['2026-11'], income: [], costs: [] });
    expect(t.incomeBy).toEqual([0]);
    expect(t.netTotal).toBe(0);
    expect(t.mismatch).toBe(false);
  });

  it('handles large amounts exactly', () => {
    const big = 9_000_000_000_00; // 9 billion rupees in paisa
    const t = buildProfitLoss({ months: ['2026-11'], income: [{ kind: 'manual', byMonth: [big], totalCents: big }], costs: [{ category: 'rent', byMonth: [1], totalCents: 1 }] });
    expect(t.netTotal).toBe(big - 1);
  });
});
