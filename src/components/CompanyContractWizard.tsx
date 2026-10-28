import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { floorLabel } from './space3d/layout';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input, Loading, Segmented, Select, Textarea } from './ui';
import { KIND_LABEL, money, toCents } from '../lib/format';
import { useRefresh } from '../lib/queries';
import { todayIn } from '../lib/time';
import type { AvailableSpace } from '../types';

const STEPS = ['Company', 'How long', 'How many people', 'The people', 'Space', 'Price', 'Review'] as const;
const DESK_KINDS = ['hot_desk', 'dedicated_desk'];

interface Row {
  name: string;
  email: string;
  phone: string;
  password: string;
  /** Empty means they share the company's space; otherwise the id of their own desk. */
  desk: string;
}
const blank = (): Row => ({ name: '', email: '', phone: '', password: '', desk: '' });

/** Fills in a company: who, how long, who comes, where they sit, and what it costs. Saved as a draft, or started at once. */
export function CompanyContractWizard({ onDone }: { onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [step, setStep] = useState(0);
  const [co, setCo] = useState({ name: '', email: '', phone: '' });
  const [dates, setDates] = useState({ start: todayIn(loc.timezone), end: '' });
  const [count, setCount] = useState('1');
  const [people, setPeople] = useState<Row[]>([blank()]);
  const [showPw, setShowPw] = useState(false);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [price, setPrice] = useState({ mode: 'per_member' as 'per_member' | 'fixed', per: '', extra: '', fixed: '', advance: '', deposit: '', notes: '' });
  const setP = <K extends keyof typeof price>(k: K, v: (typeof price)[K]) => setPrice((x) => ({ ...x, [k]: v }));

  const n = Math.max(0, Math.min(200, Math.floor(Number(count) || 0)));
  const resize = (raw: string) => {
    setCount(raw);
    const m = Math.max(0, Math.min(200, Math.floor(Number(raw) || 0)));
    setPeople((cur) => (m <= cur.length ? cur.slice(0, m) : [...cur, ...Array.from({ length: m - cur.length }, blank)]));
  };
  const setRow = (i: number, patch: Partial<Row>) => setPeople((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const spaces = useQuery({
    queryKey: ['contracts', loc.id, 'available', dates.start, dates.end],
    queryFn: () => api.get<AvailableSpace[]>('/contracts/available-spaces', { locationId: loc.id, startDate: dates.start, endDate: dates.end || undefined }),
    enabled: step >= 4,
  });
  const all = spaces.data ?? [];
  const desks = all.filter((s) => DESK_KINDS.includes(s.kind));
  const sharing = people.filter((p) => !p.desk).length;
  const seats = all.filter((s) => spaceIds.includes(s.id)).reduce((t, s) => t + s.capacity, 0);
  const extra = Math.max(0, sharing - seats);

  const cents = (s: string) => (s.trim() === '' ? 0 : toCents(s));
  const per = cents(price.per);
  const ext = cents(price.extra);
  const fix = cents(price.fixed);
  const adv = cents(price.advance);
  const dep = cents(price.deposit);
  const pricesOk = [per, ext, fix, adv, dep].every((x) => x !== null) && (price.mode === 'per_member' ? (per ?? 0) > 0 : (fix ?? 0) > 0);

  const terms = { pricingMode: price.mode, pricePerMemberCents: per ?? 0, extraMemberCents: ext ?? 0, fixedPriceCents: fix ?? 0 };
  const quote = useQuery({
    queryKey: ['contracts', 'quote', terms, people.map((p) => !!p.desk), spaceIds],
    queryFn: () => api.post<{ totalCents: number; extraPeople: number; seats: number; lines: { description: string; amountCents: number }[] }>('/contracts/quote', { locationId: loc.id, ...terms, people: people.map((p) => ({ hasDesk: !!p.desk })), spaceIds }),
    enabled: step >= 5 && pricesOk,
  });

  const emails = people.map((p) => p.email.trim().toLowerCase());
  const peopleOk = people.length > 0 && people.every((p) => p.name.trim() && /^\S+@\S+\.\S+$/.test(p.email.trim()) && p.password.length >= 8) && new Set(emails).size === emails.length;
  const problem = [
    step === 0 && !co.name.trim() && 'Enter the company name.',
    step === 1 && dates.end && dates.end < dates.start && 'The contract cannot end before it starts.',
    step === 2 && n < 1 && 'At least one person is coming.',
    step === 3 && !peopleOk && 'Every person needs a name, a different email, and a password of at least 8 characters.',
    step === 4 && sharing > 0 && !spaceIds.length && 'Choose a space for the people who share. Or give each person a desk.',
    step === 5 && !pricesOk && (price.mode === 'per_member' ? 'Enter the price per member.' : 'Enter the price for the space.'),
  ].find(Boolean) as string | false | undefined;

  const save = useMutation({
    mutationFn: async (start: boolean) => {
      const made = await api.post<{ id: string }>('/contracts/company', {
        locationId: loc.id,
        companyName: co.name,
        companyEmail: co.email,
        companyPhone: co.phone,
        startDate: dates.start,
        endDate: dates.end || null,
        ...terms,
        advanceCents: adv ?? 0,
        depositCents: dep ?? 0,
        notes: price.notes,
        spaceIds,
        people: people.map((p) => ({ name: p.name, email: p.email, phone: p.phone, password: p.password, deskResourceId: p.desk || null })),
      });
      if (start) await api.post(`/contracts/${made.id}/activate`);
      return start;
    },
    onSuccess: (started) => {
      toast.ok(started ? 'Contract started. The employees can sign in.' : 'Contract saved as a draft');
      void refresh('contracts', 'resources', 'members', 'assignments', 'dashboard');
      onDone();
    },
  });

  const taken = (i: number) => new Set([...people.filter((_, j) => j !== i).map((p) => p.desk), ...spaceIds]);
  const toggleSpace = (id: string) => setSpaceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const last = step === STEPS.length - 1;

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full px-2.5 py-1 ${i === step ? 'bg-ink text-white' : i < step ? 'bg-plaster font-semibold' : 'bg-plaster text-slate'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-3">
          <Field label="Company name">
            <Input autoFocus value={co.name} maxLength={120} onChange={(e) => setCo({ ...co, name: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business email">
              <Input type="email" value={co.email} onChange={(e) => setCo({ ...co, email: e.target.value })} />
            </Field>
            <Field label="Business phone">
              <Input value={co.phone} maxLength={40} onChange={(e) => setCo({ ...co, phone: e.target.value })} />
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <Input type="date" required value={dates.start} onChange={(e) => setDates({ ...dates, start: e.target.value })} />
          </Field>
          <Field label="Ends" hint="Leave empty if it has no end date.">
            <Input type="date" min={dates.start} value={dates.end} onChange={(e) => setDates({ ...dates, end: e.target.value })} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <Field label="How many people from the company will be coming?" hint="You can add or remove people later.">
          <Input type="number" min={1} max={200} value={count} onChange={(e) => resize(e.target.value)} className="max-w-32" />
        </Field>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate">Each person signs in with their email and the password you set. They have no plan.</p>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-ink" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
              Show passwords
            </label>
          </div>
          <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
            {people.map((p, i) => (
              <fieldset key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold text-slate">Person {i + 1}</legend>
                <Field label="Name">
                  <Input value={p.name} maxLength={100} onChange={(e) => setRow(i, { name: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={p.email} onChange={(e) => setRow(i, { email: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={p.phone} maxLength={40} onChange={(e) => setRow(i, { phone: e.target.value })} />
                </Field>
                <Field label="Password" hint="At least 8 characters.">
                  <Input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={p.password} onChange={(e) => setRow(i, { password: e.target.value })} />
                </Field>
              </fieldset>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          {spaces.isLoading ? (
            <Loading />
          ) : (
            <>
              <div>
                <p className="mb-1 text-[13px] font-semibold">Space the company shares</p>
                <div className="max-h-52 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
                  {[...new Set(all.map((s) => s.floor))].map((f) => (
                    <fieldset key={f}>
                      <legend className="mb-1 text-xs font-semibold tracking-wide text-slate uppercase">{floorLabel(f)}</legend>
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {all
                          .filter((s) => s.floor === f)
                          .map((s) => (
                            <label key={s.id} className={`flex items-center gap-2 text-sm ${s.free ? '' : 'text-slate'}`}>
                              <input type="checkbox" className="size-4 accent-ink" disabled={!s.free || people.some((p) => p.desk === s.id)} checked={spaceIds.includes(s.id)} onChange={() => toggleSpace(s.id)} />
                              <span>
                                {s.name} <span className="text-slate">({KIND_LABEL[s.kind]}, seats {s.capacity}){s.busy ? `, ${s.busy.toLowerCase()}` : ''}</span>
                              </span>
                            </label>
                          ))}
                      </div>
                    </fieldset>
                  ))}
                  {!all.length && <p className="text-sm text-slate">There are no rooms or desks to choose from.</p>}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[13px] font-semibold">Where does each person sit?</p>
                <div className="space-y-1.5">
                  {people.map((p, i) => (
                    <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
                      <span className="text-sm">{p.name || `Person ${i + 1}`}</span>
                      <Select value={p.desk} onChange={(e) => setRow(i, { desk: e.target.value })} aria-label={`Where ${p.name || `person ${i + 1}`} sits`}>
                        <option value="">In the shared space</option>
                        {desks
                          .filter((d) => d.free && (!taken(i).has(d.id) || p.desk === d.id))
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              Own {KIND_LABEL[d.kind].toLowerCase()}: {d.name}
                            </option>
                          ))}
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <p className={`rounded-lg px-3 py-2 text-sm ${extra > 0 ? 'bg-hold/15' : 'bg-plaster'}`}>
                {sharing} {sharing === 1 ? 'person shares' : 'people share'} a space with {seats} {seats === 1 ? 'seat' : 'seats'}.
                {extra > 0 && ` ${extra} will be charged the extra-person price, because the space has no seat for ${extra === 1 ? 'them' : 'them all'}. You can choose a bigger space or give them a desk instead.`}
              </p>
            </>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <Segmented
            label="How is the space charged?"
            value={price.mode}
            onChange={(v) => setP('mode', v)}
            options={[
              { value: 'per_member', label: 'Per member' },
              { value: 'fixed', label: 'One price for the space' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {price.mode === 'per_member' ? (
              <Field label={`Price per member, per month (${loc.currency})`}>
                <Input inputMode="decimal" value={price.per} onChange={(e) => setP('per', e.target.value)} />
              </Field>
            ) : (
              <>
                <Field label={`Price for the space, per month (${loc.currency})`}>
                  <Input inputMode="decimal" value={price.fixed} onChange={(e) => setP('fixed', e.target.value)} />
                </Field>
                <Field label={`Price per member with their own desk (${loc.currency})`} hint="Only used for people who have a desk of their own.">
                  <Input inputMode="decimal" value={price.per} onChange={(e) => setP('per', e.target.value)} />
                </Field>
              </>
            )}
            <Field label={`Extra person, per month (${loc.currency})`} hint="Charged for each person the shared space has no seat for.">
              <Input inputMode="decimal" value={price.extra} onChange={(e) => setP('extra', e.target.value)} />
            </Field>
            <Field label={`Advance (${loc.currency})`} hint="Rent taken up front. Optional.">
              <Input inputMode="decimal" value={price.advance} onChange={(e) => setP('advance', e.target.value)} />
            </Field>
            <Field label={`Security deposit (${loc.currency})`} hint="Held and given back at the end. Optional.">
              <Input inputMode="decimal" value={price.deposit} onChange={(e) => setP('deposit', e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-slate">Company</dt>
            <dd className="font-semibold">{co.name}{co.email || co.phone ? ` · ${[co.email, co.phone].filter(Boolean).join(' · ')}` : ''}</dd>
            <dt className="text-slate">Period</dt>
            <dd>{dates.start} to {dates.end || 'no end date'}</dd>
            <dt className="text-slate">People</dt>
            <dd>{people.length} ({people.filter((p) => p.desk).length} with their own desk)</dd>
            <dt className="text-slate">Shared space</dt>
            <dd>{all.filter((s) => spaceIds.includes(s.id)).map((s) => s.name).join(', ') || 'None'}</dd>
          </dl>
          {quote.isLoading ? (
            <Loading />
          ) : quote.data ? (
            <div className="rounded-lg bg-plaster p-3 text-sm">
              <ul className="space-y-0.5">
                {quote.data.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{l.description}</span>
                    <span className="num">{money(l.amountCents, loc.currency)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between gap-3 border-t border-line pt-2 text-base font-semibold">
                <span>Each month</span>
                <span className="num">{money(quote.data.totalCents, loc.currency)}</span>
              </p>
              {(adv ?? 0) > 0 && <p className="mt-1 text-slate">Advance {money(adv ?? 0, loc.currency)}{(dep ?? 0) > 0 ? `, security deposit ${money(dep ?? 0, loc.currency)}` : ''}.</p>}
              {!(adv ?? 0) && (dep ?? 0) > 0 && <p className="mt-1 text-slate">Security deposit {money(dep ?? 0, loc.currency)}.</p>}
            </div>
          ) : null}
          <Field label="Notes">
            <Textarea value={price.notes} maxLength={1000} onChange={(e) => setP('notes', e.target.value)} rows={2} />
          </Field>
          <p className="text-xs text-slate">Part months are charged by the day. Employee bookings, like meeting rooms, go on the company's invoice.</p>
        </div>
      )}

      {problem && <p className="text-sm text-busy">{problem}</p>}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex flex-wrap justify-between gap-2">
        <Button onClick={step === 0 ? onDone : () => setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {last ? (
          <span className="flex gap-2">
            <Button disabled={save.isPending} onClick={() => save.mutate(false)}>
              Save as draft
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(true)}>
              Save and start now
            </Button>
          </span>
        ) : (
          <Button variant="primary" disabled={!!problem} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
