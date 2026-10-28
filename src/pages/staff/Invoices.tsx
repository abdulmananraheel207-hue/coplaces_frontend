import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useAuth, useLocation } from '../../auth';
import { can } from '../../lib/permissions';
import { MemberSelect } from '../../components/MemberSelect';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, Segmented, Textarea } from '../../components/ui';
import { downloadCsv, fromCents, money, titleCase, toCents } from '../../lib/format';
import { useRefresh } from '../../lib/queries';
import { addDays, fmtDate, todayIn } from '../../lib/time';
import type { InvoiceRow } from '../../types';

interface Line {
  description: string;
  quantity: string;
  unit: string;
}

function NewInvoiceForm({ memberId: initialMember, onDone }: { memberId: string; onDone: (id: string) => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [memberId, setMemberId] = useState(initialMember);
  const [dueDate, setDueDate] = useState(addDays(today, 14));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ description: '', quantity: '1', unit: '' }]);
  const setLine = (i: number, patch: Partial<Line>) => setLines((xs) => xs.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const parsed = lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPriceCents: toCents(l.unit) }));
  const valid = parsed.every((l) => l.description && Number.isInteger(l.quantity) && l.quantity > 0 && l.unitPriceCents !== null);
  const subtotal = parsed.reduce((s, l) => s + (l.unitPriceCents ?? 0) * (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
  const tax = Math.round((subtotal * loc.taxRateBps) / 10_000);

  const save = useMutation({
    mutationFn: () => api.post<{ id: string }>('/invoices', { memberId, issueDate: today, dueDate, notes, items: parsed }),
    onSuccess: (inv) => {
      toast.ok('Invoice created');
      void refresh('invoices', 'dashboard', 'member');
      onDone(inv.id);
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
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Bill to">
          <MemberSelect locationId={loc.id} value={memberId} onChange={setMemberId} activeOnly={false} required />
        </Field>
        <Field label="Due date">
          <Input type="date" required min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold">Line items</legend>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_4rem_6.5rem_auto] items-center gap-2">
              <Input aria-label={`Description ${i + 1}`} placeholder="Description" required value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} maxLength={200} />
              <Input aria-label={`Quantity ${i + 1}`} type="number" min={1} required value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <Input aria-label={`Unit price ${i + 1}`} inputMode="decimal" placeholder="0.00" required value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
              <Button small variant="ghost" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}>
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
        <Button small className="mt-2" onClick={() => setLines((xs) => [...xs, { description: '', quantity: '1', unit: '' }])}>
          Add line
        </Button>
      </fieldset>

      <dl className="ml-auto w-full max-w-60 space-y-0.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate">Subtotal</dt>
          <dd className="num">{money(subtotal, loc.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate">Tax ({(loc.taxRateBps / 100).toFixed(2)}%)</dt>
          <dd className="num">{money(tax, loc.currency)}</dd>
        </div>
        <div className="flex justify-between border-t border-ink/70 pt-2 font-bold">
          <dt>Total</dt>
          <dd className="num">{money(subtotal + tax, loc.currency)}</dd>
        </div>
      </dl>

      <Field label="Note on the invoice (optional)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone('')}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!memberId || !valid || save.isPending}>
          Create invoice
        </Button>
      </div>
    </form>
  );
}

function GenerateForm({ onDone }: { onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [month, setMonth] = useState(todayIn(loc.timezone).slice(0, 7));
  const [dueInDays, setDueInDays] = useState('7');
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const run = useMutation({
    mutationFn: () => api.post<{ created: number; skipped: number }>('/invoices/generate', { locationId: loc.id, month, dueInDays: Number(dueInDays) }),
    onSuccess: (r) => {
      setResult(r);
      toast.ok(`${r.created} invoice${r.created === 1 ? '' : 's'} created`);
      void refresh('invoices', 'dashboard', 'member');
    },
  });
  return result ? (
    <div className="space-y-4">
      <p className="text-sm">
        Created <strong>{result.created}</strong> {result.created === 1 ? 'invoice' : 'invoices'}. Skipped <strong>{result.skipped}</strong>, who already have an invoice for this month or have nothing to bill.
      </p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-sm">
        Bills each active member their monthly plan fee, plus meeting rooms and desks they have used and not yet been charged for. Running it twice for the same month never double-bills.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Billing month">
          <Input type="month" required value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Payment due in (days)">
          <Input type="number" min={0} max={120} required value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} />
        </Field>
      </div>
      {run.error && <ErrorNote error={new Error(errorMessage(run.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={run.isPending}>
          {run.isPending ? 'Creating…' : 'Create invoices'}
        </Button>
      </div>
    </form>
  );
}

export default function Invoices() {
  const { user } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const manager = can(user, 'billing_admin');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<string | null>(null); // member id prefill ('' = none)
  const [generating, setGenerating] = useState(false);

  // /finance/invoices?new=<memberId> opens the new-invoice dialog from a member page.
  useEffect(() => {
    const prefill = params.get('new');
    if (prefill) {
      setCreating(prefill);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const list = useQuery({
    queryKey: ['invoices', loc.id, status, q],
    queryFn: () => api.get<InvoiceRow[]>('/invoices', { locationId: loc.id, status, q }),
  });
  const rows = list.data ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Invoice status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'paid', label: 'Paid' },
            { value: 'void', label: 'Void' },
          ]}
        />
        <div className="min-w-48 flex-1">
          <Input type="search" aria-label="Search invoices" placeholder="Invoice number or member" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv('invoices.csv', [
              ['Number', 'Member', 'Issued', 'Due', 'Status', 'Total', 'Paid', 'Balance'],
              ...rows.map((i) => [i.number, i.memberName, i.issueDate, i.dueDate, i.overdue ? 'overdue' : i.status, fromCents(i.totalCents), fromCents(i.paidCents), fromCents(i.balanceCents)]),
            ])
          }
        >
          <Download size={15} /> Export
        </Button>
        {manager && <Button onClick={() => setGenerating(true)}>Generate monthly invoices</Button>}
        <Button variant="primary" onClick={() => setCreating('')}>
          New invoice
        </Button>
      </div>

      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : rows.length === 0 ? (
        <Empty title="No invoices found" hint={status || q ? 'Try clearing the filters.' : manager ? 'Generate this month’s invoices or create one by hand.' : 'Create one by hand.'} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Member</th>
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
                    <Link to={`/finance/invoices/${i.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {i.number}
                    </Link>
                    {i.kind === 'subscription' && <span className="block text-xs text-slate">Monthly</span>}
                  </td>
                  <td>
                    {i.memberName}
                    {i.company && <span className="block text-xs text-slate">{i.company}</span>}
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

      <Modal open={creating !== null} onClose={() => setCreating(null)} title="New invoice" wide>
        {creating !== null && (
          <NewInvoiceForm
            memberId={creating}
            onDone={(id) => {
              setCreating(null);
              if (id) navigate(`/finance/invoices/${id}`);
            }}
          />
        )}
      </Modal>
      <Modal open={generating} onClose={() => setGenerating(false)} title="Generate monthly invoices">
        {generating && <GenerateForm onDone={() => setGenerating(false)} />}
      </Modal>
    </>
  );
}
