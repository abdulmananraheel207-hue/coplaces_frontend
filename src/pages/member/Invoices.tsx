import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useLocation } from '../../auth';
import { Chip, Empty, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { money, titleCase } from '../../lib/format';
import { fmtDate } from '../../lib/time';
import type { InvoiceRow } from '../../types';

export default function MemberInvoices() {
  const loc = useLocation();
  const list = useQuery({ queryKey: ['invoices', loc.id, 'mine'], queryFn: () => api.get<InvoiceRow[]>('/invoices', { locationId: loc.id }) });
  const rows = list.data ?? [];
  const due = rows.filter((i) => i.status === 'open').reduce((s, i) => s + i.balanceCents, 0);

  return (
    <>
      <PageHeader title="Invoices" sub={due > 0 ? `${money(due, loc.currency)} due` : 'You are all paid up'} />
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : rows.length === 0 ? (
        <Empty title="No invoices yet" hint="Your monthly invoice shows up here once it has been issued." />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th className="r">Total</th>
                <th className="r">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link to={`/invoices/${i.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {i.number}
                    </Link>
                  </td>
                  <td className="num whitespace-nowrap">{fmtDate(i.issueDate)}</td>
                  <td className="num whitespace-nowrap">{fmtDate(i.dueDate)}</td>
                  <td>
                    <Chip tone={i.status === 'paid' ? 'ok' : i.status === 'void' ? 'idle' : i.overdue ? 'busy' : 'hold'}>{i.status === 'open' && i.overdue ? 'Overdue' : titleCase(i.status)}</Chip>
                  </td>
                  <td className="r">{money(i.totalCents, loc.currency)}</td>
                  <td className="r font-semibold">{money(i.balanceCents, loc.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
