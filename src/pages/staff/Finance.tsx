import { Suspense, useCallback } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useAuth, useCanUse, useLocation } from '../../auth';
import { financeHome } from '../../lib/access';
import { DEFAULT_PERIOD, keepWithinLocation, parsePeriod, periodRange, withPeriod, type Period } from '../../lib/financePeriod';
import { Loading, PageHeader, Segmented, Tabs } from '../../components/ui';
import { todayIn } from '../../lib/time';
import type { FinanceReport } from '../../types';
import { qd } from '../../lib/queryDefs';

export { PERIOD_WORD } from '../../lib/financePeriod';

/**
 * The time span shared by the overview and the profit and loss. It lives in the address (?months=3), so it survives a
 * reload, can be shared as a link, and stays the same when moving between the two.
 */
export function useFinancePeriod() {
  const [params, setParams] = useSearchParams();
  const months = parsePeriod(params.get('months'));
  const setMonths = useCallback(
    (m: Period) =>
      setParams(
        (cur) => {
          const next = new URLSearchParams(cur);
          if (m === DEFAULT_PERIOD) next.delete('months');
          else next.set('months', m);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { months, setMonths };
}

/** A finance report, remembering which period it is for. */
export type PeriodReport = FinanceReport & { months: Period };

/**
 * The report for a period. While a newly chosen period loads, the figures already on screen stay there (marked as
 * updating) instead of the page going blank; `isPlaceholderData` says when that is happening.
 */
export function useFinanceReport(months: Period) {
  const loc = useLocation();
  return useQuery<PeriodReport>({
    ...qd.financeReport(loc.id, todayIn(loc.timezone), months),
    placeholderData: keepWithinLocation(loc.id),
  });
}

export function PeriodPicker({ months, setMonths, updating }: { months: Period; setMonths: (m: Period) => void; updating?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {updating && (
        <span role="status" className="text-sm text-slate">
          Updating…
        </span>
      )}
      <Segmented<Period>
        label="Period"
        value={months}
        onChange={setMonths}
        options={[
          { value: '1', label: 'This month' },
          { value: '3', label: '3 months' },
          { value: '6', label: '6 months' },
          { value: '12', label: '12 months' },
        ]}
      />
    </div>
  );
}

export function FinanceLayout() {
  const invoicing = useCanUse('invoices');
  const expenses = useCanUse('expenses');
  const reports = useCanUse('reports');
  const { months } = useFinancePeriod();
  const tabs = [
    ...(reports
      ? [
          { to: withPeriod('/finance/overview', months), label: 'Overview' },
          { to: withPeriod('/finance/profit-loss', months), label: 'Profit and loss' },
        ]
      : []),
    ...(invoicing ? [{ to: '/finance/invoices', label: 'Invoices' }, { to: '/finance/payments', label: 'Payments' }] : []),
    ...(expenses ? [{ to: '/finance/expenses', label: 'Expenses' }] : []),
  ];
  return (
    <>
      <div className="no-print">
        <PageHeader title="Finance" sub="Income, costs and profit for this space, and the invoices behind them." />
      </div>
      <Tabs items={tabs} />
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </>
  );
}

export function FinanceIndex() {
  const { user, org } = useAuth();
  return <Navigate to={financeHome(user, org?.features)} replace />;
}
