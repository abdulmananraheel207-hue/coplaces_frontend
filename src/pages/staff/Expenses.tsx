import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { useToast } from '../../components/toast';
import { Button, Empty, ErrorNote, Field, Input, Loading, Modal, Select } from '../../components/ui';
import { downloadCsv, fromCents, money, titleCase, toCents } from '../../lib/format';
import { useRefresh } from '../../lib/queries';
import { addDays, addMonths, fmtDate, todayIn } from '../../lib/time';
import type { Expense } from '../../types';

export const EXPENSE_CATEGORIES = ['rent', 'utilities', 'internet', 'cleaning', 'supplies', 'salaries', 'maintenance', 'marketing', 'software', 'other'];

function ExpenseForm({ initial, onDone }: { initial?: Expense; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({
    category: initial?.category ?? 'supplies',
    vendor: initial?.vendor ?? '',
    description: initial?.description ?? '',
    amount: initial ? fromCents(initial.amountCents) : '',
    incurredOn: initial?.incurredOn ?? todayIn(loc.timezone),
  });
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => {
      const cents = toCents(v.amount);
      if (!cents) throw new Error('Enter the amount as a number greater than zero, like 120 or 45.50');
      const body = { category: v.category, vendor: v.vendor, description: v.description, amountCents: cents, incurredOn: v.incurredOn };
      return initial ? api.patch(`/expenses/${initial.id}`, body) : api.post('/expenses', { ...body, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Expense updated' : 'Expense added');
      void refresh('expenses', 'dashboard', 'reports');
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select value={v.category} onChange={(e) => set('category', e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" required value={v.incurredOn} onChange={(e) => set('incurredOn', e.target.value)} />
        </Field>
        <Field label="Vendor">
          <Input value={v.vendor} onChange={(e) => set('vendor', e.target.value)} maxLength={120} />
        </Field>
        <Field label={`Amount (${loc.currency})`}>
          <Input inputMode="decimal" required value={v.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
      </div>
      <Field label="Description">
        <Input value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={300} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save expense
        </Button>
      </div>
    </form>
  );
}

export default function Expenses() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [month, setMonth] = useState(todayIn(loc.timezone).slice(0, 7));
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);

  const from = month ? `${month}-01` : undefined;
  const to = month ? addDays(`${addMonths(month, 1)}-01`, -1) : undefined;
  const list = useQuery({
    queryKey: ['expenses', loc.id, month, category],
    queryFn: () => api.get<Expense[]>('/expenses', { locationId: loc.id, from, to, category }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/expenses/${id}`),
    onSuccess: () => {
      toast.ok('Expense deleted');
      void refresh('expenses', 'dashboard', 'reports');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = list.data ?? [];
  const total = rows.reduce((s, e) => s + e.amountCents, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Month" hint={month ? undefined : 'Showing every month'}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="ml-auto flex gap-2">
          <Button
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv('expenses.csv', [['Date', 'Category', 'Vendor', 'Description', 'Amount'], ...rows.map((e) => [e.incurredOn, e.category, e.vendor, e.description, fromCents(e.amountCents)])])
            }
          >
            <Download size={15} /> Export
          </Button>
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add expense
          </Button>
        </div>
      </div>

      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : rows.length === 0 ? (
        <Empty title="No expenses found" hint="Record rent, utilities, supplies and other costs to see your net result." action={<Button variant="primary" onClick={() => setEditing('new')}>Add expense</Button>} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Description</th>
                <th className="r">Amount</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="num whitespace-nowrap">{fmtDate(e.incurredOn)}</td>
                  <td>{titleCase(e.category)}</td>
                  <td>{e.vendor || <span className="text-slate">—</span>}</td>
                  <td className="text-slate">{e.description}</td>
                  <td className="r font-semibold">{money(e.amountCents, loc.currency)}</td>
                  <td className="r whitespace-nowrap">
                    <Button small variant="ghost" onClick={() => setEditing(e)}>
                      Edit
                    </Button>
                    <Button
                      small
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Delete this ${money(e.amountCents, loc.currency)} expense?`)) remove.mutate(e.id);
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-semibold">
                  Total
                </td>
                <td className="r px-3 py-2.5 font-bold">{money(total, loc.currency)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add an expense' : 'Edit expense'}>
        {editing && <ExpenseForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
