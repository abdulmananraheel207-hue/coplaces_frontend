import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input, Segmented, Select, Textarea } from './ui';
import { fromCents, KIND_LABEL, toCents } from '../lib/format';
import { useRefresh } from '../lib/queries';
import { fmtDate, todayIn } from '../lib/time';
import type { AvailableSpace, Contract } from '../types';

const REFRESH = ['contracts', 'resources', 'members', 'assignments', 'dashboard'] as const;

/** Who is on a company contract, with a way to add someone or let someone go. */
export function ContractPeople({ contract }: { contract: Contract }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [v, setV] = useState({ name: '', email: '', phone: '', password: '', desk: '' });
  const closed = contract.status === 'ended' || contract.status === 'cancelled';
  const spaces = useQuery({
    queryKey: ['contracts', loc.id, 'available', contract.startDate, contract.endDate],
    queryFn: () => api.get<AvailableSpace[]>('/contracts/available-spaces', { locationId: loc.id, startDate: contract.startDate > todayIn(loc.timezone) ? contract.startDate : todayIn(loc.timezone), endDate: contract.endDate ?? undefined }),
    enabled: adding,
  });
  const own = new Set(contract.people.filter((p) => !p.leaveDate).flatMap((p) => (p.deskResourceId ? [p.deskResourceId] : [])));
  const desks = (spaces.data ?? []).filter((s) => ['hot_desk', 'dedicated_desk'].includes(s.kind) && s.free && !own.has(s.id) && !contract.spaces.some((x) => x.id === s.id));

  const add = useMutation({
    mutationFn: () => api.post(`/contracts/${contract.id}/people`, { name: v.name, email: v.email, phone: v.phone, password: v.password, deskResourceId: v.desk || null }),
    onSuccess: () => {
      toast.ok('Person added');
      setV({ name: '', email: '', phone: '', password: '', desk: '' });
      setAdding(false);
      void refresh(...REFRESH);
    },
  });
  const remove = useMutation({
    mutationFn: (personId: string) => api.post(`/contracts/${contract.id}/people/${personId}/leave`, {}),
    onSuccess: () => {
      toast.ok(contract.status === 'draft' ? 'Person removed' : 'Person has left the contract');
      setConfirming(null);
      void refresh(...REFRESH);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirming(null);
    },
  });
  const here = contract.people.filter((p) => !p.leaveDate);
  const gone = contract.people.filter((p) => p.leaveDate);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">
        {here.length} {here.length === 1 ? 'person' : 'people'}, {contract.seats} {contract.seats === 1 ? 'seat' : 'seats'} in the shared space
        {contract.spaces.length ? ` (${contract.spaces.map((s) => s.name).join(', ')})` : ''}.
        {contract.extraPeople > 0 && ` ${contract.extraPeople} pay the extra-person price.`}
      </p>
      <div className="surface-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>Person</th>
              <th>Sits</th>
              <th>Joined</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {here.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="font-semibold">{p.name}</span>
                  <span className="block text-xs text-slate">{[p.email, p.phone].filter(Boolean).join(' · ')}</span>
                </td>
                <td>{p.deskName ? `Own desk: ${p.deskName}` : 'Shared space'}</td>
                <td className="num whitespace-nowrap">{fmtDate(p.joinDate)}</td>
                <td className="r whitespace-nowrap">
                  {!closed &&
                    (confirming === p.id ? (
                      <>
                        <Button small variant="ghost" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>{' '}
                        <Button small disabled={remove.isPending} onClick={() => remove.mutate(p.id)}>
                          Yes, remove
                        </Button>
                      </>
                    ) : (
                      <Button small variant="ghost" disabled={here.length < 2} title={here.length < 2 ? 'A contract needs one person. End the contract instead.' : undefined} onClick={() => setConfirming(p.id)}>
                        Remove
                      </Button>
                    ))}
                </td>
              </tr>
            ))}
            {gone.map((p) => (
              <tr key={p.id} className="text-slate">
                <td>{p.name}</td>
                <td>{p.deskName ? `Own desk: ${p.deskName}` : 'Shared space'}</td>
                <td className="num whitespace-nowrap">
                  {fmtDate(p.joinDate)} to {fmtDate(p.leaveDate!)}
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!closed &&
        (adding ? (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              add.mutate();
            }}
            className="space-y-3 rounded-lg border border-line p-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input required value={v.name} maxLength={100} onChange={(e) => setV({ ...v, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input required type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={v.phone} maxLength={40} onChange={(e) => setV({ ...v, phone: e.target.value })} />
              </Field>
              <Field label="Password" hint="At least 8 characters.">
                <Input required type="password" autoComplete="new-password" minLength={8} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
              </Field>
            </div>
            <Field label="Where do they sit?" hint={contract.status === 'active' ? 'They can sign in straight away, and a desk is theirs from today.' : undefined}>
              <Select value={v.desk} onChange={(e) => setV({ ...v, desk: e.target.value })}>
                <option value="">In the shared space</option>
                {desks.map((d) => (
                  <option key={d.id} value={d.id}>
                    Own {KIND_LABEL[d.kind].toLowerCase()}: {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            {add.error && <ErrorNote error={new Error(errorMessage(add.error))} />}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={add.isPending}>
                Add person
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={() => setAdding(true)}>Add a person</Button>
        ))}
    </div>
  );
}

/** Company details and prices. Dates change only on a draft; a running contract is extended instead. */
export function CompanyEditForm({ contract, onDone }: { contract: Contract; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const draft = contract.status === 'draft';
  const [v, setV] = useState({
    name: contract.companyName,
    email: contract.companyEmail,
    phone: contract.companyPhone,
    start: contract.startDate,
    end: contract.endDate ?? '',
    mode: contract.pricingMode,
    per: fromCents(contract.pricePerMemberCents),
    extra: fromCents(contract.extraMemberCents),
    fixed: fromCents(contract.fixedPriceCents),
    advance: fromCents(contract.advanceCents),
    deposit: fromCents(contract.depositCents),
    notes: contract.notes,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const advanceLocked = contract.advanceReceivedAt !== null;
  const depositLocked = contract.depositStatus !== 'pending';
  const save = useMutation({
    mutationFn: () => {
      const c = { per: toCents(v.per || '0'), extra: toCents(v.extra || '0'), fixed: toCents(v.fixed || '0'), advance: toCents(v.advance || '0'), deposit: toCents(v.deposit || '0') };
      if (Object.values(c).some((x) => x === null)) throw new Error('Enter every price as a number, like 25000');
      return api.patch(`/contracts/${contract.id}/company`, {
        companyName: v.name,
        companyEmail: v.email,
        companyPhone: v.phone,
        ...(draft ? { startDate: v.start, endDate: v.end || null } : {}),
        pricingMode: v.mode,
        pricePerMemberCents: c.per,
        extraMemberCents: c.extra,
        fixedPriceCents: c.fixed,
        ...(advanceLocked ? {} : { advanceCents: c.advance }),
        ...(depositLocked ? {} : { depositCents: c.deposit }),
        notes: v.notes,
      });
    },
    onSuccess: () => {
      toast.ok('Contract updated');
      void refresh(...REFRESH);
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
      <Field label="Company name">
        <Input required value={v.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business email">
          <Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Business phone">
          <Input value={v.phone} maxLength={40} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Starts" hint={draft ? undefined : 'Dates are fixed once a contract has started.'}>
          <Input type="date" required disabled={!draft} value={v.start} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label="Ends" hint={draft ? undefined : 'Use Extend to move the end later.'}>
          <Input type="date" disabled={!draft} min={v.start} value={v.end} onChange={(e) => set('end', e.target.value)} />
        </Field>
      </div>
      <Segmented
        label="How is the space charged?"
        value={v.mode}
        onChange={(m) => set('mode', m)}
        options={[
          { value: 'per_member', label: 'Per member' },
          { value: 'fixed', label: 'One price for the space' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {v.mode === 'fixed' && (
          <Field label={`Price for the space, per month (${loc.currency})`}>
            <Input inputMode="decimal" value={v.fixed} onChange={(e) => set('fixed', e.target.value)} />
          </Field>
        )}
        <Field label={`${v.mode === 'fixed' ? 'Per member with their own desk' : 'Price per member'}, per month (${loc.currency})`}>
          <Input inputMode="decimal" value={v.per} onChange={(e) => set('per', e.target.value)} />
        </Field>
        <Field label={`Extra person, per month (${loc.currency})`}>
          <Input inputMode="decimal" value={v.extra} onChange={(e) => set('extra', e.target.value)} />
        </Field>
        <Field label={`Advance (${loc.currency})`} hint={advanceLocked ? 'Already received, so it cannot change.' : undefined}>
          <Input inputMode="decimal" disabled={advanceLocked} value={v.advance} onChange={(e) => set('advance', e.target.value)} />
        </Field>
        <Field label={`Security deposit (${loc.currency})`} hint={depositLocked ? 'Already received, so it cannot change.' : undefined}>
          <Input inputMode="decimal" disabled={depositLocked} value={v.deposit} onChange={(e) => set('deposit', e.target.value)} />
        </Field>
      </div>
      {!draft && <p className="text-xs text-slate">New prices apply to invoices from now on. Invoices already made are not changed.</p>}
      <Field label="Notes">
        <Textarea value={v.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!v.name.trim() || save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** Moves the end of a running contract later. */
export function ExtendForm({ contract, onDone }: { contract: Contract; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [end, setEnd] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/contracts/${contract.id}/extend`, { endDate: end }),
    onSuccess: () => {
      toast.ok('Contract extended');
      void refresh(...REFRESH);
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
      <p className="text-sm">
        {contract.companyName} now runs until <strong>{contract.endDate ? fmtDate(contract.endDate) : 'no end date'}</strong>. The same spaces and desks are kept, unless someone else has them by the new date.
      </p>
      <Field label="New end date">
        <Input type="date" required min={contract.endDate ?? undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!end || save.isPending}>
          Extend
        </Button>
      </div>
    </form>
  );
}
