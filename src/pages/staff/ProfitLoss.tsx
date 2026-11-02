import { Download } from 'lucide-react';
import { Button, ErrorNote, Loading } from '../../components/ui';
import { csvAmount, downloadCsv, moneyWhole, titleCase } from '../../lib/format';
import { fmtMonth } from '../../lib/time';
import { PeriodPicker, useFinancePeriod, useFinanceReport } from './Finance';
import { INCOME_LABEL } from '../../lib/financeCharts';
import { buildProfitLoss, marginText, toneOf } from '../../lib/profitLoss';

const TONE_CLASS = { ok: 'text-ok', busy: 'text-busy', neutral: '' } as const;

export default function ProfitLoss() {
  const { months, setMonths } = useFinancePeriod();
  const q = useFinanceReport(months);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  const r = q.data;
  const updating = q.isPlaceholderData;
  const cur = r.currency;
  const pl = buildProfitLoss(r.profitLoss);
  const n = pl.months.length;
  const { incomeBy, costBy, netBy, incomeTotal, costTotal, netTotal } = pl;
  const sumRow = (byMonth: number[]) => byMonth.reduce((a, b) => a + b, 0);
  const marginBy = pl.months.map((_, i) => marginText(netBy[i]!, incomeBy[i]!));

  // Each row's total is the sum of the months shown, so every row and column of the table adds up.
  const incomeRows = pl.income.map((x) => ({ label: INCOME_LABEL[x.key], byMonth: x.byMonth, total: sumRow(x.byMonth) }));
  const costRows = pl.costs.map((x) => ({ label: titleCase(x.key), byMonth: x.byMonth, total: sumRow(x.byMonth) }));

  const cell = (v: number) => (v === 0 ? <span className="text-slate">-</span> : moneyWhole(v, cur));
  const netCell = (v: number) => <span className={TONE_CLASS[toneOf(v)]}>{v < 0 ? `(${moneyWhole(-v, cur)})` : moneyWhole(v, cur)}</span>;
  const marginCell = (net: number, income: number) => <span className={net < 0 && income > 0 ? 'text-busy' : ''}>{marginText(net, income)}</span>;

  function exportCsv() {
    downloadCsv('profit-and-loss.csv', [
      ['', ...pl.months.map(fmtMonth), 'Total'],
      ['Income'],
      ...incomeRows.map((x) => [x.label, ...x.byMonth.map(csvAmount), csvAmount(x.total)]),
      ['Total income', ...incomeBy.map(csvAmount), csvAmount(incomeTotal)],
      ['Costs'],
      ...costRows.map((x) => [x.label, ...x.byMonth.map(csvAmount), csvAmount(x.total)]),
      ['Total costs', ...costBy.map(csvAmount), csvAmount(costTotal)],
      ['Net profit or loss', ...netBy.map(csvAmount), csvAmount(netTotal)],
      ['Profit as a share of income', ...marginBy, marginText(netTotal, incomeTotal)],
    ]);
  }

  const heading = 'bg-plaster font-semibold';
  return (
    <div className={`space-y-5 transition-opacity ${updating ? 'opacity-60' : ''}`} aria-busy={updating}>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker months={months} setMonths={setMonths} updating={updating} />
        <Button onClick={exportCsv}>
          <Download size={15} /> Export to a spreadsheet
        </Button>
      </div>

      <div className="surface-table">
        <table className="tbl min-w-[36rem]">
          <thead>
            <tr>
              <th />
              {pl.months.map((m) => (
                <th key={m} className="r">
                  {fmtMonth(m)}
                </th>
              ))}
              {n > 1 && <th className="r">Total</th>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={n + 2} className={heading}>
                Income
              </td>
            </tr>
            {incomeRows.map((x) => (
              <tr key={x.label}>
                <td className="pl-6">{x.label}</td>
                {x.byMonth.map((v, i) => (
                  <td key={i} className="r">
                    {cell(v)}
                  </td>
                ))}
                {n > 1 && <td className="r font-semibold">{cell(x.total)}</td>}
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total income</td>
              {incomeBy.map((v, i) => (
                <td key={i} className="r">
                  {moneyWhole(v, cur)}
                </td>
              ))}
              {n > 1 && <td className="r">{moneyWhole(incomeTotal, cur)}</td>}
            </tr>

            <tr>
              <td colSpan={n + 2} className={heading}>
                Costs
              </td>
            </tr>
            {costRows.length === 0 && (
              <tr>
                <td colSpan={n + 2} className="pl-6 text-slate">
                  No costs recorded in this period.
                </td>
              </tr>
            )}
            {costRows.map((x) => (
              <tr key={x.label}>
                <td className="pl-6">{x.label}</td>
                {x.byMonth.map((v, i) => (
                  <td key={i} className="r">
                    {cell(v)}
                  </td>
                ))}
                {n > 1 && <td className="r font-semibold">{cell(x.total)}</td>}
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total costs</td>
              {costBy.map((v, i) => (
                <td key={i} className="r">
                  {moneyWhole(v, cur)}
                </td>
              ))}
              {n > 1 && <td className="r">{moneyWhole(costTotal, cur)}</td>}
            </tr>

            <tr className="border-t-2 border-ink/80 text-[15px] font-bold">
              <td>{netTotal > 0 ? 'Net profit' : netTotal < 0 ? 'Net loss' : 'Net result'}</td>
              {netBy.map((v, i) => (
                <td key={i} className="r">
                  {netCell(v)}
                </td>
              ))}
              {n > 1 && <td className="r">{netCell(netTotal)}</td>}
            </tr>
            <tr className="text-slate">
              <td>Profit as a share of income</td>
              {netBy.map((v, i) => (
                <td key={i} className="r">
                  {marginCell(v, incomeBy[i]!)}
                </td>
              ))}
              {n > 1 && <td className="r">{marginCell(netTotal, incomeTotal)}</td>}
            </tr>
          </tbody>
        </table>
      </div>
      {pl.mismatch && (
        <p role="status" className="rounded-lg border border-signal-deep/30 bg-hold-wash px-4 py-2.5 text-sm">
          Some figures from the server did not line up with these months, so the totals here may be short. Try again, and if it keeps happening, tell Coplaces.
        </p>
      )}
      <p className="text-sm text-slate">
        Income is counted in the month a payment arrives, and costs in the month they were spent. Figures in brackets are a loss. Invoices not yet paid are not income yet; see the overview for what is still owed.
      </p>
    </div>
  );
}
