import { isRoomKind } from '../lib/catalogue';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { money } from '../lib/format';
import { useShifts } from '../lib/queries';
import { addDays, fromMinutes, todayIn, toMinutes } from '../lib/time';
import type { Booking, PriceBasis, Resource } from '../types';
import { MemberSelect } from './MemberSelect';
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from './ui';
import { useToast } from './toast';

/** The one line under the price that says where it came from. */
function basisNote(b: PriceBasis | undefined, currency: string, staff: boolean) {
  const who = staff ? "the member's" : 'your';
  if (!b) return '';
  switch (b.type) {
    case 'plan':
      return `Included in ${who} plan`;
    case 'minutes':
      return b.billableMinutes > 0
        ? `${b.freeMinutes} min covered by ${who} included meeting minutes, the rest charged by the hour`
        : `Covered by ${who} included meeting minutes`;
    case 'shift':
      return `${b.name} shift price (set in Shift templates)`;
    case 'hourly':
      return `${money(b.rateCents, currency)} an hour (set on the space)`;
    case 'daily':
      return `${money(b.rateCents, currency)} a day (set on the space)`;
    case 'dayshare':
      return `A share of the day price, ${money(b.rateCents, currency)} a day (set on the space)`;
    default:
      return "Worked out from the space's rates, such as peak hours, half-day or day pass (set on the space)";
  }
}

export interface BookingDraft {
  resourceId?: string;
  date?: string;
  startTime?: string;
}

function BookingForm({
  resources,
  draft,
  staff,
  onDone,
}: {
  resources: Resource[];
  draft: BookingDraft;
  staff: boolean;
  onDone: () => void;
}) {
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const bookable = resources.filter((r) => (isRoomKind(r.kind) || r.kind === 'hot_desk') && r.status === 'available');

  const [memberId, setMemberId] = useState('');
  const [resourceId, setResourceId] = useState(draft.resourceId ?? bookable[0]?.id ?? '');
  const [date, setDate] = useState(draft.date ?? todayIn(loc.timezone));
  const [startTime, setStartTime] = useState(draft.startTime ?? loc.openTime);
  const [endTime, setEndTime] = useState(() =>
    fromMinutes(Math.min(toMinutes(draft.startTime ?? loc.openTime) + 60, toMinutes(loc.closeTime))),
  );
  const [notes, setNotes] = useState('');
  // A hot desk is booked for the whole day unless the person picks times, or one of the owner's shifts.
  const [mode, setMode] = useState<'day' | 'times'>(draft.startTime ? 'times' : 'day');
  const shifts = useShifts(loc.id, staff ? memberId || undefined : undefined, !staff || !!memberId);

  const resource = bookable.find((r) => r.id === resourceId);
  const isDesk = resource?.kind === 'hot_desk';
  const isRoom = (!!resource && isRoomKind(resource.kind)) || (isDesk && mode === 'times');
  const shiftsHere = (shifts.data ?? []).filter((s) => s.active && (s.spaceIds.length ? s.spaceIds.includes(resourceId) : s.resourceId === resourceId || (!s.resourceId && (!s.kind || s.kind === resource?.kind))));
  const today = todayIn(loc.timezone);
  // A space can keep its own opening hours.
  const openTime = resource?.openTime ?? loc.openTime;
  const closeTime = resource?.closeTime ?? loc.closeTime;

  // What it would cost, worked out by the server exactly as booking it would, so peak hours and day passes show before anyone commits.
  const ready = !!resourceId && !!date && (!isRoom || (!!startTime && !!endTime && toMinutes(endTime) > toMinutes(startTime))) && (!staff || !!memberId);
  const quote = useQuery({
    queryKey: ['quote', resourceId, date, isRoom ? startTime : '', isRoom ? endTime : '', staff ? memberId : ''],
    queryFn: () => api.post<{ priceCents: number; billableMinutes: number; basis?: PriceBasis }>('/bookings/quote', { resourceId, memberId: staff ? memberId : undefined, date, startTime: isRoom ? startTime : undefined, endTime: isRoom ? endTime : undefined }),
    enabled: ready,
    retry: false,
    staleTime: 10_000,
  });

  const save = useMutation({
    mutationFn: () =>
      api.post<Booking>('/bookings', {
        resourceId,
        memberId: staff ? memberId : undefined,
        date,
        startTime: isRoom ? startTime : undefined,
        endTime: isRoom ? endTime : undefined,
        notes,
      }),
    onSuccess: (b) => {
      for (const key of ['schedule', 'bookings', 'summary', 'dashboard']) void qc.invalidateQueries({ queryKey: [key] });
      toast.ok(b.priceCents > 0 ? `Booked. ${money(b.priceCents, loc.currency)} will be invoiced.` : 'Booked. Included in the membership plan.');
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {staff && (
        <Field label="Member">
          <MemberSelect locationId={loc.id} value={memberId} onChange={setMemberId} required />
        </Field>
      )}
      <Field label="Space">
        <Select value={resourceId} onChange={(e) => setResourceId(e.target.value)} required>
          <optgroup label="Meeting rooms">
            {bookable
              .filter((r) => r.kind === 'room')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Corporate rooms">
            {bookable
              .filter((r) => r.kind === 'corporate_room')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Hot desks and day offices">
            {bookable
              .filter((r) => r.kind === 'hot_desk')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </optgroup>
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" required min={today} max={addDays(today, 180)} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {isDesk && (
        <div role="group" aria-label="How long" className="flex gap-1.5">
          <Button small variant={mode === 'day' ? 'primary' : 'secondary'} aria-pressed={mode === 'day'} onClick={() => setMode('day')}>
            Whole day
          </Button>
          <Button small variant={mode === 'times' ? 'primary' : 'secondary'} aria-pressed={mode === 'times'} onClick={() => setMode('times')}>
            From and until
          </Button>
        </div>
      )}
      {shiftsHere.length > 0 && (!isDesk || mode === 'times') && (
        <div>
          <p className="mb-1.5 text-sm font-semibold">Shifts</p>
          <div className="flex flex-wrap gap-1.5">
            {shiftsHere.map((s) => {
              const on = s.startTime === startTime && s.endTime === endTime;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setStartTime(s.startTime);
                    setEndTime(s.endTime);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-left text-sm ${on ? 'border-ink bg-ink text-white' : 'border-line bg-paper hover:border-ink/40'}`}
                >
                  <span className="font-semibold">{s.name}</span>{' '}
                  <span className="num">
                    {s.startTime} to {s.endTime}
                  </span>
                  {s.priceCents !== null && <span className="num ml-1">{money(s.priceCents, loc.currency)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {isRoom ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" hint={`Open ${openTime} to ${closeTime}`}>
            <Input type="time" step={900} required min={openTime} max={closeTime} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Until">
            <Input type="time" step={900} required min={openTime} max={closeTime} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
      ) : (
        <p className="rounded-lg bg-plaster px-3 py-2 text-sm">
          The whole day, {openTime} to {closeTime}. Choose "From and until" to book part of it.
        </p>
      )}
      <Field label="Note (optional)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </Field>
      {ready && quote.data && (
        <div role="status" className="rounded-lg bg-plaster px-3 py-2 text-sm">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-slate">Price</span>
            <strong className="num">{quote.data.priceCents > 0 ? money(quote.data.priceCents, loc.currency) : 'Nothing to pay'}</strong>
          </p>
          <p className="mt-0.5 text-xs text-slate">{basisNote(quote.data.basis, loc.currency, staff)}</p>
        </div>
      )}
      {ready && quote.error && !save.error && (
        <p role="status" className="rounded-lg border border-signal-deep/30 bg-hold-wash px-3 py-2 text-sm">
          {errorMessage(quote.error)}
        </p>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || !resourceId}>
          {save.isPending ? 'Booking…' : 'Book it'}
        </Button>
      </div>
    </form>
  );
}

export function BookingModal({
  open,
  onClose,
  resources,
  draft = {},
  staff,
}: {
  open: boolean;
  onClose: () => void;
  resources: Resource[];
  draft?: BookingDraft;
  staff: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="New booking">
      <BookingForm resources={resources} draft={draft} staff={staff} onDone={onClose} />
    </Modal>
  );
}
