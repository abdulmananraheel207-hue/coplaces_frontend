import { Download } from 'lucide-react';
import { Button, ErrorNote, Loading } from '../../components/ui';
import { downloadCsv, fromCents, moneyWhole, titleCase } from '../../lib/format';
import { fmtMonth } from '../../lib/time';
import { PeriodPicker, useFinancePeriod, useFinanceReport } from './Finance';
import { INCOME_LABEL } from './FinanceOverview';

const sum = (rows: number[][], i: number) => rows.reduce((s, r) => s + (r[i] ?? 0), 0);

export default function ProfitLoss() {
  const { months, setMonths } = useFinancePeriod();
  const q = useFinanceReport(months);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const r = q.data;
  const cur = r.currency;
  const pl = r.profitLoss;
  const n = pl.months.length;
  const cols = [...pl.months.keys()];
  const inc = pl.income.map((x) => x.byMonth);
  const cost = pl.costs.map((x) => x.byMonth);
  const incomeBy = cols.map((i) => sum(inc, i));
  const costBy = cols.map((i) => sum(cost, i));
  const netBy = cols.map((i) => incomeBy[i]! - costBy[i]!);
  const incomeTotal = incomeBy.reduce((a, b) => a + b, 0);
  const costTotal = costBy.reduce((a, b) => a + b, 0);
  const netTotal = incomeTotal - costTotal;
  const marginBy = cols.map((i) => (incomeBy[i]! > 0 ? `${Math.round((netBy[i]! / incomeBy[i]!) * 100)}%` : '-'));

  const incomeRows = pl.income.map((x) => ({ label: INCOME_LABEL[x.kind], byMonth: x.byMonth, total: x.totalCents }));
  const costRows = pl.costs.map((x) => ({ label: titleCase(x.category), byMonth: x.byMonth, total: x.totalCents }));

  const cell = (v: number) => (v === 0 ? <span className="text-slate">-</span> : moneyWhole(v, cur));
  const netCell = (v: number) => <span className={v < 0 ? 'text-busy' : 'text-ok'}>{v < 0 ? `(${moneyWhole(-v, cur)})` : moneyWhole(v, cur)}</span>;

  function exportCsv() {
    downloadCsv('profit-and-loss.csv', [
      ['', ...pl.months.map(fmtMonth), 'Total'],
      ['Income'],
      ...incomeRows.map((x) => [x.label, ...x.byMonth.map(fromCents), fromCents(x.total)]),
      ['Total income', ...incomeBy.map(fromCents), fromCents(incomeTotal)],
      ['Costs'],
      ...costRows.map((x) => [x.label, ...x.byMonth.map(fromCents), fromCents(x.total)]),
      ['Total costs', ...costBy.map(fromCents), fromCents(costTotal)],
      ['Net profit or loss', ...netBy.map(fromCents), fromCents(netTotal)],
    ]);
  }

  const heading = 'bg-plaster font-semibold';
  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker months={months} setMonths={setMonths} />
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
              <td>{netTotal >= 0 ? 'Net profit' : 'Net loss'}</td>
              {netBy.map((v, i) => (
                <td key={i} className="r">
                  {netCell(v)}
                </td>
              ))}
              {n > 1 && <td className="r">{netCell(netTotal)}</td>}
            </tr>
            <tr className="text-slate">
              <td>Profit as a share of income</td>
              {marginBy.map((v, i) => (
                <td key={i} className="r">
                  {v}
                </td>
              ))}
              {n > 1 && <td className="r">{incomeTotal > 0 ? `${Math.round((netTotal / incomeTotal) * 100)}%` : '-'}</td>}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate">
        Income is counted in the month a payment arrives, and costs in the month they were spent. Figures in brackets are a loss. Invoices not yet paid are not income yet; see the overview for what is still owed.
      </p>
    </div>
  );
}
