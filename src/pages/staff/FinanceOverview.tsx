import { CountText } from '../../components/Count';
import { Link } from 'react-router';
import { MoneyChart } from '../../components/MoneyChart';
import { Bars } from '../../components/Bars';
import { Button, ErrorNote, Loading, Section } from '../../components/ui';
import { useFeature } from '../../auth';
import { downloadCsv, METHOD_LABEL, money, moneyWhole, titleCase } from '../../lib/format';
import { depositRows } from '../../components/ContractPrint';
import { fmtDate } from '../../lib/time';
import type { FinanceReport } from '../../types';
import { PERIOD_WORD, PeriodPicker, useFinancePeriod, useFinanceReport } from './Finance';

export const INCOME_LABEL = { subscription: 'Memberships and plans', manual: 'Rooms, desks and other charges', kept_deposit: 'Security deposits we kept', advance: 'Advance rent from contracts' } as const;

const MOVE_WORD = { received: 'Security deposit received', refunded: 'Security deposit returned', kept: 'Security deposit kept as income', advance: 'Advance received' } as const;

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
      <p className={`display num mt-2 text-[1.75rem] leading-tight ${tone === 'ok' ? 'text-ok' : tone === 'busy' ? 'text-busy' : ''}`}>
        <CountText text={value} />
      </p>
      {sub && <p className={`mt-1 text-xs font-semibold ${note ?? 'text-slate'}`}>{sub}</p>}
    </div>
  );
}

export default function FinanceOverview() {
  const { months, setMonths } = useFinancePeriod();
  const invoicing = useFeature('invoicing');
  const q = useFinanceReport(months);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const r: FinanceReport = q.data;
  const cur = r.currency;
  const { collectedCents: inCents, expensesCents: outCents, netCents } = r.totals;
  const profit = netCents >= 0;
  const margin = inCents > 0 ? Math.round((netCents / inCents) * 100) : null;
  const ag = r.receivablesAging;
  const lateCents = ag.days1to30.amountCents + ag.days31to60.amountCents + ag.days61plus.amountCents;
  const lateCount = ag.days1to30.count + ag.days31to60.count + ag.days61plus.count;
  const owedCents = lateCents + ag.current.amountCents;
  const inChange = change(inCents, r.previous.collectedCents, true);
  const outChange = change(outCents, r.previous.expensesCents, false);
  const when = PERIOD_WORD[months] ?? 'this period';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[15px]">
          In {when} you took in <strong className="num">{moneyWhole(inCents, cur)}</strong> and spent <strong className="num">{moneyWhole(outCents, cur)}</strong>
          {inCents === 0 && outCents === 0 ? '.' : profit ? (
            <>
              , leaving a <strong className="num text-ok">profit of {moneyWhole(netCents, cur)}</strong>.
            </>
          ) : (
            <>
              , a <strong className="num text-busy">loss of {moneyWhole(-netCents, cur)}</strong>.
            </>
          )}
        </p>
        <PeriodPicker months={months} setMonths={setMonths} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Money in" value={moneyWhole(inCents, cur)} sub={inChange.text} note={inChange.tone} />
        <Figure label="Money out" value={moneyWhole(outCents, cur)} sub={outChange.text} note={outChange.tone} />
        <Figure
          label={profit ? 'Profit' : 'Loss'}
          value={moneyWhole(Math.abs(netCents), cur)}
          tone={profit ? 'ok' : 'busy'}
          sub={margin === null ? 'No income yet' : `${margin}% of money in`}
        />
        <Figure label="Still owed to you" value={moneyWhole(owedCents, cur)} sub={lateCount > 0 ? `${moneyWhole(lateCents, cur)} is overdue` : 'Nothing is overdue'} note={lateCount > 0 ? 'text-busy' : 'text-ok'} />
      </div>

      {(r.deposits.heldCents > 0 || r.deposits.movements.length > 0) && (
        <Section
          title="Advances and security deposits"
          aside={
            <Button small onClick={() => downloadCsv('contract-money.csv', [['Date', 'Member', 'Space', 'What happened', 'How', 'Reference', 'Amount'], ...depositRows(r.deposits.movements)])} disabled={!r.deposits.movements.length}>
              Export
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Figure label="Security deposits you hold" value={moneyWhole(r.deposits.heldCents, cur)} sub="Belongs to members, not income" />
            <Figure label="Security deposits received" value={moneyWhole(r.deposits.receivedCents, cur)} sub={`In ${when}`} />
            <Figure label="Security deposits returned" value={moneyWhole(r.deposits.refundedCents, cur)} sub={`In ${when}`} />
            <Figure label="Advances received" value={moneyWhole(r.deposits.advanceCents, cur)} sub="Income, already in money in" />
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
                      <td className="num whitespace-nowrap">{fmtDate(m.occurredAt.slice(0, 10))}</td>
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

      {invoicing && lateCount > 0 && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-busy/25 bg-busy-wash px-4 py-3 text-sm">
          <span>
            <strong>{lateCount} {lateCount === 1 ? 'invoice is' : 'invoices are'} overdue</strong>, {moneyWhole(lateCents, cur)} in all.
          </span>
          <Link to="/finance/invoices" className="font-semibold underline underline-offset-2">
            See the invoices
          </Link>
        </p>
      )}

      <Section title="Money in and out, month by month" aside={<Link to="/finance/profit-loss" className="font-semibold text-ink underline underline-offset-2">Full profit and loss</Link>}>
        <div className="surface p-5">
          <MoneyChart data={r.monthly} currency={cur} />
        </div>
      </Section>

      <div className="grid gap-8 md:grid-cols-3">
        <Section title="Where the money came from">
          <Bars rows={r.incomeByKind.map((i) => ({ label: INCOME_LABEL[i.kind], cents: i.amountCents })).filter((i) => i.cents > 0)} currency={cur} />
        </Section>
        <Section title="Where it went">
          <Bars rows={r.expensesByCategory.map((e) => ({ label: titleCase(e.category), cents: e.amountCents }))} currency={cur} />
        </Section>
        <Section title="How members paid">
          <Bars rows={r.paymentsByMethod.map((p) => ({ label: METHOD_LABEL[p.method as keyof typeof METHOD_LABEL] ?? titleCase(p.method), cents: p.amountCents }))} currency={cur} />
        </Section>
      </div>

      {invoicing && (
        <Section title="Who still owes you" aside={moneyWhole(owedCents, cur)}>
          <div className="surface-table">
            <table className="tbl">
              <thead>
                <tr>
                  <th>How late</th>
                  <th className="r">Invoices</th>
                  <th className="r">Amount owed</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['current', 'Not yet due'],
                    ['days1to30', '1 to 30 days late'],
                    ['days31to60', '31 to 60 days late'],
                    ['days61plus', 'Over 60 days late'],
                  ] as const
                ).map(([key, label]) => (
                  <tr key={key}>
                    <td className={key === 'days61plus' && ag[key].count > 0 ? 'font-semibold text-busy' : ''}>{label}</td>
                    <td className="r">{ag[key].count}</td>
                    <td className="r font-semibold">{moneyWhole(ag[key].amountCents, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
