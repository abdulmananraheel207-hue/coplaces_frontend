import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { CredentialsModal } from '../../components/Credentials';
import { Button, Chip, ErrorNote, Field, Input, Ledger, Loading, Modal, PageHeader, Section, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';
import { fromCents, METHOD_LABEL, money, toCents } from '../../lib/format';
import { useRefresh } from '../../lib/queries';
import { daysBetween, fmtDate, localDateOf, todayIn } from '../../lib/time';
import type { FeatureDef, OrgDetail, PaymentMethod } from '../../types';
import { intervalLabel, StatusChip } from './common';
import { usePackages } from './Spaces';

const useCatalog = () => useQuery({ queryKey: ['platform', 'features'], queryFn: () => api.get<{ features: FeatureDef[]; core: string[] }>('/platform/features'), staleTime: Infinity });

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between">
        <span>{label}</span>
        <span className="num font-semibold">{used}{limit ? ` of ${limit}` : ' (no limit)'}</span>
      </div>
      {limit ? (
        <div className="h-2 overflow-hidden rounded-full bg-plaster" aria-hidden>
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-signal-deep' : 'bg-ink'}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function EditForm({ org, onDone }: { org: OrgDetail; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({ name: org.name, city: org.city, contactEmail: org.contactEmail, phone: org.phone, periodEnd: org.periodEnd, notes: org.notes });
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => api.patch(`/platform/organizations/${org.id}`, v),
    onSuccess: () => {
      toast.ok('Details saved');
      void refresh('platform');
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input required value={v.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={v.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Business email">
          <Input type="email" value={v.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={v.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Subscription valid until" hint="Recording a payment moves this forward for you.">
          <Input type="date" required value={v.periodEnd} onChange={(e) => set('periodEnd', e.target.value)} />
        </Field>
      </div>
      <Field label="Internal notes">
        <Textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function PackageForm({ org, onDone }: { org: OrgDetail; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const packages = usePackages();
  const [packageId, setPackageId] = useState(org.package.id);
  const save = useMutation({
    mutationFn: () => api.patch(`/platform/organizations/${org.id}`, { packageId }),
    onSuccess: () => {
      toast.ok('Package changed. Their features update straight away.');
      void refresh('platform');
      onDone();
    },
  });
  const options = packages.data?.filter((p) => p.active || p.id === org.package.id) ?? [];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <Field label="Package">
        <Select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {money(p.priceCents, 'PKR')} / {intervalLabel(p.interval)}
              {p.active ? '' : ' (no longer offered)'}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-slate">Features and limits change for {org.name} immediately. Nothing is deleted if the new package has less: those screens just become unavailable.</p>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || packageId === org.package.id}>
          Change package
        </Button>
      </div>
    </form>
  );
}

function PaymentForm({ org, onDone }: { org: OrgDetail; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [periods, setPeriods] = useState('1');
  const [amount, setAmount] = useState(fromCents(org.package.priceCents));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const cents = toCents(amount);
      if (!cents) throw new Error('Enter the amount received as a number, like 19000');
      return api.post(`/platform/organizations/${org.id}/payments`, { amountCents: cents, method, periods: Number(periods), reference });
    },
    onSuccess: () => {
      toast.ok('Payment recorded and subscription extended');
      void refresh('platform');
      onDone();
    },
  });
  const unit = org.package.interval === 'year' ? 'year' : 'month';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-sm">
        {org.package.name} is {money(org.package.priceCents, 'PKR')} per {unit}. The subscription runs on from {fmtDate(org.periodEnd >= todayIn('Asia/Karachi') ? org.periodEnd : todayIn('Asia/Karachi'))}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${unit === 'year' ? 'Years' : 'Months'} paid for`}>
          <Input
            type="number"
            min={1}
            max={36}
            required
            value={periods}
            onChange={(e) => {
              setPeriods(e.target.value);
              const n = Number(e.target.value);
              if (n > 0) setAmount(fromCents(org.package.priceCents * n));
            }}
          />
        </Field>
        <Field label="Amount received (PKR)">
          <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid by">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference (optional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
        </Field>
      </div>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Record payment
        </Button>
      </div>
    </form>
  );
}

export default function SpaceDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const refresh = useRefresh();
  const [modal, setModal] = useState<'edit' | 'package' | 'payment' | null>(null);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);
  const catalog = useCatalog();
  const q = useQuery({ queryKey: ['platform', 'org', id], queryFn: () => api.get<OrgDetail>(`/platform/organizations/${id}`) });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/platform/organizations/${id}`, { status }),
    onSuccess: (_d, status) => {
      toast.ok(status === 'suspended' ? 'Suspended. Nobody there can sign in.' : 'Reactivated');
      void refresh('platform');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: () => api.post<{ name: string; email: string; tempPassword: string }>(`/platform/organizations/${id}/reset-owner-password`, {}),
    onSuccess: (r) => setCreds({ name: r.name, email: r.email, password: r.tempPassword }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error ?? new Error('Not found')} />;
  const o = q.data;
  const today = todayIn('Asia/Karachi');
  const left = daysBetween(today, o.periodEnd);
  const included = new Set(o.package.features);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/spaces" className="font-semibold underline underline-offset-2">
          Coworking spaces
        </Link>
      </p>
      <PageHeader title={o.name} sub={[o.city, o.contactEmail, o.phone].filter(Boolean).join(', ') || undefined}>
        <StatusChip status={o.status} expired={o.expired} />
        <Button onClick={() => setModal('edit')}>Edit details</Button>
        <Button onClick={() => setModal('package')}>Change package</Button>
        <Button variant="primary" onClick={() => setModal('payment')}>
          Record payment
        </Button>
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-9">
          <Section title="Features in this package" aside={`${o.package.name}`}>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {catalog.data?.features.map((f) => (
                <li key={f.key} className={`flex items-start gap-2 text-sm ${included.has(f.key) ? '' : 'text-slate'}`}>
                  {included.has(f.key) ? <Check size={16} className="mt-0.5 shrink-0 text-ok" aria-label="Included" /> : <Minus size={16} className="mt-0.5 shrink-0" aria-label="Not included" />}
                  <span>
                    <span className={included.has(f.key) ? 'font-semibold' : ''}>{f.label}</span>
                    <span className="block text-xs text-slate">{f.description}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate">Always included: {catalog.data?.core.join(', ').toLowerCase()}.</p>
          </Section>

          <Section title="Locations">
            <div className="surface-table">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Code</th>
                    <th>Time zone</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {o.locations.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="font-semibold">{l.name}</span>
                        {l.address && <span className="block text-xs text-slate">{l.address}</span>}
                      </td>
                      <td>{l.code}</td>
                      <td>{l.timezone}</td>
                      <td>{l.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Subscription payments">
            {o.payments.length === 0 ? (
              <p className="text-sm text-slate">No payments recorded yet.</p>
            ) : (
              <div className="surface-table">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Covers</th>
                      <th>Paid by</th>
                      <th className="r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="num whitespace-nowrap">{fmtDate(localDateOf(p.paidAt, 'Asia/Karachi'))}</td>
                        <td className="num whitespace-nowrap">
                          {fmtDate(p.periodStart)} to {fmtDate(p.periodEnd)}
                        </td>
                        <td>
                          {METHOD_LABEL[p.method]}
                          {p.reference && <span className="text-slate">, {p.reference}</span>}
                        </td>
                        <td className="r font-semibold">{money(p.amountCents, 'PKR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-9">
          <Section title="Subscription">
            <Ledger
              rows={[
                { label: 'Package', value: o.package.name },
                { label: 'Price', value: `${money(o.package.priceCents, 'PKR')} / ${intervalLabel(o.package.interval)}` },
                { label: 'Valid until', value: fmtDate(o.periodEnd) },
                {
                  label: o.status === 'trial' ? 'Trial' : 'Renewal',
                  value: left < 0 ? `${-left} days overdue` : left === 0 ? 'Today' : `In ${left} days`,
                  tone: left < 0 ? 'busy' : undefined,
                },
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {o.status === 'suspended' || o.status === 'cancelled' ? (
                <Button onClick={() => setStatus.mutate('active')} disabled={setStatus.isPending}>
                  Reactivate
                </Button>
              ) : (
                <Button
                  variant="danger"
                  disabled={setStatus.isPending}
                  onClick={() => {
                    if (window.confirm(`Suspend ${o.name}? Their owner, staff and members will be signed out and unable to sign in until you reactivate.`)) setStatus.mutate('suspended');
                  }}
                >
                  Suspend access
                </Button>
              )}
            </div>
          </Section>

          <Section title="Usage">
            <div className="space-y-4">
              <Usage label="Locations" used={o.usage.locations} limit={o.package.maxLocations} />
              <Usage label="Members (not cancelled)" used={o.usage.members} limit={o.package.maxMembers} />
              <p className="text-sm text-slate">
                {o.usage.activeMembers} active members, {o.usage.staff} staff accounts.
              </p>
            </div>
          </Section>

          <Section title="Owner">
            <ul className="surface divide-y divide-line px-4 text-sm">
              {o.owners.map((u) => (
                <li key={u.id} className="py-2">
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-slate">{[u.email, u.phone].filter(Boolean).join(', ')}</p>
                  <p className="mt-1 flex items-center justify-between gap-2 text-xs text-slate">
                    <span>{u.lastLoginAt ? `Last signed in ${fmtDate(localDateOf(u.lastLoginAt, 'Asia/Karachi'))}` : 'Has not signed in yet'}</span>
                    {!u.active && <Chip tone="idle">Disabled</Chip>}
                  </p>
                </li>
              ))}
            </ul>
            <Button small className="mt-3" onClick={() => reset.mutate()} disabled={reset.isPending}>
              Reset owner password
            </Button>
          </Section>

          {o.notes && (
            <Section title="Notes">
              <p className="rounded-lg border border-line bg-paper px-3 py-2 text-sm">{o.notes}</p>
            </Section>
          )}
        </aside>
      </div>

      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit details" wide>
        {modal === 'edit' && <EditForm org={o} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={modal === 'package'} onClose={() => setModal(null)} title="Change package">
        {modal === 'package' && <PackageForm org={o} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={modal === 'payment'} onClose={() => setModal(null)} title="Record a subscription payment">
        {modal === 'payment' && <PaymentForm org={o} onDone={() => setModal(null)} />}
      </Modal>
      <CredentialsModal info={creds} onClose={() => setCreds(null)} />
    </>
  );
}
