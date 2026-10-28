import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select } from '../../components/ui';
import { fromCents, KIND_LABEL, money, toCents } from '../../lib/format';
import { useRefresh, useResources, useShifts } from '../../lib/queries';
import { toMinutes } from '../../lib/time';
import type { Resource, ResourceKind, ShiftTemplate } from '../../types';

/** Only rooms and hot desks are booked, so only they can have shifts. */
const BOOKABLE: ResourceKind[] = ['room', 'corporate_room', 'hot_desk'];

/** The "applies to" choice as one string: everything, a kind, or a single space. */
type Scope = 'all' | `kind:${ResourceKind}` | `space:${string}`;
const scopeOf = (s: Pick<ShiftTemplate, 'resourceId' | 'kind'>): Scope => (s.resourceId ? `space:${s.resourceId}` : s.kind ? `kind:${s.kind}` : 'all');

function appliesTo(s: ShiftTemplate, spaces: Resource[]) {
  if (s.resourceId) return spaces.find((r) => r.id === s.resourceId)?.name ?? 'A space that was removed';
  if (s.kind) return `Every ${KIND_LABEL[s.kind].toLowerCase()}`;
  return 'Every room and hot desk';
}

function ShiftForm({ initial, spaces, onDone }: { initial?: ShiftTemplate; spaces: Resource[]; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    scope: (initial ? scopeOf(initial) : 'kind:hot_desk') as Scope,
    startTime: initial?.startTime ?? '09:00',
    endTime: initial?.endTime ?? '14:00',
    price: initial?.priceCents != null ? fromCents(initial.priceCents) : '',
    active: initial?.active ?? true,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const valid = toMinutes(v.endTime) > toMinutes(v.startTime);

  const save = useMutation({
    mutationFn: () => {
      const price = v.price.trim() === '' ? null : toCents(v.price);
      if (price === undefined || (v.price.trim() !== '' && price === null)) throw new Error('Enter the price as a number, like 1200');
      const body = {
        name: v.name,
        resourceId: v.scope.startsWith('space:') ? v.scope.slice(6) : null,
        kind: v.scope.startsWith('kind:') ? v.scope.slice(5) : null,
        startTime: v.startTime,
        endTime: v.endTime,
        priceCents: price,
        active: v.active,
      };
      return initial ? api.patch(`/shifts/${initial.id}`, body) : api.post('/shifts', { ...body, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Shift updated' : 'Shift added');
      void refresh('shifts', 'quote');
      onDone();
    },
  });

  // A few common slots, so the owner does not have to type the times.
  const quick = [
    { name: 'Morning', start: loc.openTime, end: '13:00' },
    { name: 'Afternoon', start: '13:00', end: loc.closeTime },
    { name: 'Full day', start: loc.openTime, end: loc.closeTime },
  ];

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      {!initial && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-slate">Start from</span>
          {quick.map((q) => (
            <Button key={q.name} small onClick={() => setV((x) => ({ ...x, name: x.name || q.name, startTime: q.start, endTime: q.end }))}>
              {q.name}
            </Button>
          ))}
        </div>
      )}
      <Field label="Name" hint="What people see when they book, like Morning or Evening.">
        <Input required maxLength={80} value={v.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Applies to">
        <Select value={v.scope} onChange={(e) => set('scope', e.target.value as Scope)}>
          <option value="all">Every room and hot desk</option>
          <optgroup label="Every space of one kind">
            {BOOKABLE.map((k) => (
              <option key={k} value={`kind:${k}`}>
                Every {KIND_LABEL[k].toLowerCase()}
              </option>
            ))}
          </optgroup>
          {BOOKABLE.map((k) => (
            <optgroup key={k} label={KIND_LABEL[k]}>
              {spaces
                .filter((r) => r.kind === k)
                .map((r) => (
                  <option key={r.id} value={`space:${r.id}`}>
                    {r.name} only
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="time" step={900} required value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </Field>
        <Field label="Until">
          <Input type="time" step={900} required value={v.endTime} onChange={(e) => set('endTime', e.target.value)} />
        </Field>
      </div>
      {!valid && <p className="text-sm text-busy">The shift has to end after it starts.</p>}
      <Field label={`Price (${loc.currency})`} hint="Leave empty to charge by the hour as usual. A price here is charged for this exact slot. Members whose plan includes hot desks still pay nothing for a desk.">
        <Input inputMode="decimal" value={v.price} onChange={(e) => set('price', e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="size-4 accent-ink" checked={v.active} onChange={(e) => set('active', e.target.checked)} />
        Offer this shift when people book
      </label>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!v.name.trim() || !valid || save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

export default function ShiftTemplates() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const shifts = useShifts(loc.id);
  const resources = useResources(loc.id);
  const spaces = (resources.data ?? []).filter((r) => BOOKABLE.includes(r.kind) && r.status !== 'retired');
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/shifts/${id}`),
    onSuccess: () => {
      toast.ok('Shift deleted');
      void refresh('shifts', 'quote');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (s: ShiftTemplate) => api.patch(`/shifts/${s.id}`, { active: !s.active }),
    onSuccess: () => void refresh('shifts', 'quote'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Shift templates" sub="Ready-made time slots people pick when they book, for any room or hot desk.">
        <Button variant="primary" onClick={() => setEditing('new')}>
          New shift
        </Button>
      </PageHeader>

      {shifts.isLoading ? (
        <Loading />
      ) : shifts.error ? (
        <ErrorNote error={shifts.error} />
      ) : !shifts.data?.length ? (
        <Empty
          title="No shifts yet"
          hint="Make a shift like Morning, 09:00 to 14:00, for your hot desks or any room. Members then book it in one tap."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              New shift
            </Button>
          }
        />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Time</th>
                <th>Applies to</th>
                <th className="r">Price</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shifts.data.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'text-slate'}>
                  <td className="font-semibold">{s.name}</td>
                  <td className="num whitespace-nowrap">
                    {s.startTime} to {s.endTime}
                    <span className="block text-xs text-slate">{Math.round((toMinutes(s.endTime) - toMinutes(s.startTime)) / 6) / 10} hours</span>
                  </td>
                  <td>{appliesTo(s, spaces)}</td>
                  <td className="r">{s.priceCents !== null ? money(s.priceCents, loc.currency) : 'By the hour'}</td>
                  <td>
                    <Chip tone={s.active ? 'ok' : 'idle'}>{s.active ? 'Offered' : 'Hidden'}</Chip>
                  </td>
                  <td className="r whitespace-nowrap">
                    <Button small variant="ghost" onClick={() => setEditing(s)}>
                      Edit
                    </Button>{' '}
                    <Button small variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(s)}>
                      {s.active ? 'Hide' : 'Offer'}
                    </Button>{' '}
                    <Button small variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New shift' : 'Edit shift'}>
        {editing && <ShiftForm initial={editing === 'new' ? undefined : editing} spaces={spaces} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
