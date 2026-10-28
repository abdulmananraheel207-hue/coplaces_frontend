import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '../../components/ui';
import { fromCents, money, toCents } from '../../lib/format';
import { usePlans, useRefresh } from '../../lib/queries';
import type { Plan } from '../../types';

function PlanForm({ initial, onDone }: { initial?: Plan; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    interval: initial?.interval ?? 'month',
    price: initial ? fromCents(initial.priceCents) : '',
    minutes: String(initial?.includedMeetingMinutes ?? 0),
    hotDesk: initial?.includesHotDesk ?? false,
    active: initial?.active ?? true,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => {
      const cents = toCents(v.price);
      if (cents === null) throw new Error('Enter the price as a number, like 199 or 49.50');
      const body = {
        name: v.name,
        description: v.description,
        interval: v.interval,
        priceCents: cents,
        includedMeetingMinutes: Number(v.minutes),
        includesHotDesk: v.hotDesk,
        active: v.active,
      };
      return initial ? api.patch(`/plans/${initial.id}`, body) : api.post('/plans', { ...body, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Plan updated' : 'Plan added');
      void refresh('plans', 'members');
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
      <Field label="Plan name">
        <Input required value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Price (${loc.currency})`}>
          <Input inputMode="decimal" required value={v.price} onChange={(e) => set('price', e.target.value)} />
        </Field>
        <Field label="Billed" hint="Only monthly plans are included when you generate monthly invoices.">
          <Select value={v.interval} onChange={(e) => set('interval', e.target.value as Plan['interval'])}>
            <option value="month">Every month</option>
            <option value="day">Per day (day pass)</option>
          </Select>
        </Field>
      </div>
      <Field label="Meeting room minutes included each month">
        <Input type="number" min={0} required value={v.minutes} onChange={(e) => set('minutes', e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={v.hotDesk} onChange={(e) => set('hotDesk', e.target.checked)} className="size-4 accent-ink" />
        Hot desk bookings are free on this plan
      </label>
      <Field label="Description">
        <Textarea value={v.description} onChange={(e) => set('description', e.target.value)} rows={2} maxLength={500} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-ink" />
        Offer this plan to new members
      </label>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save plan
        </Button>
      </div>
    </form>
  );
}

export default function Plans() {
  const loc = useLocation();
  const plans = usePlans(loc.id);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  return (
    <>
      <PageHeader title="Plans" sub={`Memberships on offer at ${loc.name}`}>
        <Button variant="primary" onClick={() => setEditing('new')}>
          Add plan
        </Button>
      </PageHeader>
      {plans.isLoading ? (
        <Loading />
      ) : !plans.data?.length ? (
        <Empty title="No plans yet" hint="Plans set what members pay each month and what they get included." action={<Button variant="primary" onClick={() => setEditing('new')}>Add plan</Button>} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Plan</th>
                <th className="r">Price</th>
                <th className="r">Meeting minutes</th>
                <th>Hot desks</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.data.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="font-semibold">{p.name}</span>
                    {p.description && <span className="block text-xs text-slate">{p.description}</span>}
                  </td>
                  <td className="r">
                    {money(p.priceCents, loc.currency)}
                    <span className="text-slate"> / {p.interval}</span>
                  </td>
                  <td className="r">{p.includedMeetingMinutes || '—'}</td>
                  <td>{p.includesHotDesk ? 'Included' : 'Pay per day'}</td>
                  <td>
                    <Chip tone={p.active ? 'ok' : 'idle'}>{p.active ? 'Offered' : 'Inactive'}</Chip>
                  </td>
                  <td className="r">
                    <Button small variant="ghost" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a plan' : 'Edit plan'}>
        {editing && <PlanForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
