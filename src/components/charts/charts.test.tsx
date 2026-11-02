// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ColumnData, Part } from '../../lib/financeCharts';
import { BarList } from './BarList';
import { ColumnChart } from './ColumnChart';
import { SegmentedBar } from './SegmentedBar';

// jsdom lays nothing out, so give every element a width for the charts to draw into.
// clientWidth is defined on Element.prototype; shadow it on HTMLElement for these tests, then take the shadow away.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
});
afterEach(cleanup);

const plain = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ');

const data: ColumnData = {
  categories: ['2026-09', '2026-10'],
  series: [
    { key: 'in', label: 'Money in', color: '#2a78d6', values: [100_000, 140_000] },
    { key: 'out', label: 'Money out', color: '#eb6834', values: [40_000, 160_000] },
  ],
  line: { key: 'net', label: 'Net result', color: '#1baf7a', values: [60_000, -20_000] },
};

const column = (stacked = false, d = data) =>
  render(<ColumnChart data={d} stacked={stacked} totalLabel="Total" currency="PKR" label="Money by month" categoryLabel={(c) => (c === '2026-09' ? 'September 2026' : 'October 2026')} shortLabel={(c) => (c === '2026-09' ? 'Sep' : 'Oct')} />);

describe('ColumnChart', () => {
  it('draws one column per series per month, a line, and a legend naming every series', () => {
    const { container } = column();
    expect(container.querySelectorAll('svg path')).toHaveLength(4);
    expect(container.querySelector('svg polyline')).not.toBeNull();
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Money in', 'Money out', 'Net result']);
  });

  it('puts a loss below the zero line, on the same axis', () => {
    const { container } = column();
    const zero = [...container.querySelectorAll('svg text')].find((t) => t.textContent === '0')!;
    const zeroY = Number(zero.getAttribute('y')) - 4;
    const dots = [...container.querySelectorAll('svg circle')];
    expect(Number(dots[1]!.getAttribute('cy'))).toBeGreaterThan(zeroY);
    expect(Number(dots[0]!.getAttribute('cy'))).toBeLessThan(zeroY);
  });

  it('reads a whole month out on keyboard focus, every series in the tooltip', () => {
    const { container } = column();
    const hits = container.querySelectorAll('svg rect[tabindex="0"]');
    expect(hits).toHaveLength(2);
    expect(plain(hits[1]!.getAttribute('aria-label'))).toBe('October 2026: Money in Rs 1,400, Money out Rs 1,600, Net result -Rs 200');
    act(() => (hits[1] as SVGElement).focus());
    const tip = screen.getByRole('status');
    expect(plain(tip.textContent)).toContain('October 2026');
    expect(plain(tip.textContent)).toContain('Rs 1,600');
  });

  it('has every value in the table view', () => {
    column();
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').map((r) => plain(r.textContent));
    expect(rows[0]).toBe('MonthMoney inMoney outNet result');
    expect(rows[2]).toBe('October 2026Rs 1,400Rs 1,600-Rs 200');
    expect(screen.getByRole('button', { name: 'Show as chart' })).toBeTruthy();
  });

  it('stacks the series and totals each month', () => {
    const { container } = column(true, { categories: data.categories, series: data.series });
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').map((r) => plain(r.textContent));
    expect(rows[1]).toBe('September 2026Rs 1,000Rs 400Rs 1,400');
    expect(container.querySelectorAll('svg path').length).toBe(4);
  });

  it('draws nothing broken when every value is zero', () => {
    const { container } = column(false, { categories: ['2026-11'], series: [{ key: 'in', label: 'Money in', color: '#2a78d6', values: [0] }] });
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('SegmentedBar', () => {
  const parts: Part[] = [
    { key: 'paid', label: 'Paid', color: '#0ca30c', cents: 75_000, count: 3 },
    { key: 'open', label: 'To pay', color: '#2a78d6', cents: 0, count: 0 },
    { key: 'late', label: 'Overdue', color: '#d03b3b', cents: 25_000, count: 1 },
  ];

  it('draws the parts in proportion and nothing for a part at zero', () => {
    const { container } = render(<SegmentedBar parts={parts} currency="PKR" label="Invoices" />);
    const fills = [...container.querySelectorAll('svg rect:not([tabindex])')];
    expect(fills).toHaveLength(2);
    const [a, b] = fills.map((r) => Number(r.getAttribute('width')));
    expect(a! / b!).toBeCloseTo(3, 1);
    expect(container.textContent).toContain('75%');
  });

  it('gives each part its name, amount, share and count on focus and in the table', () => {
    const { container } = render(<SegmentedBar parts={parts} currency="PKR" label="Invoices" />);
    const hit = container.querySelector('svg rect[tabindex="0"]')!;
    expect(plain(hit.getAttribute('aria-label'))).toBe('Paid: Rs 750, 75%, 3 invoices');
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').map((r) => plain(r.textContent));
    expect(rows).toEqual(['PartCountAmountShare', 'Paid3Rs 75075%', 'To pay0Rs 00%', 'Overdue1Rs 25025%']);
  });

  it('says so when there is nothing', () => {
    render(<SegmentedBar parts={parts.map((p) => ({ ...p, cents: 0 }))} currency="PKR" label="Invoices" />);
    expect(screen.getByText('Nothing to show.')).toBeTruthy();
  });
});

describe('BarList', () => {
  it('prints every amount and share, and the rest in one line', () => {
    render(<BarList rows={[{ key: 'rent', label: 'Rent', cents: 60_000 }, { key: 'net', label: 'Internet', cents: 20_000 }]} others={{ label: '3 more', cents: 20_000 }} currency="PKR" label="Costs" />);
    const items = screen.getByRole('list', { name: 'Costs' }).querySelectorAll('li');
    expect([...items].map((li) => plain(li.textContent))).toEqual(['RentRs 60060%', 'InternetRs 20020%', '3 moreRs 20020%']);
  });

  it('says what is missing when there is nothing', () => {
    render(<BarList rows={[]} currency="PKR" label="Costs" empty="No expenses recorded in this period." />);
    expect(screen.getByText('No expenses recorded in this period.')).toBeTruthy();
  });
});
