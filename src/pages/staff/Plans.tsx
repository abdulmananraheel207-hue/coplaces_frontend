import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { floorLabel } from '../../components/space3d/layout';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '../../components/ui';
import { fromCents, KIND_LABEL, money, toCents } from '../../lib/format';
import { usePlans, useRefresh, useResources, useShifts } from '../../lib/queries';
import { toMinutes } from '../../lib/time';
import type { Plan, Resource, ResourceKind, ShiftTemplate } from '../../types';

/** Only rooms and hot desks are booked, so only they can have shifts. */
const BOOKABLE: ResourceKind[] = ['room', 'corporate_room', 'hot_desk'];

function PlanForm({ initial, onDone }: { initial?: Plan; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    interval: initial?.interval ?? 'month',
    active: initial?.active ?? true,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => (initial ? api.patch(`/plans/${initial.id}`, v) : api.post('/plans', { ...v, locationId: loc.id })),
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
      <Field label="Billed" hint="Only monthly plans are included when you generate monthly invoices. What members pay comes from the plan's shifts.">
        <Select value={v.interval} onChange={(e) => set('interval', e.target.value as Plan['interval'])}>
          <option value="month">Every month</option>
          <option value="day">Per day (day pass)</option>
        </Select>
      </Field>
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

/** Which spaces a shift covers: one line per space, grouped by floor. */
function SpacePicker({ spaces, value, onChange }: { spaces: Resource[]; value: string[]; onChange: (ids: string[]) => void }) {
  const floors = [...new Set(spaces.map((s) => s.floor))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  if (!spaces.length) return <p className="text-sm text-slate">There are no free rooms or hot desks to choose from yet.</p>;
  return (
    <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
      {floors.map((f) => (
        <fieldset key={f}>
          <legend className="mb-1 text-xs font-semibold tracking-wide text-slate uppercase">{floorLabel(f)}</legend>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {spaces
              .filter((s) => s.floor === f)
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-ink" checked={value.includes(s.id)} onChange={() => toggle(s.id)} />
                  <span>
                    {s.name} <span className="text-slate">({KIND_LABEL[s.kind]})</span>
                  </span>
                </label>
              ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function ShiftForm({ plan, initial, plans, spaces, onDone }: { plan: Plan | null; initial?: ShiftTemplate; plans: Plan[]; spaces: Resource[]; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    planId: initial ? (initial.planId ?? '') : (plan?.id ?? ''),
    startTime: initial?.startTime ?? loc.openTime,
    endTime: initial?.endTime ?? loc.closeTime,
    price: initial?.priceCents != null ? fromCents(initial.priceCents) : '',
    spaceIds: initial?.spaceIds ?? [],
    active: initial?.active ?? true,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const valid = toMinutes(v.endTime) > toMinutes(v.startTime);
  const save = useMutation({
    mutationFn: () => {
      const price = v.price.trim() === '' ? null : toCents(v.price);
      if (v.price.trim() !== '' && price === null) throw new Error('Enter the price as a number, like 1200');
      const body = { name: v.name, planId: v.planId || null, startTime: v.startTime, endTime: v.endTime, priceCents: price, spaceIds: v.spaceIds, active: v.active };
      return initial ? api.patch(`/shifts/${initial.id}`, body) : api.post('/shifts', { ...body, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Shift updated' : 'Shift added');
      void refresh('shifts', 'quote');
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
      <Field label="Name" hint="What people see when they book, like Morning or Evening.">
        <Input required maxLength={80} value={v.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      {initial && !initial.planId && (
        <Field label="Plan" hint="This shift was made before shifts lived inside plans. Pick a plan to move it there.">
          <Select value={v.planId} onChange={(e) => set('planId', e.target.value)}>
            <option value="">No plan (open to everyone)</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="time" step={900} required value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </Field>
        <Field label="Until">
          <Input type="time" step={900} required value={v.endTime} onChange={(e) => set('endTime', e.target.value)} />
        </Field>
      </div>
      {!valid && <p className="text-sm text-busy">The shift has to end after it starts.</p>}
      <Field label={`Price (${loc.currency})`} hint="What a member pays for this exact slot. Leave empty to charge by the hour as usual.">
        <Input inputMode="decimal" value={v.price} onChange={(e) => set('price', e.target.value)} />
      </Field>
      <div>
        <p className="mb-1 text-[13px] font-semibold">
          Spaces <span className="font-normal text-slate">(optional)</span>
        </p>
        <SpacePicker spaces={spaces} value={v.spaceIds} onChange={(ids) => set('spaceIds', ids)} />
        <p className="mt-1 text-xs text-slate">{v.spaceIds.length ? `${v.spaceIds.length} chosen.` : 'None chosen: the shift works in every room and hot desk.'}</p>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="size-4 accent-ink" checked={v.active} onChange={(e) => set('active', e.target.checked)} />
        Offer this shift when people book
      </label>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!v.name.trim() || !valid || save.isPending}>
          Save shift
        </Button>
      </div>
    </form>
  );
}

function spacesLabel(s: ShiftTemplate, all: Resource[]) {
  if (s.spaceIds.length) return s.spaceIds.map((id) => all.find((r) => r.id === id)?.name ?? 'Removed space').join(', ');
  if (s.resourceId) return all.find((r) => r.id === s.resourceId)?.name ?? 'A space that was removed';
  if (s.kind) return `Every ${KIND_LABEL[s.kind].toLowerCase()}`;
  return 'Every room and hot desk';
}

function ShiftTable({ shifts, all, onEdit, onDelete, busy }: { shifts: ShiftTemplate[]; all: Resource[]; onEdit: (s: ShiftTemplate) => void; onDelete: (s: ShiftTemplate) => void; busy: boolean }) {
  const loc = useLocation();
  return (
    <div className="surface-table">
      <table className="tbl">
        <thead>
          <tr>
            <th>Shift</th>
            <th>Time</th>
            <th>Spaces</th>
            <th className="r">Price</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id} className={s.active ? '' : 'text-slate'}>
              <td className="font-semibold">{s.name}</td>
              <td className="num whitespace-nowrap">
                {s.startTime} to {s.endTime}
              </td>
              <td className="max-w-64 text-sm">{spacesLabel(s, all)}</td>
              <td className="r">{s.priceCents !== null ? money(s.priceCents, loc.currency) : 'By the hour'}</td>
              <td>
                <Chip tone={s.active ? 'ok' : 'idle'}>{s.active ? 'Offered' : 'Hidden'}</Chip>
              </td>
              <td className="r whitespace-nowrap">
                <Button small variant="ghost" onClick={() => onEdit(s)}>
                  Edit
                </Button>{' '}
                <Button small variant="ghost" disabled={busy} onClick={() => onDelete(s)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Plans() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const plans = usePlans(loc.id);
  const shifts = useShifts(loc.id);
  const resources = useResources(loc.id);
  // Only spaces that can be booked and are free to be: assigned desks and offices, or ones out of use, are left out.
  const spaces = (resources.data ?? []).filter((r) => BOOKABLE.includes(r.kind) && r.status === 'available' && !r.occupied);
  const [editingPlan, setEditingPlan] = useState<Plan | 'new' | null>(null);
  const [shiftFor, setShiftFor] = useState<{ plan: Plan | null; shift?: ShiftTemplate } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const removeShift = useMutation({
    mutationFn: (s: ShiftTemplate) => api.del(`/shifts/${s.id}`),
    onSuccess: () => {
      toast.ok('Shift deleted');
      void refresh('shifts', 'quote');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removePlan = useMutation({
    mutationFn: (p: Plan) => api.del(`/plans/${p.id}`),
    onSuccess: () => {
      toast.ok('Plan deleted');
      setConfirming(null);
      void refresh('plans', 'shifts', 'members', 'quote');
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirming(null);
    },
  });

  const all = shifts.data ?? [];
  const loose = all.filter((s) => !s.planId);
  const loading = plans.isLoading || shifts.isLoading;

  return (
    <>
      <PageHeader title="Plans" sub={`What members can sign up for at ${loc.name}, and the shifts they book under each plan`}>
        <Button variant="primary" onClick={() => setEditingPlan('new')}>
          Add plan
        </Button>
      </PageHeader>
      {loading ? (
        <Loading />
      ) : plans.error || shifts.error ? (
        <ErrorNote error={(plans.error ?? shifts.error)!} />
      ) : !plans.data?.length && !loose.length ? (
        <Empty title="No plans yet" hint="Make a plan, say how it is billed, then add its shifts, like Morning 09:00 to 14:00, each with its own price." action={<Button variant="primary" onClick={() => setEditingPlan('new')}>Add plan</Button>} />
      ) : (
        <div className="space-y-5">
          {plans.data?.map((p) => {
            const mine = all.filter((s) => s.planId === p.id);
            return (
              <section key={p.id} className="surface p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="display-sm text-lg">{p.name}</h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate">
                      <Chip tone="idle">{p.interval === 'month' ? 'Billed monthly' : 'Day pass'}</Chip>
                      <Chip tone={p.active ? 'ok' : 'idle'}>{p.active ? 'Offered' : 'Inactive'}</Chip>
                      {p.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button small variant="primary" onClick={() => setShiftFor({ plan: p })}>
                      Add shift
                    </Button>
                    <Button small onClick={() => setEditingPlan(p)}>
                      Edit plan
                    </Button>
                    {confirming === p.id ? (
                      <>
                        <span className="text-sm">
                          Delete it and its {mine.length} shift{mine.length === 1 ? '' : 's'}? Members on it lose the plan.
                        </span>
                        <Button small variant="ghost" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                        <Button small disabled={removePlan.isPending} onClick={() => removePlan.mutate(p)}>
                          Yes, delete
                        </Button>
                      </>
                    ) : (
                      <Button small variant="ghost" onClick={() => setConfirming(p.id)}>
                        Delete plan
                      </Button>
                    )}
                  </div>
                </div>
                {mine.length ? (
                  <ShiftTable shifts={mine} all={resources.data ?? []} busy={removeShift.isPending} onEdit={(s) => setShiftFor({ plan: p, shift: s })} onDelete={(s) => removeShift.mutate(s)} />
                ) : (
                  <p className="rounded-lg bg-plaster px-3 py-2 text-sm text-slate">No shifts yet. Members on this plan pay for bookings by the hour until you add some.</p>
                )}
              </section>
            );
          })}
          {loose.length > 0 && (
            <section className="surface p-4">
              <h2 className="display-sm text-lg">Not in any plan</h2>
              <p className="mb-3 text-sm text-slate">Shifts made before shifts lived inside plans. They are still open to every member. Edit one to move it into a plan.</p>
              <ShiftTable shifts={loose} all={resources.data ?? []} busy={removeShift.isPending} onEdit={(s) => setShiftFor({ plan: null, shift: s })} onDelete={(s) => removeShift.mutate(s)} />
            </section>
          )}
        </div>
      )}
      <Modal open={editingPlan !== null} onClose={() => setEditingPlan(null)} title={editingPlan === 'new' ? 'Add a plan' : 'Edit plan'}>
        {editingPlan && <PlanForm initial={editingPlan === 'new' ? undefined : editingPlan} onDone={() => setEditingPlan(null)} />}
      </Modal>
      <Modal open={shiftFor !== null} onClose={() => setShiftFor(null)} title={shiftFor?.shift ? 'Edit shift' : `New shift${shiftFor?.plan ? ` in ${shiftFor.plan.name}` : ''}`} wide>
        {shiftFor && <ShiftForm plan={shiftFor.plan} initial={shiftFor.shift} plans={plans.data ?? []} spaces={spaces} onDone={() => setShiftFor(null)} />}
      </Modal>
    </>
  );
}
