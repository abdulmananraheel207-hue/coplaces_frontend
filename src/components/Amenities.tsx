import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { MemberSelect } from './MemberSelect';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input, Loading, Section, Select } from './ui';
import { fromCents, METHOD_LABEL, METHODS, money, toCents } from '../lib/format';
import { FINANCE_KEYS, useAmenities, useAmenityRequests, useRefresh, useResources } from '../lib/queries';
import { fmtTime } from '../lib/time';
import type { Amenity, AmenityRequest, MemberDetail, PaymentMethod } from '../types';

/** What the owner gives a member: the amenities they get free each day (ticked, with how many) and the credit hours on chosen rooms. */
export interface FreeState {
  /** Amenity id to the free amount per day, typed. An amenity that is not here is not ticked. */
  free: Record<string, string>;
  /** Room id to the credit hours a month, typed. A room that is not here is not ticked. */
  rooms: Record<string, string>;
}
export const emptyFree: FreeState = { free: {}, rooms: {} };

export const freeFrom = (m: MemberDetail): FreeState => ({
  free: Object.fromEntries(m.amenities.filter((a) => a.freePerDay > 0).map((a) => [a.amenityId, String(a.freePerDay)])),
  rooms: Object.fromEntries(m.creditResources.map((r) => [r.id, String(r.credits)])),
});

const whole = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : null);

/** Every ticked amenity needs a free amount of at least 1, and every ticked room needs credit hours of at least 1. */
export const freeOk = (f: FreeState, offered: Amenity[] = []) =>
  offered.filter((a) => a.id in f.free).every((a) => whole(f.free[a.id]!) !== null) && Object.values(f.rooms).every((c) => whole(c) !== null);

/** The part of the request body that carries these. Only amenities the location still offers are sent. */
export const freeBody = (f: FreeState, offered: Amenity[] = []) => ({
  amenities: offered.filter((a) => a.id in f.free).map((a) => ({ amenityId: a.id, freePerDay: whole(f.free[a.id]!) ?? 1 })),
  creditRooms: Object.entries(f.rooms).map(([resourceId, c]) => ({ resourceId, credits: whole(c) ?? 1 })),
});

/** Checkboxes for the amenities the space offers: ticking one asks how many the member gets free per day. Then the rooms where they get free credit hours. */
export function FreeFields({ value, onChange }: { value: FreeState; onChange: (f: FreeState) => void }) {
  const loc = useLocation();
  const amenities = useAmenities(loc.id);
  const resources = useResources(loc.id);
  // Only the spaces the owner allowed credit hours on, on the Pricing and credit hours tab.
  const rooms = (resources.data ?? []).filter((r) => r.creditsAllowed && r.status !== 'retired').sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-[13px] font-semibold">Free for this member</legend>
      {amenities.isLoading ? (
        <Loading />
      ) : !amenities.data?.length ? (
        <p className="text-sm text-slate">No amenities yet. Add tea, coffee or food under Settings, Amenities, and they will show here.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate">Tick an amenity to give them some free every day, and say how many. Without a tick they can still order it and pay the price.</p>
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
      <div className="space-y-2">
        <p className="text-[13px] font-semibold">Rooms the credit hours work on</p>
        {resources.isLoading ? (
          <Loading />
        ) : rooms.length === 0 ? (
          <p className="text-sm text-slate">No rooms yet. Allow credit hours on the rooms you choose, on the Pricing and credit hours tab, and they will show here.</p>
        ) : (
          <>
            <p className="text-xs text-slate">Tick a room to give them free credit hours on it each month, and say how many. Two credit hours are one hour. On any other room they pay the normal price.</p>
            {rooms.map((r) => {
              const on = r.id in value.rooms;
              const n = Number(value.rooms[r.id]) || 0;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3">
                  <label className="flex min-w-40 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      checked={on}
                      onChange={() => {
                        const { [r.id]: _gone, ...rest } = value.rooms;
                        void _gone;
                        onChange({ ...value, rooms: on ? rest : { ...rest, [r.id]: '2' } });
                      }}
                    />
                    {r.name}
                  </label>
                  {on && (
                    <label className="flex items-center gap-2 text-sm">
                      <Input
                        inputMode="numeric"
                        aria-label={`Credit hours a month on ${r.name}`}
                        className="w-20"
                        value={value.rooms[r.id]}
                        onChange={(e) => onChange({ ...value, rooms: { ...value.rooms, [r.id]: e.target.value } })}
                      />
                      credit hours a month{n > 0 ? `, ${n / 2} ${n === 2 ? 'hour' : 'hours'} free` : ''}
                    </label>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
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
      void refresh(...FINANCE_KEYS);
    },
  });
  if (!list.data?.length) return null;
  return (
    <Section title="Tea, coffee and food">
      <AmenityRequests />
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
/** Collects what a member owes for amenities at the desk, through the channel they paid with (cash unless changed). */
export function CollectButton({ memberId, label = 'Collected' }: { memberId: string; label?: string }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const collect = useMutation({
    mutationFn: () => api.post('/amenities/collect', { memberId, method }),
    onSuccess: () => {
      toast.ok(method === 'cheque' ? 'Cheque recorded. It counts once it clears' : 'Marked as collected');
      void refresh(...FINANCE_KEYS);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <span className="inline-flex items-center gap-1.5">
      <Select aria-label="How it was paid" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="!w-auto !py-1 text-xs">
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {METHOD_LABEL[m]}
          </option>
        ))}
      </Select>
      <Button small disabled={collect.isPending} onClick={() => collect.mutate()}>
        {label}
      </Button>
    </span>
  );
}

/** On a member's page: what they get free, what they have had today and anything they owe for amenities. */
export function AmenitySection({ m, canCollect }: { m: MemberDetail; canCollect: boolean }) {
  const loc = useLocation();
  if (!m.amenities.length && !m.amenityOwedCents && !m.creditResources.length) return null;
  return (
    <Section title="Amenities and credit hours">
      <div className="space-y-3 text-sm">
        {m.creditResources.length > 0 && (
          <ul className="surface divide-y divide-line px-4">
            {m.creditResources.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="font-semibold">{r.name}</span>
                <span className="text-slate">
                  {r.credits} credit hours a month, {r.credits / 2} {r.credits === 2 ? 'hour' : 'hours'} free
                </span>
              </li>
            ))}
          </ul>
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
            {canCollect && <InvoiceAmenitiesButton memberId={m.id} />}
          </p>
        )}
      </div>
    </Section>
  );
}

/** Front desk: what members have asked for from their free amounts. Serving one records it, free up to their daily amount. */
function AmenityRequests() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const q = useAmenityRequests(loc.id);
  const serve = useMutation({
    mutationFn: (id: string) => api.post<{ order: { chargeCents: number; freeQuantity: number; quantity: number } }>(`/amenities/requests/${id}/serve`),
    onSuccess: (r) => {
      toast.ok(r.order.chargeCents > 0 ? `Served. ${money(r.order.chargeCents, loc.currency)} to collect for the ${r.order.quantity - r.order.freeQuantity} beyond their free amount` : 'Served, free');
      void refresh('amenity-requests', ...FINANCE_KEYS);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const decline = useMutation({
    mutationFn: (id: string) => api.post(`/amenities/requests/${id}/decline`, {}),
    onSuccess: () => void refresh('amenity-requests', 'summary'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!q.data?.length) return null;
  return (
    <ul className="surface mb-4 divide-y divide-line border-l-[6px] border-l-signal-deep px-4" aria-label="Amenity requests from members">
      {q.data.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
          <span>
            <span className="font-semibold">{r.memberName}</span> asked for {r.quantity} {r.name}
            <span className="num ml-2 text-xs text-slate">{fmtTime(r.createdAt, loc.timezone)}</span>
          </span>
          <span className="flex gap-1.5">
            <Button small variant="primary" disabled={serve.isPending} onClick={() => serve.mutate(r.id)}>
              Serve
            </Button>
            <Button small variant="ghost" disabled={decline.isPending} onClick={() => decline.mutate(r.id)}>
              Decline
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Put what a member owes for amenities on an invoice now. */
export function InvoiceAmenitiesButton({ memberId }: { memberId: string }) {
  const toast = useToast();
  const refresh = useRefresh();
  const make = useMutation({
    mutationFn: () => api.post<{ number: string }>('/amenities/invoice', { memberId }),
    onSuccess: (inv) => {
      toast.ok(`Added to invoice ${inv.number}`);
      void refresh(...FINANCE_KEYS);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button small disabled={make.isPending} onClick={() => make.mutate()}>
      Add to invoice
    </Button>
  );
}

const REQUEST_WORD = { pending: 'Waiting for the front desk', served: 'Brought to you', declined: 'Declined', cancelled: 'Cancelled' } as const;

/** Member home: the amenities they get free, a button to ask for one, and the answer to what they asked for. */
export function MyAmenities({ allowance, requests, currency }: { allowance: import('../types').AmenityAllowance[]; requests: AmenityRequest[]; currency: string }) {
  const toast = useToast();
  const refresh = useRefresh();
  const ask = useMutation({
    mutationFn: (amenityId: string) => api.post('/amenities/requests', { amenityId, quantity: 1 }),
    onSuccess: () => {
      toast.ok('Asked. The front desk will bring it.');
      void refresh('summary');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/amenities/requests/${id}/cancel`),
    onSuccess: () => void refresh('summary'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const recent = requests.slice(0, 5);
  return (
    <Section title="Tea, coffee and food">
      <ul className="surface divide-y divide-line px-4 text-sm">
        {allowance.map((a) => {
          const left = Math.max(0, a.freePerDay - a.usedToday);
          return (
            <li key={a.amenityId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold">{a.name}</span>
                <span className="num block text-xs text-slate">
                  {a.freePerDay === 0
                    ? `${money(a.priceCents, currency)} each, added to what you owe`
                    : left > 0
                      ? `${left} of ${a.freePerDay} free left today, then ${money(a.priceCents, currency)} each`
                      : `Free ones used today, then ${money(a.priceCents, currency)} each`}
                </span>
              </span>
              <Button small disabled={ask.isPending} onClick={() => ask.mutate(a.amenityId)} aria-label={`Ask for ${a.name}`}>
                Ask for one
              </Button>
            </li>
          );
        })}
      </ul>
      {recent.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm" aria-label="Your amenity requests">
          {recent.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {r.quantity} {r.name}
                <span className="block text-xs text-slate">
                  {REQUEST_WORD[r.status]}
                  {r.reason ? `: ${r.reason}` : ''}
                </span>
              </span>
              {r.status === 'pending' && (
                <Button small variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
