// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation as useRoute } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useFinancePeriod } from '../pages/staff/Finance';
import { DEFAULT_PERIOD, keepWithinLocation, parsePeriod, periodRange, withPeriod } from './financePeriod';

afterEach(cleanup);

describe('the finance period', () => {
  it('reads the period from the address, falling back to six months', () => {
    expect(parsePeriod('1')).toBe('1');
    expect(parsePeriod('12')).toBe('12');
    expect(parsePeriod(null)).toBe(DEFAULT_PERIOD);
    expect(parsePeriod('')).toBe('6');
    expect(parsePeriod('7')).toBe('6');
    expect(parsePeriod('<script>')).toBe('6');
  });

  it('runs from the first of the earliest month to today', () => {
    expect(periodRange('1', '2026-11-03')).toEqual({ from: '2026-11-01', to: '2026-11-03' });
    expect(periodRange('3', '2026-11-03')).toEqual({ from: '2026-09-01', to: '2026-11-03' });
    expect(periodRange('12', '2026-11-03')).toEqual({ from: '2025-12-01', to: '2026-11-03' });
    expect(periodRange('6', '2026-02-28')).toEqual({ from: '2025-09-01', to: '2026-02-28' });
  });

  it('keeps the period in links, leaving the default out', () => {
    expect(withPeriod('/finance/profit-loss', '3')).toBe('/finance/profit-loss?months=3');
    expect(withPeriod('/finance/profit-loss', '6')).toBe('/finance/profit-loss');
  });
});

describe('the period in the address bar', () => {
  const at = (url: string) => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;

  it('comes from ?months and is written back there', () => {
    const { result } = renderHook(() => ({ period: useFinancePeriod(), route: useRoute() }), { wrapper: at('/finance/overview?months=3') });
    expect(result.current.period.months).toBe('3');
    act(() => result.current.period.setMonths('12'));
    expect(result.current.period.months).toBe('12');
    expect(result.current.route.search).toBe('?months=12');
    act(() => result.current.period.setMonths('6'));
    expect(result.current.route.search).toBe('');
  });

  it('keeps other things in the address', () => {
    const { result } = renderHook(() => ({ period: useFinancePeriod(), route: useRoute() }), { wrapper: at('/finance/overview?x=1') });
    act(() => result.current.period.setMonths('1'));
    expect(new URLSearchParams(result.current.route.search).get('x')).toBe('1');
  });
});

describe('keeping figures on screen while a new period loads', () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pending = new Map<string, (v: string) => void>();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(
      ({ loc, period }: { loc: string; period: string }) =>
        useQuery({
          queryKey: ['reports', loc, period],
          queryFn: () => new Promise<string>((resolve) => pending.set(`${loc}:${period}`, resolve)),
          placeholderData: keepWithinLocation(loc),
        }),
      { wrapper, initialProps: { loc: 'lahore', period: '6' } },
    );
    return { hook, pending };
  }

  it('shows the old period, marked as a placeholder, until the new one arrives', async () => {
    const { hook, pending } = setup();
    await waitFor(() => expect(pending.has('lahore:6')).toBe(true));
    act(() => pending.get('lahore:6')!('six months in Lahore'));
    await waitFor(() => expect(hook.result.current.data).toBe('six months in Lahore'));

    hook.rerender({ loc: 'lahore', period: '3' });
    expect(hook.result.current.data).toBe('six months in Lahore');
    expect(hook.result.current.isPlaceholderData).toBe(true);
    expect(hook.result.current.isLoading).toBe(false);

    await waitFor(() => expect(pending.has('lahore:3')).toBe(true));
    act(() => pending.get('lahore:3')!('three months in Lahore'));
    await waitFor(() => expect(hook.result.current.data).toBe('three months in Lahore'));
    expect(hook.result.current.isPlaceholderData).toBe(false);
  });

  it("never shows another location's figures", async () => {
    const { hook, pending } = setup();
    await waitFor(() => expect(pending.has('lahore:6')).toBe(true));
    act(() => pending.get('lahore:6')!('six months in Lahore'));
    await waitFor(() => expect(hook.result.current.data).toBe('six months in Lahore'));

    hook.rerender({ loc: 'karachi', period: '6' });
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.isLoading).toBe(true);
  });
});
