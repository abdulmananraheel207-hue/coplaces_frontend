import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { MemberSelect } from './MemberSelect';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input, Loading, Section, Select } from './ui';
import { fromCents, money, toCents } from '../lib/format';
import { useAmenities, useRefresh } from '../lib/queries';
import type { Amenity, MemberDetail } from '../types';

/** What the owner gives a member: the amenities they get free each day (ticked, with how many) and their meeting room credit hours. */
export interface FreeState {
  /** Amenity id to the free amount per day, typed. An amenity that is not here is not ticked. */
  free: Record<string, string>;
  credits: string;
}
export const emptyFree: FreeState = { free: {}, credits: '' };

export const freeFrom = (m: MemberDetail): FreeState => ({
  free: Object.fromEntries(m.amenities.filter((a) => a.freePerDay > 0).map((a) => [a.amenityId, String(a.freePerDay)])),
  credits: m.meetingCredits ? String(m.meetingCredits) : '',
});

const whole = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : null);

/** Every ticked amenity needs a free amount of at least 1, and the credit hours must be a whole number. */
export const freeOk = (f: FreeState, offered: Amenity[] = []) =>
  offered.filter((a) => a.id in f.free).every((a) => whole(f.free[a.id]!) !== null) && (f.credits.trim() === '' || /^\d+$/.test(f.credits.trim()));

/** The part of the request body that carries these. Only amenities the location still offers are sent. */
export const freeBody = (f: FreeState, offered: Amenity[] = []) => ({
  amenities: offered.filter((a) => a.id in f.free).map((a) => ({ amenityId: a.id, freePerDay: whole(f.free[a.id]!) ?? 1 })),
  meetingCredits: f.credits.trim() === '' ? 0 : Number(f.credits),
});

/** Checkboxes for the amenities the space offers: ticking one asks how many the member gets free per day. Then the meeting room credit hours. */
export function FreeFields({ value, onChange }: { value: FreeState; onChange: (f: FreeState) => void }) {
  const loc = useLocation();
  const amenities = useAmenities(loc.id);
  const credits = Number(value.credits) || 0;
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-[13px] font-semibold">Free for this member</legend>
      {amenities.isLoading ? (
        <Loading />
      ) : !amenities.data?.length ? (
        <p className="text-sm text-slate">No amenities yet. Add tea, coffee or food under Settings, Amenities, and they will show here.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate">Tick what they get free every day and say how many. After that they pay the price.</p>
          {amenities.data.map((a) => {
            const on = a.id in value.free;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-40 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-ink"
                    checked={on}
                    onChange={() => {
                      const { [a.id]: _gone, ...rest } = value.free;
                      void _gone;
                      onChange({ ...value, free: on ? rest : { ...rest, [a.id]: '1' } });
                    }}
                  />
                  {a.name} <span className="text-slate">({money(a.priceCents, loc.currency)} each)</span>
                </label>
                {on && (
                  <label className="flex items-center gap-2 text-sm">
                    <Input
                      inputMode="numeric"
                      aria-label={`Free ${a.name} per day`}
                      className="w-20"
                      value={value.free[a.id]}
                      onChange={(e) => onChange({ ...value, free: { ...value.free, [a.id]: e.target.value } })}
                    />
                    free per day
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Field
        label="Meeting room credit hours per month"
        hint={credits > 0 ? `${credits} credit hours are ${credits / 2} ${credits === 2 ? 'hour' : 'hours'} of free meeting room each month. Beyond that they pay the room's price.` : 'Two credit hours are one hour of free meeting room. Leave empty for none.'}
      >
        <Input inputMode="numeric" className="w-32" value={value.credits} onChange={(e) => onChange({ ...value, credits: e.target.value })} />
      </Field>
    </fieldset>
  );
}

/** Settings: the owner's list of amenities, each with only a name and a price. */
export function AmenitiesSetup() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const list = useAmenities(loc.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Amenity | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const reset = () => {
    setAdding(false);
    setEditing(null);
    setName('');
    setPrice('');
  };
  const save = useMutation({
    mutationFn: () => {
      const priceCents = toCents(price);
      if (priceCents === null) throw new Error('Enter the price as a number');
      return editing ? api.patch(`/amenities/${editing.id}`, { name, priceCents }) : api.post('/amenities', { locationId: loc.id, name, priceCents });
    },
    onSuccess: () => {
      toast.ok(editing ? 'Amenity updated' : 'Amenity added');
      reset();
      void refresh('amenities');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/amenities/${id}`),
    onSuccess: () => void refresh('amenities', 'member'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const open = adding || editing !== null;
  return (
    <Section title="Amenities" aside={!open && <Button small variant="primary" onClick={() => setAdding(true)}>Add amenity</Button>}>
      <p className="mb-3 text-sm text-slate">Things like tea, coffee or food. When you add or edit a member you choose how many of each they get free per day; beyond that they pay the price here.</p>
      {open && (
        <form
          className="mb-4 flex flex-wrap items-end gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Name" className="min-w-48 flex-1">
            <Input required autoFocus maxLength={60} placeholder="Tea, Coffee, Lunch" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={`Price (${loc.currency})`}>
            <Input required inputMode="decimal" className="w-32" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {editing ? 'Save' : 'Add'}
          </Button>
          <Button onClick={reset}>Cancel</Button>
        </form>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.length ? (
        <p className="text-sm text-slate">No amenities yet.</p>
      ) : (
        <ul className="surface divide-y divide-line px-4">
          {list.data.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{a.name}</span>
                <span className="text-slate">, {money(a.priceCents, loc.currency)}</span>
              </span>
              <span className="flex gap-1">
                <Button
                  small
                  variant="ghost"
                  onClick={() => {
                    setEditing(a);
                    setAdding(false);
                    setName(a.name);
                    setPrice(fromCents(a.priceCents));
                  }}
                >
                  Edit
                </Button>
                <Button small variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(a.id)} aria-label={`Remove ${a.name}`}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Front desk: record that a member was given something. It says at once whether it was free or what to collect. */
export function AmenityDesk() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const list = useAmenities(loc.id);
  const [memberId, setMemberId] = useState('');
  const [amenityId, setAmenityId] = useState('');
  const [qty, setQty] = useState('1');
  const give = useMutation({
    mutationFn: () => api.post<{ name: string; quantity: number; freeQuantity: number; chargeCents: number }>('/amenities/orders', { memberId, amenityId, quantity: Number(qty) }),
    onSuccess: (o) => {
      toast.ok(o.chargeCents > 0 ? `${o.quantity} ${o.name}: ${money(o.chargeCents, loc.currency)} to collect${o.freeQuantity ? `, ${o.freeQuantity} free` : ''}` : `${o.quantity} ${o.name}: free`);
      setQty('1');
      void refresh('member', 'members', 'reports', 'finance', 'summary');
    },
  });
  if (!list.data?.length) return null;
  return (
    <Section title="Tea, coffee and food">
      <form
        className="surface space-y-3 p-5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          give.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <Field label="Member">
            <MemberSelect locationId={loc.id} value={memberId} onChange={setMemberId} required />
          </Field>
          <Field label="Given">
            <Select required value={amenityId} onChange={(e) => setAmenityId(e.target.value)}>
              <option value="">Choose…</option>
              {list.data.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({money(a.priceCents, loc.currency)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How many">
            <Input inputMode="numeric" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-slate">Up to the member's free amount for the day costs nothing. Anything beyond that is added to what they owe, to collect.</p>
        {give.error && <ErrorNote error={new Error(errorMessage(give.error))} />}
        <Button type="submit" variant="primary" disabled={!memberId || !amenityId || !/^[1-9]\d*$/.test(qty) || give.isPending}>
          Record
        </Button>
      </form>
    </Section>
  );
}

/** The member collected what they owe for amenities. */
export function CollectButton({ memberId, label = 'Collected' }: { memberId: string; label?: string }) {
  const toast = useToast();
  const refresh = useRefresh();
  const collect = useMutation({
    mutationFn: () => api.post('/amenities/collect', { memberId }),
    onSuccess: () => {
      toast.ok('Marked as collected');
      void refresh('member', 'reports', 'finance', 'summary');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button small disabled={collect.isPending} onClick={() => collect.mutate()}>
      {label}
    </Button>
  );
}

/** On a member's page: what they get free, what they have had today and anything they owe for amenities. */
export function AmenitySection({ m, canCollect }: { m: MemberDetail; canCollect: boolean }) {
  const loc = useLocation();
  if (!m.amenities.length && !m.amenityOwedCents && !m.meetingCredits) return null;
  return (
    <Section title="Amenities and credit hours">
      <div className="space-y-3 text-sm">
        {m.meetingCredits > 0 && (
          <p>
            <strong>{m.meetingCredits} meeting room credit hours</strong> a month, which is {m.meetingCredits / 2} {m.meetingCredits === 2 ? 'hour' : 'hours'} free.
          </p>
        )}
        {m.amenities.length > 0 && (
          <ul className="surface divide-y divide-line px-4">
            {m.amenities.map((a) => (
              <li key={a.amenityId} className="flex items-baseline justify-between gap-3 py-2">
                <span className="font-semibold">{a.name}</span>
                <span className="text-slate">
                  {a.freePerDay} free per day, {a.usedToday} today, then {money(a.priceCents, loc.currency)} each
                </span>
              </li>
            ))}
          </ul>
        )}
        {m.amenityOwedCents > 0 && (
          <p className="flex flex-wrap items-center gap-3">
            <span>
              <strong>{money(m.amenityOwedCents, loc.currency)}</strong> to collect for amenities.
            </span>
            {canCollect && <CollectButton memberId={m.id} />}
          </p>
        )}
      </div>
    </Section>
  );
}
