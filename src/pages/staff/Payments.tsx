import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '../../api';
import { useLocation } from '../../auth';
import { Button, Empty, ErrorNote, Field, Input, Loading, Select } from '../../components/ui';
import { downloadCsv, fromCents, METHOD_LABEL, money } from '../../lib/format';
import { fmtDate, localDateOf, todayIn } from '../../lib/time';
import type { PaymentRow } from '../../types';

export default function Payments() {
  const loc = useLocation();
  const today = todayIn(loc.timezone);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [method, setMethod] = useState('');

  const list = useQuery({
    queryKey: ['payments', loc.id, from, to, method],
    queryFn: () => api.get<PaymentRow[]>('/payments', { locationId: loc.id, from, to, method }),
  });
  const rows = list.data ?? [];
  const total = rows.reduce((s, p) => s + p.amountCents, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From">
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Any method</option>
            {Object.entries(METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          className="ml-auto"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv('payments.csv', [
              ['Date', 'Invoice', 'Member', 'Method', 'Reference', 'Amount'],
              ...rows.map((p) => [localDateOf(p.paidAt, loc.timezone), p.invoiceNumber, p.memberName, p.method, p.reference, fromCents(p.amountCents)]),
            ])
          }
        >
          <Download size={15} /> Export
        </Button>
      </div>

      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : rows.length === 0 ? (
        <Empty title="No payments in this period" hint="Record payments from an invoice." />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Member</th>
                <th>Paid by</th>
                <th>Reference</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="num whitespace-nowrap">{fmtDate(localDateOf(p.paidAt, loc.timezone))}</td>
                  <td>
                    <Link to={`/finance/invoices/${p.invoiceId}`} className="font-semibold underline-offset-2 hover:underline">
                      {p.invoiceNumber}
                    </Link>
                  </td>
                  <td>{p.memberName}</td>
                  <td>{METHOD_LABEL[p.method]}</td>
                  <td className="text-slate">{p.reference || '—'}</td>
                  <td className="r font-semibold">{money(p.amountCents, loc.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-semibold">
                  {rows.length} {rows.length === 1 ? 'payment' : 'payments'}, total
                </td>
                <td className="r px-3 py-2.5 font-bold">{money(total, loc.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
