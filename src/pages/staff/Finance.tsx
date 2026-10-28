import { useState } from 'react';
import { Navigate, Outlet, useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useAuth, useFeature, useLocation } from '../../auth';
import { can } from '../../lib/permissions';
import { PageHeader, Segmented, Tabs } from '../../components/ui';
import { addMonths, todayIn } from '../../lib/time';
import type { FinanceReport } from '../../types';

interface Period {
  months: string;
  setMonths: (m: string) => void;
}

/** The time span shared by the overview and the profit and loss, so switching tabs keeps it. */
export const useFinancePeriod = () => useOutletContext<Period>();

export function useFinanceReport(months: string) {
  const loc = useLocation();
  const today = todayIn(loc.timezone);
  const from = `${addMonths(today.slice(0, 7), -(Number(months) - 1))}-01`;
  return useQuery({
    queryKey: ['reports', loc.id, from, today],
    queryFn: () => api.get<FinanceReport>('/reports/finance', { locationId: loc.id, from, to: today }),
  });
}

export const PERIOD_WORD: Record<string, string> = { '1': 'this month', '3': 'the last 3 months', '6': 'the last 6 months', '12': 'the last 12 months' };

export function PeriodPicker({ months, setMonths }: Period) {
  return (
    <Segmented
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
  );
}

export function FinanceLayout() {
  const { user } = useAuth();
  const invoicing = useFeature('invoicing') && can(user, 'invoices');
  const expenses = useFeature('expenses') && can(user, 'expenses');
  const reports = useFeature('reports') && can(user, 'reports');
  const [months, setMonths] = useState('6');
  const tabs = [
    ...(reports ? [{ to: '/finance/overview', label: 'Overview' }, { to: '/finance/profit-loss', label: 'Profit and loss' }] : []),
    ...(invoicing ? [{ to: '/finance/invoices', label: 'Invoices' }, { to: '/finance/payments', label: 'Payments' }] : []),
    ...(expenses ? [{ to: '/finance/expenses', label: 'Expenses' }] : []),
  ];
  return (
    <>
      <div className="no-print">
        <PageHeader title="Finance" sub="Income, costs and profit for this space, and the invoices behind them." />
      </div>
      <Tabs items={tabs} />
      <Outlet context={{ months, setMonths } satisfies Period} />
    </>
  );
}

export function FinanceIndex() {
  const { user } = useAuth();
  const invoicing = useFeature('invoicing') && can(user, 'invoices');
  const expenses = useFeature('expenses') && can(user, 'expenses');
  const reports = useFeature('reports') && can(user, 'reports');
  const to = reports ? '/finance/overview' : invoicing ? '/finance/invoices' : expenses ? '/finance/expenses' : '/';
  return <Navigate to={to} replace />;
}
