import { Link, Navigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useLocation } from '../../auth';
import { ChequeActions, ChequeChip } from '../../components/ChequeActions';
import { Button, Empty, ErrorNote, Ledger, Loading, Section } from '../../components/ui';
import { keepWithinLocation } from '../../lib/financePeriod';
import { csvAmount, downloadCsv, money, moneyWhole, MONEY_STATUS_LABEL } from '../../lib/format';
import { qd } from '../../lib/queryDefs';
import { fmtDate, localDateOf, todayIn } from '../../lib/time';
import { CHANNEL_TABS, PERIOD_WORD, PeriodPicker, useFinancePeriod } from './Finance';

const KIND_WORD = { invoice: 'Invoice payment', advance: 'Advance', deposit: 'Security deposit' } as const;

/** A row of figures that belong together, side by side. */
function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'busy' | 'hold' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'busy' ? 'text-busy' : tone === 'hold' ? 'text-hold' : '';
  return (
    <div className="surface p-4">
      <p className="text-sm font-semibold text-slate">{label}</p>
      <p className={`display mt-1 text-[1.4rem] leading-tight ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate">{sub}</p>}
    </div>
  );
}

/** Cheques still waiting for the bank: on invoices, and for advances and security deposits. Each can be marked cleared or bounced. */
function WaitingCheques() {
  const loc = useLocation();
  const q = useQuery(qd.cheques(loc.id, 'pending'));
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  const rows = q.data ?? [];
  const total = rows.reduce((s, c) => s + c.amountCents, 0);
  return (
    <Section title="Waiting to clear" aside={rows.length ? `${rows.length} ${rows.length === 1 ? 'cheque' : 'cheques'}, ${money(total, loc.currency)}` : undefined}>
      {rows.length === 0 ? (
        <p className="surface px-4 py-3 text-sm text-slate">No cheques are waiting to clear.</p>
      ) : (
        <>
          <div className="surface-table">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>From</th>
                  <th>For</th>
                  <th>Cheque</th>
                  <th className="r">Amount</th>
                  <th className="r">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={`${c.source}-${c.id}`}>
                    <td className="num whitespace-nowrap">{fmtDate(localDateOf(c.receivedAt, loc.timezone))}</td>
                    <td className="font-semibold">{c.memberId ? <Link to={`/members/${c.memberId}`} className="hover:underline">{c.who}</Link> : c.who}</td>
                    <td>
                      {KIND_WORD[c.kind]}
                      {c.invoiceId && (
                        <>
                          {', '}
                          <Link to={`/finance/invoices/${c.invoiceId}`} className="underline-offset-2 hover:underline">
                            {c.invoiceNumber}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="text-slate">{c.reference || '—'}</td>
                    <td className="r font-semibold">{money(c.amountCents, loc.currency)}</td>
                    <td className="r">
                      <ChequeActions source={c.source} id={c.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate">A cheque counts for nothing until it clears: the invoice stays open, an advance is not taken off any bill and a deposit is not held. Mark it cleared on the day the bank clears it, or bounced if it comes back.</p>
        </>
      )}
    </Section>
  );
}

/**
 * One channel's page: what came in and went out through cash, card, online transfer or cheque in the period, the balance it leaves (the
 * till for cash, the bank for the others), and every movement. The cheque page starts with the cheques still waiting to clear.
 */
export default function FinanceChannel() {
  const { channel = '' } = useParams();
  const tab = CHANNEL_TABS.find((c) => c.slug === channel);
  const loc = useLocation();
  const { months, setMonths } = useFinancePeriod();
  const q = useQuery({ ...qd.channelBook(loc.id, todayIn(loc.timezone), months, tab?.method ?? 'cash'), placeholderData: keepWithinLocation(loc.id), enabled: !!tab });
  if (!tab) return <Navigate to="/finance/overview" replace />;
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  const b = q.data;
  const cur = b.currency;
  const when = PERIOD_WORD[months];
  const cash = tab.method === 'cash';
  const cheque = tab.method === 'cheque';
  const outCents = b.refundsOutCents + b.expensesOutCents;
  const counted = b.rows.filter((r) => r.status === 'cleared');

  return (
    <div className={`space-y-8 transition-opacity ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[15px]">
          In {when}, <strong className="num">{moneyWhole(b.salesInCents, cur)}</strong> came in by {tab.label.toLowerCase()} for what was sold
          {b.depositsInCents > 0 && <> and <strong className="num">{moneyWhole(b.depositsInCents, cur)}</strong> in security deposits</>}, and <strong className="num">{moneyWhole(outCents, cur)}</strong> went out.
        </p>
        <PeriodPicker months={months} setMonths={setMonths} updating={q.isPlaceholderData} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Sales received" value={moneyWhole(b.salesInCents, cur)} sub="Invoice payments and advances" tone="ok" />
        <Tile label="Security deposits in" value={moneyWhole(b.depositsInCents, cur)} sub="Held for members, not income" />
        <Tile label="Money out" value={moneyWhole(outCents, cur)} sub={`${money(b.refundsOutCents, cur)} given back, ${money(b.expensesOutCents, cur)} expenses`} tone={outCents > 0 ? 'busy' : undefined} />
        <Tile label="Net for the period" value={moneyWhole(b.netCents, cur)} sub="In less out" tone={b.netCents < 0 ? 'busy' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={cash ? 'Cash in hand' : 'In the bank'}>
          <Ledger
            rows={[
              ...(cash
                ? [{ label: 'Cash that should be in the till', value: money(b.balanceEndCents, cur), note: `At the end of ${b.to === todayIn(loc.timezone) ? 'today' : fmtDate(b.to)}` }]
                : [
                    { label: `${tab.label} share of the bank`, value: money(b.balanceEndCents, cur) },
                    { label: 'Bank balance, all channels', value: money(b.bankCents, cur), note: 'Card, online transfers and cleared cheques' },
                  ]),
              { label: cash ? 'Bank balance, for comparison' : 'Cash in hand, for comparison', value: money(cash ? b.bankCents : b.cashInHandCents, cur) },
            ]}
          />
          <p className="mt-2 text-xs text-slate">Everything recorded since the space started using the system, in less out. Count it against the {cash ? 'cash drawer' : 'bank statement'}: a difference means something was not recorded.</p>
        </Section>
        {cheque ? (
          <Section title="Cheques at a glance">
            <Ledger
              rows={[
                { label: 'Waiting to clear', value: money(b.pending.amountCents, cur), note: `${b.pending.count} in ${when}`, tone: b.pending.count ? 'busy' : undefined },
                { label: 'Cleared', value: money(b.salesInCents + b.depositsInCents, cur), tone: 'ok' },
                { label: 'Bounced', value: money(b.rows.filter((r) => r.status === 'bounced').reduce((s, r) => s + r.amountCents, 0), cur), note: `${b.rows.filter((r) => r.status === 'bounced').length} in ${when}` },
              ]}
            />
          </Section>
        ) : (
          <Section title="Where it came from and went">
            <Ledger
              rows={[
                { label: 'Invoice payments and advances', value: money(b.salesInCents, cur), tone: 'ok' },
                { label: 'Security deposits received', value: money(b.depositsInCents, cur) },
                { label: 'Payments, advances and deposits given back', value: money(-b.refundsOutCents, cur), tone: b.refundsOutCents ? 'busy' : undefined },
                { label: 'Expenses paid', value: money(-b.expensesOutCents, cur), tone: b.expensesOutCents ? 'busy' : undefined },
              ]}
            />
          </Section>
        )}
      </div>

      {cheque && <WaitingCheques />}

      <Section
        title="Every movement"
        aside={
          <Button
            small
            disabled={!b.rows.length}
            onClick={() =>
              downloadCsv(`${tab.slug}-${b.from}-to-${b.to}.csv`, [
                ['Date', 'What', 'Who', 'Reference', 'Status', 'Amount'],
                ...b.rows.map((r) => [localDateOf(r.at, loc.timezone), r.label, r.who, r.reference, MONEY_STATUS_LABEL[r.status], csvAmount(r.amountCents)]),
              ])
            }
          >
            <Download size={14} /> Export
          </Button>
        }
      >
        {b.rows.length === 0 ? (
          <Empty title={`Nothing went through ${tab.label.toLowerCase()} in ${when}`} />
        ) : (
          <div className="surface-table">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>What</th>
                  <th>Who</th>
                  <th>Reference</th>
                  {cheque && <th>Status</th>}
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className={r.status === 'cleared' ? undefined : 'text-slate'}>
                    <td className="num whitespace-nowrap">{fmtDate(localDateOf(r.at, loc.timezone))}</td>
                    <td>{r.invoiceId ? <Link to={`/finance/invoices/${r.invoiceId}`} className="hover:underline">{r.label}</Link> : r.label}</td>
                    <td>{r.memberId ? <Link to={`/members/${r.memberId}`} className="hover:underline">{r.who}</Link> : r.who || '—'}</td>
                    <td className="text-slate">{r.reference || '—'}</td>
                    {cheque && (
                      <td>
                        <ChequeChip status={r.status} />
                      </td>
                    )}
                    <td className={`r font-semibold ${r.amountCents < 0 ? 'text-busy' : ''} ${r.status === 'bounced' ? 'line-through' : ''}`}>{money(r.amountCents, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={cheque ? 5 : 4} className="px-3 py-2.5 text-right text-sm font-semibold">
                    Net, counting only money that arrived
                  </td>
                  <td className="r px-3 py-2.5 font-bold">{money(counted.reduce((s, r) => s + r.amountCents, 0), cur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
