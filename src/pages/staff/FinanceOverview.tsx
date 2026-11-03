import { Link } from 'react-router';
import { useAuth, useLocation } from '../../auth';
import { CollectButton } from '../../components/Amenities';
import { BarList } from '../../components/charts/BarList';
import { ColumnChart } from '../../components/charts/ColumnChart';
import { MONEY_COLOR, SERIES } from '../../components/charts/palette';

const SERIES_PLAN = SERIES[2];
const SERIES_SPACE = SERIES[6];
import { SegmentedBar } from '../../components/charts/SegmentedBar';
import { depositRows } from '../../components/ContractPrint';
import { CountText } from '../../components/Count';
import { Button, ErrorNote, Loading, Section } from '../../components/ui';
import { canUse, overviewSections } from '../../lib/access';
import { agingParts, agingTotal, balancesByMonth, billedVsCollected, collectionRate, debtorsFrom, incomeMix, INCOME_LABEL, invoiceProgressFrom, moneyByMonth, ranked, shareText } from '../../lib/financeCharts';
import { withPeriod } from '../../lib/financePeriod';
import { downloadCsv, METHOD_LABEL, money, moneyWhole, titleCase } from '../../lib/format';
import { marginNote, toneOf } from '../../lib/profitLoss';
import { fmtDate, fmtMonth, localDateOf } from '../../lib/time';
import { PERIOD_WORD, PeriodPicker, useFinanceCharts, useFinancePeriod, useFinanceReport } from './Finance';

export { INCOME_LABEL };

const MOVE_WORD = { received: 'Security deposit received', refunded: 'Security deposit returned', kept: 'Security deposit kept as income', advance: 'Advance received', advance_refund: 'Advance given back' } as const;

/** Money that came in without a payment method of its own, as the server names it in "money in by method". */
const MONEY_IN_LABEL: Record<string, string> = { kept_deposit: 'Security deposits kept', other: 'Other' };
const methodLabel = (m: string) => MONEY_IN_LABEL[m] ?? METHOD_LABEL[m as keyof typeof METHOD_LABEL] ?? titleCase(m);
/** What an income category is called on the overview. */
const CATEGORY_LABEL: Record<string, string> = { plan: 'Plans and shifts', rent: 'Rent (contracts)', booking: 'Room and desk bookings', manual: 'Other charges', amenity: 'Amenities', advance: 'Advances', kept_deposit: 'Security deposits kept' };

/** "Up 12% on the period before", or nothing to compare with. */
function change(now: number, before: number, goodWhenUp: boolean) {
  if (before === 0) return { text: 'No earlier figures to compare', tone: '' };
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return { text: 'Same as the period before', tone: '' };
  const up = pct > 0;
  return { text: `${up ? 'Up' : 'Down'} ${Math.abs(pct)}% on the period before`, tone: up === goodWhenUp ? 'text-ok' : 'text-busy' };
}

function Figure({ label, value, sub, tone, note }: { label: string; value: string; sub?: string; tone?: 'ok' | 'busy'; note?: string }) {
  const dot = tone === 'ok' ? 'bg-ok' : tone === 'busy' ? 'bg-busy' : 'bg-signal';
  const wash = tone === 'ok' ? 'bg-ok-wash/60 border-ok/20' : tone === 'busy' ? 'bg-busy-wash/60 border-busy/20' : '';
  return (
    <div className={`surface lift p-5 ${wash}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate">
        <span className={`inline-block size-2 rounded-full ${dot}`} aria-hidden />
        {label}
      </p>
      <p className={`display mt-2 text-[1.75rem] leading-tight ${tone === 'ok' ? 'text-ok' : tone === 'busy' ? 'text-busy' : ''}`}>
        <CountText text={value} />
      </p>
      {sub && <p className={`mt-1 text-xs font-semibold ${note ?? 'text-slate'}`}>{sub}</p>}
    </div>
  );
}

const monthName = (m: string) => fmtMonth(m);
const monthShort = (m: string, i: number) => {
  const [y, mm] = m.split('-');
  const short = fmtMonth(m).split(' ')[0] ?? m;
  // the year is shown on January and on the first month, so a 12-month view never shows the same name twice without it
  return i === 0 || mm === '01' ? `${short} ${y!.slice(2)}` : short;
};

export default function FinanceOverview() {
  const { months, setMonths } = useFinancePeriod();
  const { user, org } = useAuth();
  const show = overviewSections(user, org?.features);
  const mayInvoices = canUse(user, org?.features, 'invoices');
  const loc = useLocation();
  const q = useFinanceReport(months);
  // The invoice and debtor charts, and the month-end balances, come from the server's charts: worked out over every invoice, in one
  // request, instead of downloading the invoice lists here. It runs alongside the report.
  const charts = useFinanceCharts(months);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  const r = q.data;
  // While a new period loads, the figures on screen are still the old period's, so the words follow the figures.
  const updating = q.isPlaceholderData;
  const cur = r.currency;
  const { collectedCents: inCents, expensesCents: outCents } = r.totals;
  // The result is the profit and loss's: income before tax, less costs. Tax collected is owed to the government, not profit.
  const taxCents = r.totals.taxCollectedCents ?? 0;
  const incomeCents = r.totals.incomeCents ?? inCents;
  const netCents = r.totals.profitCents ?? r.totals.netCents;
  const profit = netCents >= 0;
  const resultTone = toneOf(netCents);
  const ag = r.receivablesAging;
  const lateCents = ag.days1to30.amountCents + ag.days31to60.amountCents + ag.days61plus.amountCents;
  const lateCount = ag.days1to30.count + ag.days31to60.count + ag.days61plus.count;
  const owedCents = agingTotal(r);
  const inChange = change(inCents, r.previous.collectedCents, true);
  const outChange = change(outCents, r.previous.expensesCents, false);
  const when = PERIOD_WORD[r.months];
  const mix = incomeMix(r);
  const c = charts.data && charts.data.from === r.from && charts.data.to === r.to ? charts.data : null;
  const progress = c ? invoiceProgressFrom(c.invoicesByStatus) : null;
  const debtors = c ? debtorsFrom(c.topDebtors, owedCents) : null;
  const rate = c ? collectionRate(c) : null;
  const byCategory = ranked((r.incomeByCategory ?? []).map((x) => ({ key: x.category, label: CATEGORY_LABEL[x.category] ?? titleCase(x.category), cents: x.amountCents })));

  return (
    <div className={`space-y-10 transition-opacity ${updating ? 'opacity-60' : ''}`} aria-busy={updating}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[15px]">
          In {when} you took in <strong className="num">{moneyWhole(inCents, cur)}</strong>
          {taxCents > 0 && <> (of which <strong className="num">{moneyWhole(taxCents, cur)}</strong> is tax)</>} and spent <strong className="num">{moneyWhole(outCents, cur)}</strong>
          {inCents === 0 && outCents === 0 ? '.' : netCents === 0 ? ', so you broke even.' : profit ? (
            <>
              , leaving a <strong className="num text-ok">profit of {moneyWhole(netCents, cur)}</strong>.
            </>
          ) : (
            <>
              , a <strong className="num text-busy">loss of {moneyWhole(-netCents, cur)}</strong>.
            </>
          )}
        </p>
        <PeriodPicker months={months} setMonths={setMonths} updating={updating} />
      </div>

      <div className={`grid gap-3 sm:grid-cols-2 ${show.owed ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <Figure label="Money in" value={moneyWhole(inCents, cur)} sub={inChange.text} note={inChange.tone} />
        <Figure label="Money out" value={moneyWhole(outCents, cur)} sub={outChange.text} note={outChange.tone} />
        <Figure label={profit ? 'Profit' : 'Loss'} value={moneyWhole(Math.abs(netCents), cur)} tone={resultTone === 'neutral' ? undefined : resultTone} sub={taxCents > 0 ? `Before ${moneyWhole(taxCents, cur)} tax collected · ${marginNote(netCents, incomeCents)}` : marginNote(netCents, incomeCents)} />
        {show.owed && <Figure label="Still owed to you, today" value={moneyWhole(owedCents, cur)} sub={lateCount > 0 ? `${moneyWhole(lateCents, cur)} is overdue` : 'Nothing is overdue'} note={lateCount > 0 ? 'text-busy' : 'text-ok'} />}
      </div>

      {show.owed && lateCount > 0 && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-busy/25 bg-busy-wash px-4 py-3 text-sm">
          <span>
            <strong>{lateCount} {lateCount === 1 ? 'invoice is' : 'invoices are'} overdue</strong>, {moneyWhole(lateCents, cur)} in all.
          </span>
          {show.invoicesLink && (
            <Link to="/finance/invoices" className="font-semibold underline underline-offset-2">
              See the invoices
            </Link>
          )}
        </p>
      )}

      <Section title="Money in and out, month by month" aside={<Link to={withPeriod('/finance/profit-loss', months)} className="font-semibold text-ink underline underline-offset-2">Full profit and loss</Link>}>
        <div className="surface p-4 sm:p-5">
          <ColumnChart data={moneyByMonth(r)} currency={cur} label="Money in, money out and the net result, month by month" categoryLabel={monthName} shortLabel={monthShort} />
          <p className="mt-3 text-xs text-slate">Money in is everything received: invoice payments, advances, security deposits kept and amenities collected, tax included. Money out is the expenses recorded. The profit and loss counts the same income without the tax.</p>
        </div>
      </Section>

      {show.owed && (
        <Section title="Invoiced and received, month by month">
          <div className="surface p-4 sm:p-5">
            <ColumnChart data={billedVsCollected(r)} currency={cur} label="What was invoiced and the money that came in, month by month" categoryLabel={monthName} shortLabel={monthShort} />
            <p className="mt-3 text-xs text-slate">
              Invoiced counts invoices by the day they were issued, voided ones left out, including the part an advance paid. Money in counts payments by the day they arrived, so a month's invoices are often paid the month after.
              {rate !== null && <> Over {when}, money in came to <strong className="num">{rate}%</strong> of what was invoiced.</>}
            </p>
          </div>
        </Section>
      )}

      <Section title="Where the money came from, month by month">
        <div className="surface p-4 sm:p-5">
          {mix.series.length ? (
            <ColumnChart data={mix} stacked totalLabel="Total income" currency={cur} label="Income by kind, month by month" categoryLabel={monthName} shortLabel={monthShort} />
          ) : (
            <p className="text-sm text-slate">No income in this period.</p>
          )}
        </div>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Where it went">
          <BarList
            rows={ranked(r.expensesByCategory.map((e) => ({ key: e.category, label: titleCase(e.category), cents: e.amountCents })))}
            currency={cur}
            color={MONEY_COLOR.out}
            label="Expenses by category"
            empty="No expenses recorded in this period."
          />
        </Section>
        <Section title="How the money came in" aside="All money in">
          <BarList
            rows={ranked(r.paymentsByMethod.map((p) => ({ key: p.method, label: methodLabel(p.method), cents: p.amountCents })))}
            currency={cur}
            color={MONEY_COLOR.in}
            label="Money in by method"
            empty="No money came in during this period."
          />
        </Section>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="What the income was for" aside="Before tax">
          <BarList rows={byCategory} currency={cur} color={MONEY_COLOR.in} label="Income by what was sold" empty="No income in this period." />
        </Section>
        <Section title="Income by plan and by space" aside="Before tax">
          {charts.isLoading ? (
            <Loading />
          ) : charts.error ? (
            <ErrorNote error={charts.error} onRetry={() => void charts.refetch()} retrying={charts.isFetching} />
          ) : c ? (
            <div className="space-y-5">
              <BarList rows={ranked(c.incomeByPlan.map((x) => ({ key: x.planId, label: x.name || 'A plan', cents: x.amountCents })))} currency={cur} color={SERIES_PLAN} label="Income by plan" empty="No plan income in this period." />
              <BarList rows={ranked(c.incomeBySpace.map((x) => ({ key: x.resourceId, label: x.name || 'A space', sub: titleCase(x.kind), cents: x.amountCents })))} currency={cur} color={SERIES_SPACE} label="Income by space" empty="No income tied to a single space in this period." />
            </div>
          ) : null}
        </Section>
      </div>

      {mayInvoices && (
        <Section title="Invoices issued in this period" aside={progress ? `${progress.count} ${progress.count === 1 ? 'invoice' : 'invoices'}` : undefined}>
          <div className="surface p-4 sm:p-5">
            {charts.isLoading ? (
              <Loading />
            ) : charts.error ? (
              <ErrorNote error={charts.error} onRetry={() => void charts.refetch()} retrying={charts.isFetching} />
            ) : progress && progress.totalCents > 0 ? (
              <>
                <p className="mb-3 text-[15px]">
                  Of <strong className="num">{money(progress.totalCents, cur)}</strong> invoiced, <strong className="num text-ok">{money(progress.parts[0]!.cents, cur)}</strong> has been paid ({shareText(progress.parts[0]!.cents, progress.totalCents)}).
                  {progress.parts[2]!.cents > 0 && (
                    <>
                      {' '}
                      <strong className="num text-busy">{money(progress.parts[2]!.cents, cur)}</strong> is overdue.
                    </>
                  )}
                </p>
                <SegmentedBar parts={progress.parts} currency={cur} label="Invoices issued in this period: paid, to pay and overdue" />
              </>
            ) : (
              <p className="text-sm text-slate">No invoices were issued in this period.</p>
            )}
          </div>
        </Section>
      )}

      {show.owed && (
        <Section title="Who still owes you" aside={`${moneyWhole(owedCents, cur)} today`}>
          <div className="space-y-6">
            <div className="surface p-4 sm:p-5">
              <SegmentedBar parts={agingParts(r)} currency={cur} label="What is owed, by how late it is" />
            </div>
            {c && c.months.length > 1 && (
              <div className="surface p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold">At the end of each month</h3>
                <ColumnChart data={balancesByMonth(c)} currency={cur} label="What was owed, the overdue part, and the security deposits held, at the end of each month" categoryLabel={monthName} shortLabel={monthShort} />
              </div>
            )}
            {mayInvoices && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Largest balances</h3>
                {charts.isLoading ? (
                  <Loading />
                ) : charts.error ? (
                  <ErrorNote error={charts.error} onRetry={() => void charts.refetch()} retrying={charts.isFetching} />
                ) : debtors ? (
                  <>
                    <BarList
                      rows={debtors.rows.map((d) => ({ ...d, sub: [d.sub, d.overdueCents > 0 ? `${money(d.overdueCents, cur)} overdue` : '', `${d.count} ${d.count === 1 ? 'invoice' : 'invoices'}`].filter(Boolean).join(' · ') }))}
                      others={debtors.others ? { label: 'Everyone else who owes', cents: debtors.others.cents } : null}
                      currency={cur}
                      color={MONEY_COLOR.in}
                      label="Open balances by member"
                      empty="Nobody owes anything."
                    />
                  </>
                ) : null}
              </div>
            )}
          </div>
        </Section>
      )}

      {(r.amenities.owedCents > 0 || r.amenities.collectedCents > 0) && (
        <Section title="Amenities to collect" aside={`${moneyWhole(r.amenities.collectedCents, cur)} collected in ${when}`}>
          {r.amenities.owedBy.length === 0 ? (
            <p className="text-sm text-slate">Nothing is owed for tea, coffee or food.</p>
          ) : (
            <ul className="surface divide-y divide-line px-4">
              {r.amenities.owedBy.map((o) => (
                <li key={o.memberId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-semibold">{o.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="num font-semibold">{money(o.owedCents, cur)}</span>
                    {show.collectAmenities && <CollectButton memberId={o.memberId} label="Mark collected" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate">Beyond each member's free amount for the day. It counts as income once you mark it collected.</p>
        </Section>
      )}

      {(r.deposits.heldCents > 0 || r.deposits.movements.length > 0) && (
        <Section
          title="Advances and security deposits"
          aside={
            <Button small onClick={() => downloadCsv('contract-money.csv', [['Date', 'Member', 'Space', 'What happened', 'How', 'Reference', 'Amount'], ...depositRows(r.deposits.movements, loc.timezone)])} disabled={!r.deposits.movements.length}>
              Export
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Figure label="Security deposits you hold" value={moneyWhole(r.deposits.heldCents, cur)} sub="Belongs to members, not income" />
            <Figure label="Security deposits received" value={moneyWhole(r.deposits.receivedCents, cur)} sub={`In ${when}`} />
            <Figure label="Security deposits returned" value={moneyWhole(r.deposits.refundedCents, cur)} sub={`In ${when}`} />
            <Figure label="Advances received" value={moneyWhole(r.deposits.advanceCents, cur)} sub={r.unapplied && r.unapplied.advancesCents > 0 ? `Income, already in money in · ${moneyWhole(r.unapplied.advancesCents, cur)} not yet used on invoices` : 'Income, already in money in'} />
            <Figure label="Security deposits kept" value={moneyWhole(r.deposits.keptCents, cur)} sub="Income, already in money in" />
          </div>
          {r.deposits.movements.length > 0 && (
            <div className="surface-table mt-3">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Member</th>
                    <th>What happened</th>
                    <th>How</th>
                    <th className="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {r.deposits.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="num whitespace-nowrap">{fmtDate(localDateOf(m.occurredAt, loc.timezone))}</td>
                      <td>
                        <span className="font-semibold">{m.memberName}</span>
                        {m.resourceName && <span className="block text-xs text-slate">{m.resourceName}</span>}
                      </td>
                      <td>{MOVE_WORD[m.kind]}</td>
                      <td>{[m.method ? (METHOD_LABEL[m.method] ?? titleCase(m.method)) : '', m.reference].filter(Boolean).join(', ') || '—'}</td>
                      <td className="r font-semibold">{money(m.amountCents, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
