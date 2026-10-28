import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { isRoomKind, STYLES, styleDef, styleKey } from '../lib/catalogue';
import { fromCents, KIND_LABEL, toCents } from '../lib/format';
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

/** Add or change a space: what it is, what it offers, when it is open, what it costs, and how it looks. */
export function SpaceForm({ initial, kind, onDone }: { initial?: Resource; kind: ResourceKind; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const money = (c: number | null | undefined) => (c === null || c === undefined ? '' : fromCents(c));
  const [v, setV] = useState({
    name: initial?.name ?? '',
    kind: initial?.kind ?? kind,
    style: styleKey(initial?.kind ?? kind, initial?.style ?? ''),
    floor: initial?.floor ?? '',
    capacity: String(initial?.capacity ?? styleDef(kind, '').capacity),
    description: initial?.description ?? '',
    hourly: fromCents(initial?.hourlyRateCents ?? 0),
    daily: fromCents(initial?.dailyRateCents ?? 0),
    amenities: initial?.amenities ?? '',
    status: (initial?.status ?? 'available') as ResourceStatus,
    notes: initial?.notes ?? '',
    ownHours: !!(initial?.openTime && initial?.closeTime),
    openTime: initial?.openTime ?? loc.openTime,
    closeTime: initial?.closeTime ?? loc.closeTime,
    closed: initial?.closedWeekdays ? initial.closedWeekdays.split(',') : ([] as string[]),
    peakOn: !!(initial?.peakStart && initial?.peakEnd),
    peakStart: initial?.peakStart ?? '09:00',
    peakEnd: initial?.peakEnd ?? '17:00',
    offPeak: money(initial?.offPeakRateCents),
    halfDay: money(initial?.halfDayRateCents),
    fullDay: money(initial?.fullDayRateCents),
    noPlan: money(initial?.noPlanRateCents),
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const hourly = isRoomKind(v.kind);
  const daily = v.kind === 'hot_desk';
  const priced = hourly || daily;

  const save = useMutation({
    mutationFn: () => {
      const optional = (text: string, what: string) => {
        if (!text.trim()) return null;
        const c = toCents(text);
        if (c === null) throw new Error(`Enter ${what} as a number, like 25 or 12.50`);
        return c;
      };
      const hourlyC = toCents(v.hourly);
      const dailyC = toCents(v.daily);
      if (hourlyC === null || dailyC === null) throw new Error('Enter prices as numbers, like 25 or 12.50');
      const offPeak = hourly && v.peakOn ? optional(v.offPeak, 'the off-peak rate') : null;
      const body = {
        name: v.name,
        floor: v.floor,
        capacity: Number(v.capacity),
        description: v.description,
        hourlyRateCents: hourlyC,
        dailyRateCents: dailyC,
        amenities: v.amenities,
        status: v.status,
        notes: v.notes,
        style: v.style,
        openTime: v.ownHours ? v.openTime : null,
        closeTime: v.ownHours ? v.closeTime : null,
        closedWeekdays: v.closed.length ? [...v.closed].sort().join(',') : null,
        peakStart: hourly && v.peakOn ? v.peakStart : null,
        peakEnd: hourly && v.peakOn ? v.peakEnd : null,
        offPeakRateCents: offPeak,
        halfDayRateCents: hourly ? optional(v.halfDay, 'the half-day price') : null,
        fullDayRateCents: hourly ? optional(v.fullDay, 'the day price') : null,
        noPlanRateCents: priced ? optional(v.noPlan, 'the no-plan rate') : null,
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

      {priced && (
        <Group
          title="Pricing"
          hint={hourly ? (v.kind === 'corporate_room' ? "Corporate rooms always bill at their own rates. A plan's included meeting minutes do not apply." : "Billed per hour beyond a member's included meeting minutes. The cheapest of the hourly total, the half-day price and the day price is what is charged.") : 'Free for members whose plan includes hot desks.'}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {hourly ? (
              <Field label={`Hourly rate (${loc.currency})`}>
                <Input inputMode="decimal" value={v.hourly} onChange={(e) => set('hourly', e.target.value)} />
              </Field>
            ) : (
              <Field label={`Day rate (${loc.currency})`}>
                <Input inputMode="decimal" value={v.daily} onChange={(e) => set('daily', e.target.value)} />
              </Field>
            )}
            <Field label={`Rate for members with no plan (${loc.currency})`} hint={hourly ? 'An hourly rate. Leave empty to charge everyone the same.' : 'A day rate. Leave empty to charge everyone the same.'}>
              <Input inputMode="decimal" value={v.noPlan} onChange={(e) => set('noPlan', e.target.value)} />
            </Field>
          </div>
          {hourly && (
            <>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={v.peakOn} onChange={(e) => set('peakOn', e.target.checked)} className="size-4 accent-ink" />
                Charge a different rate outside peak hours
              </label>
              {v.peakOn && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Peak from">
                    <Input type="time" required value={v.peakStart} onChange={(e) => set('peakStart', e.target.value)} />
                  </Field>
                  <Field label="Peak until">
                    <Input type="time" required value={v.peakEnd} onChange={(e) => set('peakEnd', e.target.value)} />
                  </Field>
                  <Field label={`Off-peak rate (${loc.currency})`} hint="The hourly rate above is the peak rate.">
                    <Input inputMode="decimal" required value={v.offPeak} onChange={(e) => set('offPeak', e.target.value)} />
                  </Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`Half-day price (${loc.currency})`} hint="A flat price for up to four hours. Optional.">
                  <Input inputMode="decimal" value={v.halfDay} onChange={(e) => set('halfDay', e.target.value)} />
                </Field>
                <Field label={`Day pass (${loc.currency})`} hint="A flat price for any booking, however long. Optional.">
                  <Input inputMode="decimal" value={v.fullDay} onChange={(e) => set('fullDay', e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </Group>
      )}

      {priced && (
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
