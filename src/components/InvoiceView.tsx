import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { can } from '../lib/permissions';
import { fromCents, METHOD_LABEL, money, titleCase, toCents } from '../lib/format';
import { useRefresh } from '../lib/queries';
import { fmtDate, localDateOf } from '../lib/time';
import type { InvoiceDetail, PaymentMethod } from '../types';
import { useToast } from './toast';
import { Button, Chip, ErrorNote, Field, Input, Loading, Modal, Select } from './ui';

function PaymentForm({ inv, onDone }: { inv: InvoiceDetail; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [amount, setAmount] = useState(fromCents(inv.balanceCents));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const cents = toCents(amount);
      if (!cents) throw new Error('Enter an amount greater than zero, like 150 or 99.50');
      if (cents > inv.balanceCents) throw new Error(`That is more than the ${money(inv.balanceCents, inv.currency)} still owed`);
      return api.post(`/invoices/${inv.id}/payments`, { amountCents: cents, method, reference, notes });
    },
    onSuccess: () => {
      toast.ok('Payment recorded');
      void refresh('invoice', 'invoices', 'payments', 'dashboard', 'member', 'reports');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-sm">
        Balance due on {inv.number}: <strong>{money(inv.balanceCents, inv.currency)}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Amount received (${inv.currency})`}>
          <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Reference (optional)" hint="Bank transfer ID, card receipt number, cheque number.">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
      </Field>
      <Field label="Note (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Record payment
        </Button>
      </div>
    </form>
  );
}

export function InvoiceView({ backTo, staff }: { backTo: string; staff: boolean }) {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefresh();
  const [paying, setPaying] = useState(false);
  const manager = can(user, 'billing_admin');

  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}`) });
  const voidIt = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/void`),
    onSuccess: () => {
      toast.ok('Invoice voided');
      void refresh('invoice', 'invoices', 'dashboard', 'member', 'bookings');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removePayment = useMutation({
    mutationFn: (paymentId: string) => api.del(`/payments/${paymentId}`),
    onSuccess: () => {
      toast.ok('Payment removed');
      void refresh('invoice', 'invoices', 'payments', 'dashboard', 'member', 'reports');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error ?? new Error('Invoice not found')} />;
  const inv = q.data;
  const cur = inv.currency;
  const tone = inv.status === 'paid' ? 'ok' : inv.status === 'void' ? 'idle' : inv.overdue ? 'busy' : 'hold';

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(backTo)} className="text-sm font-semibold underline underline-offset-2">
          Back to invoices
        </button>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>
            <Printer size={15} /> Print
          </Button>
          {staff && inv.status === 'open' && (
            <Button variant="primary" onClick={() => setPaying(true)}>
              Record payment
            </Button>
          )}
          {staff && manager && inv.status === 'open' && inv.paidCents === 0 && (
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Void ${inv.number}? Its bookings become billable again.`)) voidIt.mutate();
              }}
            >
              Void invoice
            </Button>
          )}
        </div>
      </div>

      <article className="surface mx-auto max-w-3xl p-6 sm:p-10" aria-label={`Invoice ${inv.number}`}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1 className="display text-[2rem]">Invoice {inv.number}</h1>
            <p className="mt-1 text-sm text-slate">
              {inv.location.name}
              {inv.location.address ? `, ${inv.location.address}` : ''}
            </p>
          </div>
          <Chip tone={tone}>{inv.status === 'open' && inv.overdue ? 'Overdue' : titleCase(inv.status)}</Chip>
        </header>

        <div className="grid gap-6 border-b border-line py-5 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate">Billed to</p>
            <p className="font-semibold">{inv.memberName}</p>
            {inv.company && <p className="text-sm">{inv.company}</p>}
            <p className="text-sm text-slate">{inv.memberEmail}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm sm:justify-self-end">
            <dt className="text-slate">Issued</dt>
            <dd className="num font-semibold">{fmtDate(inv.issueDate)}</dd>
            <dt className="text-slate">Due</dt>
            <dd className="num font-semibold">{fmtDate(inv.dueDate)}</dd>
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Description</th>
                <th className="r">Qty</th>
                <th className="r">Unit price</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.description}</td>
                  <td className="r">{i.quantity}</td>
                  <td className="r">{money(i.unitPriceCents, cur)}</td>
                  <td className="r">{money(i.amountCents, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate">Subtotal</dt>
            <dd className="num">{money(inv.subtotalCents, cur)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate">Tax</dt>
            <dd className="num">{money(inv.taxCents, cur)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink/70 pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="num">{money(inv.totalCents, cur)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate">Paid</dt>
            <dd className="num">{money(inv.paidCents, cur)}</dd>
          </div>
          <div className={`flex justify-between text-base font-bold ${inv.balanceCents > 0 ? (inv.overdue ? 'text-busy' : '') : 'text-ok'}`}>
            <dt>Balance due</dt>
            <dd className="num">{money(inv.balanceCents, cur)}</dd>
          </div>
        </dl>

        {inv.payments.length > 0 && (
          <section className="mt-8">
            <h2 className="display-sm mb-2 pb-1 text-base">Payments received</h2>
            <div className="overflow-x-auto">
              <table className="tbl">
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="num whitespace-nowrap">{fmtDate(localDateOf(p.paidAt, inv.timezone))}</td>
                      <td>
                        {METHOD_LABEL[p.method]}
                        {p.reference && <span className="text-slate">, {p.reference}</span>}
                      </td>
                      <td className="r">{money(p.amountCents, cur)}</td>
                      {staff && manager && (
                        <td className="r no-print">
                          <Button
                            small
                            variant="ghost"
                            onClick={() => {
                              if (window.confirm('Remove this payment? The invoice balance will go back up.')) removePayment.mutate(p.id);
                            }}
                          >
                            Remove
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {inv.notes && <p className="mt-6 rounded-lg bg-plaster px-3 py-2 text-sm">{inv.notes}</p>}
        {!staff && inv.balanceCents > 0 && (
          <p className="no-print mt-6 rounded-lg border border-line bg-mist px-3 py-2 text-sm">
            To pay, ask at the front desk or send a bank transfer and quote {inv.number} as the reference.
          </p>
        )}
      </article>

      <Modal open={paying} onClose={() => setPaying(false)} title="Record a payment">
        {paying && <PaymentForm inv={inv} onDone={() => setPaying(false)} />}
      </Modal>
    </>
  );
}
