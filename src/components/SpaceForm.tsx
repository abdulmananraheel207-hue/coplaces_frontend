import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { isRoomKind, STYLES, styleDef, styleKey } from '../lib/catalogue';
import { KIND_LABEL, money } from '../lib/format';
import { useRefresh } from '../lib/queries';
import type { Resource, ResourceKind, ResourceStatus } from '../types';
import { AmenityPicker } from './AmenityPicker';
import { PhotoManager } from './Photos';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input, Select, Textarea } from './ui';

export const KINDS: { value: ResourceKind; label: string }[] = [
  { value: 'room', label: 'Meeting rooms' },
  { value: 'corporate_room', label: 'Corporate rooms' },
  { value: 'hot_desk', label: 'Hot desks and day offices' },
  { value: 'dedicated_desk', label: 'Dedicated desks and pods' },
  { value: 'office', label: 'Offices' },
  { value: 'storage', label: 'Lockers, mailboxes and parking' },
];

const STATUSES: { value: ResourceStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'cleaning', label: "Being cleaned (can't be booked)" },
  { value: 'maintenance', label: "Under maintenance (can't be booked)" },
  { value: 'reserved', label: "Reserved (held back, can't be booked)" },
  { value: 'retired', label: 'Retired (hidden from booking)' },
];

/** Weekdays in the order a week is shown, with the number the server uses (0 is Sunday). */
const WEEK = [
  ['1', 'Mon'],
  ['2', 'Tue'],
  ['3', 'Wed'],
  ['4', 'Thu'],
  ['5', 'Fri'],
  ['6', 'Sat'],
  ['0', 'Sun'],
] as const;

const Group = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <fieldset className="space-y-3 rounded-xl border border-line p-3.5">
    <legend className="px-1 text-[13px] font-bold tracking-wide text-slate uppercase">{title}</legend>
    {hint && <p className="-mt-1 text-xs text-slate">{hint}</p>}
    {children}
  </fieldset>
);

/**
 * Add or change a space: what it is, what it offers, when it is open, and how it looks. Its price is not set here: the server
 * keeps one hourly price per space in the price list (PUT /resources/pricing) and ignores prices sent with a space.
 */
export function SpaceForm({ initial, kind, onDone }: { initial?: Resource; kind: ResourceKind; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    kind: initial?.kind ?? kind,
    style: styleKey(initial?.kind ?? kind, initial?.style ?? ''),
    floor: initial?.floor ?? '',
    capacity: String(initial?.capacity ?? styleDef(kind, '').capacity),
    description: initial?.description ?? '',
    amenities: initial?.amenities ?? '',
    status: (initial?.status ?? 'available') as ResourceStatus,
    notes: initial?.notes ?? '',
    ownHours: !!(initial?.openTime && initial?.closeTime),
    openTime: initial?.openTime ?? loc.openTime,
    closeTime: initial?.closeTime ?? loc.closeTime,
    closed: initial?.closedWeekdays ? initial.closedWeekdays.split(',') : ([] as string[]),
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  // Rooms and hot desks are what people book by the hour, so they are the ones with their own opening hours.
  const bookable = isRoomKind(v.kind) || v.kind === 'hot_desk';

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: v.name,
        floor: v.floor,
        capacity: Number(v.capacity),
        description: v.description,
        amenities: v.amenities,
        status: v.status,
        notes: v.notes,
        style: v.style,
        openTime: v.ownHours ? v.openTime : null,
        closeTime: v.ownHours ? v.closeTime : null,
        closedWeekdays: v.closed.length ? [...v.closed].sort().join(',') : null,
      };
      return initial ? api.patch(`/resources/${initial.id}`, body) : api.post('/resources', { ...body, kind: v.kind, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Space updated' : 'Space added');
      void refresh('resources', 'schedule', 'dashboard');
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
      <Group title="About it">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input required value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />
          </Field>
          <Field label="Kind">
            <Select
              value={v.kind}
              onChange={(e) => {
                const next = e.target.value as ResourceKind;
                setV((x) => ({ ...x, kind: next, style: styleKey(next, ''), capacity: String(styleDef(next, '').capacity) }));
              }}
              disabled={!!initial}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {KIND_LABEL[k.value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Style" hint="How it looks in the 3D floor plan.">
            <Select value={v.style} onChange={(e) => set('style', e.target.value)}>
              {STYLES[v.kind].map((st) => (
                <option key={st.key} value={st.key}>
                  {st.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Floor">
              <Input value={v.floor} onChange={(e) => set('floor', e.target.value)} maxLength={50} placeholder="2" />
            </Field>
            <Field label="Seats">
              <Input type="number" min={1} max={500} required value={v.capacity} onChange={(e) => set('capacity', e.target.value)} />
            </Field>
          </div>
        </div>
        <Field label="Description" hint="Members read this before they book.">
          <Textarea value={v.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={1000} placeholder="A bright room with a projector, good for workshops." />
        </Field>
        <div>
          <p className="mb-1 text-[13px] font-semibold">What it offers</p>
          <AmenityPicker value={v.amenities} onChange={(a) => set('amenities', a)} />
        </div>
      </Group>

      {initial && (
        <Group title="Photos" hint="Shown to members when they look at the space.">
          <PhotoManager resourceId={initial.id} ids={initial.photoIds ?? []} />
        </Group>
      )}

      {initial && (
        <Group title="Price">
          <p className="text-sm">
            {initial.hourlyRateCents > 0 ? (
              <>
                <strong className="num">{money(initial.hourlyRateCents, loc.currency)} an hour</strong>. People can book it by the hour.
              </>
            ) : (
              <>No hourly price, so it cannot be booked by the hour. It is only used through plans and contracts.</>
            )}
          </p>
          <p className="text-xs text-slate">Prices are kept in the price list, not on the space.</p>
        </Group>
      )}

      {bookable && (
        <Group title="Opening hours" hint={`Leave these alone and it follows the location: ${loc.openTime} to ${loc.closeTime}.`}>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={v.ownHours} onChange={(e) => set('ownHours', e.target.checked)} className="size-4 accent-ink" />
            This space has its own hours
          </label>
          {v.ownHours && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opens">
                <Input type="time" required value={v.openTime} onChange={(e) => set('openTime', e.target.value)} />
              </Field>
              <Field label="Closes">
                <Input type="time" required value={v.closeTime} onChange={(e) => set('closeTime', e.target.value)} />
              </Field>
            </div>
          )}
          <fieldset>
            <legend className="mb-1 text-[13px] font-semibold">Also closed on</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {WEEK.map(([n, label]) => (
                <label key={n} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={v.closed.includes(n)} onChange={() => set('closed', v.closed.includes(n) ? v.closed.filter((x) => x !== n) : [...v.closed, n])} className="size-4 accent-ink" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Group>
      )}

      <Group title="Status">
        <Field label="Status">
          <Select value={v.status} onChange={(e) => set('status', e.target.value as ResourceStatus)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Internal notes" hint="Only your team sees these.">
          <Textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={1000} />
        </Field>
      </Group>

      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save space
        </Button>
      </div>
    </form>
  );
}
