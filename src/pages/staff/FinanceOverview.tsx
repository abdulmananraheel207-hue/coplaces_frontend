import { Link } from 'react-router';
import { useAuth, useLocation } from '../../auth';
import { CollectButton, InvoiceAmenitiesButton } from '../../components/Amenities';
import { BarList } from '../../components/charts/BarList';
import { ColumnChart } from '../../components/charts/ColumnChart';
import { MONEY_COLOR, SERIES } from '../../components/charts/palette';

const SERIES_PLAN = SERIES[2];
const SERIES_SPACE = SERIES[6];
import { SegmentedBar } from '../../components/charts/SegmentedBar';
import { depositRows } from '../../components/ContractPrint';
import { CountText } from '../../components/Count';
import { Button, ErrorNote, Loading, Modal, Section } from '../../components/ui';
import { canUse, overviewSections } from '../../lib/access';
import { agingParts, agingTotal, balancesByMonth, billedVsCollected, CHANNEL_COLOR, channelsByMonth, collectionRate, debtorsFrom, incomeMix, INCOME_LABEL, invoiceProgressFrom, moneyByMonth, ranked, shareText } from '../../lib/financeCharts';
import { withPeriod } from '../../lib/financePeriod';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { csvAmount, downloadCsv, METHOD_LABEL, methodName, money, moneyWhole, titleCase } from '../../lib/format';
import { ChequeActions, ChequeChip } from '../../components/ChequeActions';
import { ExtendForm } from '../../components/CompanyContractTools';
import { qd } from '../../lib/queryDefs';
import type { Contract, FinanceReport } from '../../types';
import { marginNote, toneOf } from '../../lib/profitLoss';
import { fmtDate, fmtMonth, localDateOf } from '../../lib/time';
import { CHANNEL_TABS, PERIOD_WORD, PeriodPicker, useFinanceCharts, useFinancePeriod, useFinanceReport } from './Finance';

export { INCOME_LABEL };

const MOVE_WORD = { received: 'Security deposit received', refunded: 'Security deposit returned', kept: 'Security deposit kept as income', advance: 'Advance received', advance_refund: 'Advance given back' } as const;

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

/** A smaller figure, for rows of figures that are read together. */
function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'busy' | 'hold' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'busy' ? 'text-busy' : tone === 'hold' ? 'text-hold' : '';
  return (
    <div className="surface p-4">
      <p className="text-sm font-semibold text-slate">{label}</p>
      <p className={`display mt-1 text-[1.35rem] leading-tight ${color}`}>
        <CountText text={value} />
      </p>
      {sub && <p className="mt-1 text-xs text-slate">{sub}</p>}
    </div>
  );
}

const RENEWAL_KIND = { contract: 'Contract', company: 'Company contract', plan: 'Plan' } as const;
const slugOf = (method: string) => CHANNEL_TABS.find((t) => t.method === method)?.slug ?? 'cash';

/** Who is due to leave in the next 90 days, what they pay a month, and who was lost and won in the period. */
function Renewals({ r, when }: { r: FinanceReport; when: string }) {
  const loc = useLocation();
  const cur = r.currency;
  const contracts = useQuery(qd.contracts(loc.id));
  const [extending, setExtending] = useState<Contract | null>(null);
  const rn = r.renewals;
  const ch = r.churn;
  if (!rn || !ch) return null;
  const group = (g: { count: number; monthlyCents: number }) => `${g.count} · ${moneyWhole(g.monthlyCents, cur)}/mo`;
  return (
    <Section title="Renewals and churn" aside="Revenue at risk is what they pay a month">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Mini label="Ending in 30 days" value={group(rn.in30)} sub={rn.overdue.count ? `Plus ${rn.overdue.count} already past their end date` : 'Talk to them now'} tone={rn.in30.count || rn.overdue.count ? 'busy' : undefined} />
        <Mini label="Ending in 31 to 60 days" value={group(rn.in60)} tone={rn.in60.count ? 'hold' : undefined} />
        <Mini label="Ending in 61 to 90 days" value={group(rn.in90)} />
        <Mini label={`Lost in ${when}`} value={`${ch.lostCount} · ${moneyWhole(ch.lostMonthlyCents, cur)}/mo`} sub={ch.churnPct === null ? 'Nobody was running at the start' : `${ch.churnPct}% of the ${ch.atStart} running at the start`} tone={ch.lostCount ? 'busy' : 'ok'} />
        <Mini label={`New in ${when}`} value={`${ch.wonCount} · ${moneyWhole(ch.wonMonthlyCents, cur)}/mo`} sub={`${ch.activeNow} running today`} tone={ch.wonCount ? 'ok' : undefined} />
      </div>
      {rn.rows.length > 0 ? (
        <div className="surface-table mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ends</th>
                <th>Who</th>
                <th>What</th>
                <th className="r">Per month</th>
                <th className="r">Deposit held</th>
                <th className="r">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rn.rows.map((x) => {
                const c = x.contractId ? contracts.data?.find((k) => k.id === x.contractId) : undefined;
                return (
                  <tr key={`${x.kind}-${x.id}`}>
                    <td className="num whitespace-nowrap">
                      {fmtDate(x.endDate!)}
                      <span className={`block text-xs ${x.daysLeft < 0 ? 'font-semibold text-busy' : x.daysLeft <= 30 ? 'text-busy' : 'text-slate'}`}>{x.daysLeft < 0 ? `${-x.daysLeft} days past` : x.daysLeft === 0 ? 'Today' : `In ${x.daysLeft} days`}</span>
                    </td>
                    <td>
                      <Link to={`/members/${x.memberId}`} className="font-semibold hover:underline">
                        {x.name}
                      </Link>
                    </td>
                    <td>
                      {RENEWAL_KIND[x.kind]}
                      {x.space && <span className="block text-xs text-slate">{x.space}</span>}
                    </td>
                    <td className="r font-semibold">{money(x.monthlyCents, cur)}</td>
                    <td className="r">{x.depositHeldCents ? money(x.depositHeldCents, cur) : '—'}</td>
                    <td className="r whitespace-nowrap">
                      {c ? (
                        <Button small onClick={() => setExtending(c)}>
                          Extend
                        </Button>
                      ) : x.kind === 'plan' ? (
                        <Link to={`/members/${x.memberId}`} className="text-sm font-semibold underline underline-offset-2">
                          Renew
                        </Link>
                      ) : (
                        <Link to="/contracts" className="text-sm font-semibold underline underline-offset-2">
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="surface mt-3 px-4 py-3 text-sm text-slate">No contract or plan period ends in the next 90 days.</p>
      )}
      {ch.lost.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Who left in {when} ({ch.lost.length})
          </summary>
          <ul className="surface mt-2 divide-y divide-line px-4">
            {ch.lost.map((x) => (
              <li key={`${x.kind}-${x.id}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span>
                  <Link to={`/members/${x.memberId}`} className="font-semibold hover:underline">
                    {x.name}
                  </Link>
                  <span className="text-slate">
                    {' '}
                    · {RENEWAL_KIND[x.kind]}
                    {x.space ? `, ${x.space}` : ''} · ended {fmtDate(x.endDate!)}
                  </span>
                </span>
                <span className="num">{money(x.monthlyCents, cur)}/mo</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-2 text-xs text-slate">A contract or plan period counts as lost when it reached its end date without being extended or renewed. Extending a contract or renewing a plan takes it off this list.</p>
      <Modal open={extending !== null} onClose={() => setExtending(null)} title="Extend the contract">
        {extending && <ExtendForm contract={extending} onDone={() => setExtending(null)} />}
      </Modal>
    </Section>
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

  const cm = r.currentMonth;
  const chn = r.channels;
  const channelTrend = c ? channelsByMonth(c) : null;
  const deposits = r.deposits;

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
        <Figure label={profit ? 'Profit' : 'Loss'} value={moneyWhole(Math.abs(netCents), cur)} tone={resultTone === 'neutral' ? undefined : resultTone} sub={taxCents > 0 ? `Not counting ${moneyWhole(taxCents, cur)} tax collected · ${marginNote(netCents, incomeCents)}` : marginNote(netCents, incomeCents)} />
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

      {show.owed && cm && (
        <Section title={`${fmtMonth(cm.month)}: invoiced, collected and overdue`} aside="This calendar month, whatever period is picked">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Mini label="Invoiced this month" value={moneyWhole(cm.invoicedCents, cur)} sub={`${cm.invoiceCount} ${cm.invoiceCount === 1 ? 'invoice' : 'invoices'}, advances included`} />
            <Mini label="Collected this month" value={moneyWhole(cm.collectedCents, cur)} sub="All money that arrived, any invoice" tone="ok" />
            <Mini label="Still to pay on this month's invoices" value={moneyWhole(cm.owedOnMonthInvoicesCents, cur)} sub={cm.collectionRatePct === null ? 'Nothing invoiced yet' : `${cm.collectionRatePct}% of this month's invoices is paid`} tone={cm.owedOnMonthInvoicesCents ? 'hold' : undefined} />
            <Mini label="Overdue now" value={moneyWhole(cm.overdueNowCents, cur)} sub={cm.overdueNowCount ? `${cm.overdueNowCount} ${cm.overdueNowCount === 1 ? 'invoice' : 'invoices'}, any month` : 'Nothing is overdue'} tone={cm.overdueNowCents ? 'busy' : 'ok'} />
          </div>
          {cm.pendingChequesCents > 0 && (
            <p className="mt-2 text-sm text-slate">
              {money(cm.pendingChequesCents, cur)} in cheques is waiting to clear and is not counted as collected yet.{' '}
              <Link to={withPeriod('/finance/channel/cheque', months)} className="font-semibold text-ink underline underline-offset-2">
                See the cheques
              </Link>
            </p>
          )}
        </Section>
      )}

      {chn && (
        <Section title="Your money, and what is not yours" aside={`At the end of ${r.asOf ? fmtDate(r.asOf) : 'the period'}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Mini label="Cash in hand" value={moneyWhole(chn.cashInHandCents, cur)} sub="What should be in the till" />
            <Mini label="In the bank" value={moneyWhole(chn.bankCents, cur)} sub="Card, online transfers and cleared cheques" />
            <Mini label="Cheques waiting to clear" value={moneyWhole(chn.pendingCheques.amountCents, cur)} sub={chn.pendingCheques.count ? `${chn.pendingCheques.count} ${chn.pendingCheques.count === 1 ? 'cheque' : 'cheques'}, not counted anywhere yet` : 'None'} tone={chn.pendingCheques.count ? 'hold' : undefined} />
            <Mini label="Security deposits held (liability)" value={moneyWhole(deposits.heldCents, cur)} sub="Inside the cash and bank figures, but owed back to members" tone={deposits.heldCents ? 'busy' : undefined} />
          </div>
          <p className="mt-2 text-xs text-slate">
            Cash and bank are every recorded movement since the space started using the system: money in less refunds and expenses paid that way. Count them against the drawer and the bank statement. Security deposits sit in the till or the bank but belong to members until they are returned or kept; advances are income from the day they arrive.
          </p>
        </Section>
      )}

      {chn && (
        <div className="grid gap-10 min-[1800px]:grid-cols-2">
          <Section title="Collections by channel" aside={`In ${when}`}>
            <div className="surface-table">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th className="r">Received</th>
                    <th className="r">Share</th>
                    <th className="r">Out</th>
                    <th className="r">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {chn.flows.map((f) => (
                    <tr key={f.method}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block size-2.5 rounded-sm" style={{ background: CHANNEL_COLOR[f.method] }} aria-hidden />
                          <Link to={withPeriod(`/finance/channel/${slugOf(f.method)}`, months)} className="font-semibold hover:underline">
                            {methodName(f.method)}
                          </Link>
                        </span>
                        {f.depositsInCents > 0 && <span className="block text-xs text-slate">+ {money(f.depositsInCents, cur)} security deposits</span>}
                      </td>
                      <td className="r whitespace-nowrap font-semibold">{money(f.salesInCents, cur)}</td>
                      <td className="r num">{f.sharePct}%</td>
                      <td className="r whitespace-nowrap text-busy">{f.refundsOutCents + f.expensesOutCents ? money(-(f.refundsOutCents + f.expensesOutCents), cur) : '—'}</td>
                      <td className="r whitespace-nowrap font-semibold">{money(f.netCents, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-3 py-2.5 text-sm font-semibold">All channels</td>
                    <td className="r whitespace-nowrap px-3 py-2.5 font-bold">{money(chn.salesInCents, cur)}</td>
                    <td className="r px-3 py-2.5">100%</td>
                    <td className="r whitespace-nowrap px-3 py-2.5 text-busy">{money(-chn.flows.reduce((s, f) => s + f.refundsOutCents + f.expensesOutCents, 0), cur)}</td>
                    <td className="r whitespace-nowrap px-3 py-2.5 font-bold">{money(chn.flows.reduce((s, f) => s + f.netCents, 0), cur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate">Received is invoice payments and advances, tax included; a cheque counts once it clears. Out is refunds and expenses paid through that channel. Security deposits kept as income moved no money, so they are in no channel.</p>
          </Section>
          <Section title="Channels, month by month">
            <div className="surface p-4 sm:p-5">
              {charts.isLoading ? (
                <Loading />
              ) : charts.error ? (
                <ErrorNote error={charts.error} onRetry={() => void charts.refetch()} retrying={charts.isFetching} />
              ) : channelTrend && channelTrend.series.length ? (
                <ColumnChart data={channelTrend} stacked totalLabel="All channels" currency={cur} label="Money received by channel, month by month" categoryLabel={monthName} shortLabel={monthShort} />
              ) : (
                <p className="text-sm text-slate">No money came in during this period.</p>
              )}
            </div>
          </Section>
        </div>
      )}

      <div className="grid gap-10 xl:grid-cols-2">
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
      </div>

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
        <Section title="What the income was for" aside="Before tax">
          <BarList rows={byCategory} currency={cur} color={MONEY_COLOR.in} label="Income by what was sold" empty="No income in this period." />
        </Section>
        <Section title="Where it went">
          <BarList
            rows={ranked(r.expensesByCategory.map((e) => ({ key: e.category, label: titleCase(e.category), cents: e.amountCents })))}
            currency={cur}
            color={MONEY_COLOR.out}
            label="Expenses by category"
            empty="No expenses recorded in this period."
          />
        </Section>
      </div>

      <Section title="Income by plan and by space" aside="Before tax">
        {charts.isLoading ? (
          <Loading />
        ) : charts.error ? (
          <ErrorNote error={charts.error} onRetry={() => void charts.refetch()} retrying={charts.isFetching} />
        ) : c ? (
          <div className="grid gap-10 lg:grid-cols-2">
            <BarList rows={ranked(c.incomeByPlan.map((x) => ({ key: x.planId, label: x.name || 'A plan', cents: x.amountCents })))} currency={cur} color={SERIES_PLAN} label="Income by plan" empty="No plan income in this period." />
            <BarList rows={ranked(c.incomeBySpace.map((x) => ({ key: x.resourceId, label: x.name || 'A space', sub: titleCase(x.kind), cents: x.amountCents })))} currency={cur} color={SERIES_SPACE} label="Income by space" empty="No income tied to a single space in this period." />
          </div>
        ) : null}
      </Section>

      {show.owed && (
        <Section title="Who still owes you: receivables aging" aside={`${moneyWhole(owedCents, cur)} at the end of ${r.asOf ? fmtDate(r.asOf) : 'the period'}`}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Mini label="Not yet due" value={moneyWhole(ag.current.amountCents, cur)} sub={`${ag.current.count} ${ag.current.count === 1 ? 'invoice' : 'invoices'}`} />
              <Mini label="0 to 30 days late" value={moneyWhole(ag.days1to30.amountCents, cur)} sub={`${ag.days1to30.count} ${ag.days1to30.count === 1 ? 'invoice' : 'invoices'}`} tone={ag.days1to30.amountCents ? 'hold' : undefined} />
              <Mini label="31 to 60 days late" value={moneyWhole(ag.days31to60.amountCents, cur)} sub={`${ag.days31to60.count} ${ag.days31to60.count === 1 ? 'invoice' : 'invoices'}`} tone={ag.days31to60.amountCents ? 'busy' : undefined} />
              <Mini label="Over 60 days late" value={moneyWhole(ag.days61plus.amountCents, cur)} sub={`${ag.days61plus.count} ${ag.days61plus.count === 1 ? 'invoice' : 'invoices'}`} tone={ag.days61plus.amountCents ? 'busy' : undefined} />
            </div>
            <div className="surface p-4 sm:p-5">
              <SegmentedBar parts={agingParts(r)} currency={cur} label="What is owed, by how late it is" />
            </div>
            {r.agingByMember && r.agingByMember.length > 0 && (
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">By member</h3>
                  <Button
                    small
                    onClick={() =>
                      downloadCsv('receivables-aging.csv', [
                        ['Member', 'Company', 'Not yet due', '0-30 days', '31-60 days', 'Over 60 days', 'Total', 'Oldest due date'],
                        ...r.agingByMember!.map((a) => [a.name, a.company, csvAmount(a.currentCents), csvAmount(a.days1to30Cents), csvAmount(a.days31to60Cents), csvAmount(a.days61plusCents), csvAmount(a.totalCents), a.oldestDue]),
                      ])
                    }
                  >
                    Export
                  </Button>
                </div>
                <div className="surface-table">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th className="r">Not yet due</th>
                        <th className="r">0–30 days</th>
                        <th className="r">31–60 days</th>
                        <th className="r">Over 60</th>
                        <th className="r">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.agingByMember.slice(0, 25).map((a) => (
                        <tr key={a.memberId}>
                          <td>
                            <Link to={`/members/${a.memberId}`} className="font-semibold hover:underline">
                              {a.name}
                            </Link>
                            {a.company && <span className="block text-xs text-slate">{a.company}</span>}
                          </td>
                          <td className="r num">{a.currentCents ? money(a.currentCents, cur) : '—'}</td>
                          <td className="r num">{a.days1to30Cents ? money(a.days1to30Cents, cur) : '—'}</td>
                          <td className={`r num ${a.days31to60Cents ? 'text-busy' : ''}`}>{a.days31to60Cents ? money(a.days31to60Cents, cur) : '—'}</td>
                          <td className={`r num ${a.days61plusCents ? 'font-semibold text-busy' : ''}`}>{a.days61plusCents ? money(a.days61plusCents, cur) : '—'}</td>
                          <td className="r font-semibold">{money(a.totalCents, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {r.agingByMember.length > 25 && <p className="mt-2 text-xs text-slate">The 25 largest balances. Export for everyone ({r.agingByMember.length}).</p>}
              </div>
            )}
            {!r.agingByMember && mayInvoices && debtors && (
              <BarList
                rows={debtors.rows.map((d) => ({ ...d, sub: [d.sub, d.overdueCents > 0 ? `${money(d.overdueCents, cur)} overdue` : '', `${d.count} ${d.count === 1 ? 'invoice' : 'invoices'}`].filter(Boolean).join(' · ') }))}
                others={debtors.others ? { label: 'Everyone else who owes', cents: debtors.others.cents } : null}
                currency={cur}
                color={MONEY_COLOR.in}
                label="Open balances by member"
                empty="Nobody owes anything."
              />
            )}
            {c && c.months.length > 1 && (
              <div className="surface p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold">At the end of each month</h3>
                <ColumnChart data={balancesByMonth(c)} currency={cur} label="What was owed, the overdue part, and the security deposits held, at the end of each month" categoryLabel={monthName} shortLabel={monthShort} />
              </div>
            )}
          </div>
        </Section>
      )}

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

      <Renewals r={r} when={when} />

      {(deposits.heldCents > 0 || deposits.movements.length > 0 || deposits.advanceCents > 0) && (
        <Section
          title="Security deposits and advances"
          aside={
            <Button small onClick={() => downloadCsv('contract-money.csv', [['Date', 'Member', 'Space', 'What happened', 'How', 'Reference', 'Amount'], ...depositRows(deposits.movements, loc.timezone)])} disabled={!deposits.movements.length}>
              Export
            </Button>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Security deposits: a liability, not income</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Mini label="Held for members" value={moneyWhole(deposits.heldCents, cur)} sub={`At the end of ${r.asOf ? fmtDate(r.asOf) : 'the period'}`} tone={deposits.heldCents ? 'busy' : undefined} />
                <Mini label="Received" value={moneyWhole(deposits.receivedCents, cur)} sub={`In ${when}`} />
                <Mini label="Returned" value={moneyWhole(deposits.refundedCents, cur)} sub={`In ${when}`} />
                <Mini label="Kept (became income)" value={moneyWhole(deposits.keptCents, cur)} sub={`In ${when}, already in money in`} />
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Advances: income when received</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Mini label="Received" value={moneyWhole(deposits.advanceCents, cur)} sub={`In ${when}, already in money in`} tone="ok" />
                <Mini label="Not yet used on invoices" value={moneyWhole(r.unapplied?.advancesCents ?? 0, cur)} sub="Comes off their next invoices" />
              </div>
            </div>
          </div>
          {deposits.movements.length > 0 && (
            <div className="surface-table mt-4">
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
                  {deposits.movements.map((m) => (
                    <tr key={m.id} className={m.status && m.status !== 'cleared' ? 'text-slate' : undefined}>
                      <td className="num whitespace-nowrap">{fmtDate(localDateOf(m.occurredAt, loc.timezone))}</td>
                      <td>
                        <span className="font-semibold">{m.memberName}</span>
                        {m.resourceName && <span className="block text-xs text-slate">{m.resourceName}</span>}
                      </td>
                      <td>{MOVE_WORD[m.kind]}</td>
                      <td>
                        {[m.method ? methodName(m.method) : '', m.reference].filter(Boolean).join(', ') || '—'}
                        {m.method === 'cheque' && m.status && (
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <ChequeChip status={m.status} />
                            {m.status === 'pending' && <ChequeActions source="entry" id={m.id} />}
                          </span>
                        )}
                      </td>
                      <td className={`r font-semibold ${m.status === 'bounced' ? 'line-through' : ''}`}>{money(m.amountCents, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {(r.amenities.owedCents > 0 || r.amenities.collectedCents > 0) && (
        <Section title="Amenities to collect" aside={`${moneyWhole(r.amenities.collectedCents, cur)} collected in ${when}`}>
          {r.amenities.owedBy.length === 0 ? (
            <p className="text-sm text-slate">Nothing is owed for tea, coffee or food.</p>
          ) : (
            <ul className="surface divide-y divide-line px-4">
              {r.amenities.owedBy.map((o) => (
                <li key={o.memberId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-semibold">{o.name}</span>
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="num font-semibold">{money(o.owedCents, cur)}</span>
                    {show.collectAmenities && <CollectButton memberId={o.memberId} label="Mark collected" />}
                    {mayInvoices && <InvoiceAmenitiesButton memberId={o.memberId} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate">Beyond each member's free amount for the day. Collect it at the desk (pick how they paid), or add it to the member's invoice. It counts as income once it is collected or the invoice is paid.</p>
        </Section>
      )}
    </div>
  );
}
