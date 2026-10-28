import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '../../api';
import { Button, Empty, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { downloadCsv, fromCents, METHOD_LABEL, money } from '../../lib/format';
import { fmtDate, localDateOf } from '../../lib/time';
import type { PlatformPayment } from '../../types';

export default function PlatformPayments() {
  const q = useQuery({ queryKey: ['platform', 'payments'], queryFn: () => api.get<PlatformPayment[]>('/platform/payments') });
  const rows = q.data ?? [];
  const total = rows.reduce((s, p) => s + p.amountCents, 0);

  return (
    <>
      <PageHeader title="Payments" sub="Subscription money received from coworking spaces.">
        <Button
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv('platform-payments.csv', [
              ['Received', 'Coworking space', 'Package', 'Covers from', 'Covers to', 'Method', 'Reference', 'Amount (PKR)'],
              ...rows.map((p) => [localDateOf(p.paidAt, 'Asia/Karachi'), p.organizationName ?? '', p.packageName ?? '', p.periodStart, p.periodEnd, p.method, p.reference, fromCents(p.amountCents)]),
            ])
          }
        >
          <Download size={15} /> Export
        </Button>
      </PageHeader>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : rows.length === 0 ? (
        <Empty title="No payments yet" hint="Record a payment from a coworking space's page. It extends their subscription." />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Received</th>
                <th>Coworking space</th>
                <th>Package</th>
                <th>Covers</th>
                <th>Paid by</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="num whitespace-nowrap">{fmtDate(localDateOf(p.paidAt, 'Asia/Karachi'))}</td>
                  <td>
                    <Link to={`/spaces/${p.organizationId}`} className="font-semibold underline-offset-2 hover:underline">
                      {p.organizationName}
                    </Link>
                  </td>
                  <td>{p.packageName}</td>
                  <td className="num whitespace-nowrap">
                    {fmtDate(p.periodStart)} to {fmtDate(p.periodEnd)}
                  </td>
                  <td>
                    {METHOD_LABEL[p.method]}
                    {p.reference && <span className="text-slate">, {p.reference}</span>}
                  </td>
                  <td className="r font-semibold">{money(p.amountCents, 'PKR')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-semibold">
                  {rows.length} {rows.length === 1 ? 'payment' : 'payments'}, total
                </td>
                <td className="r px-3 py-2.5 font-bold">{money(total, 'PKR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
