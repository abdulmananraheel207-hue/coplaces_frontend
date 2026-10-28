import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { CredentialsModal } from '../../components/Credentials';
import { Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Segmented, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';
import { money } from '../../lib/format';
import { useRefresh } from '../../lib/queries';
import { daysBetween, fmtDate, todayIn } from '../../lib/time';
import type { OrgSummary, PackageRow } from '../../types';
import { intervalLabel, StatusChip } from './common';

export const usePackages = () => useQuery({ queryKey: ['platform', 'packages'], queryFn: () => api.get<PackageRow[]>('/platform/packages') });

const suggestCode = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length >= 2 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 3)).replace(/[^a-z0-9]/gi, '');
  return letters.toUpperCase().slice(0, 6);
};

function RegisterForm({ onDone }: { onDone: (created: { id: string; ownerName: string; ownerEmail: string; password: string }) => void }) {
  const refresh = useRefresh();
  const packages = usePackages();
  const offered = packages.data?.filter((p) => p.active) ?? [];
  const [v, setV] = useState({
    name: '',
    city: '',
    contactEmail: '',
    phone: '',
    packageId: '',
    status: 'trial',
    notes: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    locName: '',
    locCode: '',
    locAddress: '',
    tax: '0',
  });
  const [codeTouched, setCodeTouched] = useState(false);
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const packageId = v.packageId || offered[0]?.id || '';

  const save = useMutation({
    mutationFn: () =>
      api.post<{ id: string; owner: { name: string; email: string; tempPassword: string } }>('/platform/organizations', {
        name: v.name,
        city: v.city,
        contactEmail: v.contactEmail,
        phone: v.phone,
        packageId,
        status: v.status,
        notes: v.notes,
        owner: { name: v.ownerName, email: v.ownerEmail, phone: v.ownerPhone },
        location: { name: v.locName || v.name, code: v.locCode || suggestCode(v.locName || v.name), address: v.locAddress, taxRateBps: Math.round(Number(v.tax) * 100) },
      }),
    onSuccess: (r) => {
      void refresh('platform');
      onDone({ id: r.id, ownerName: r.owner.name, ownerEmail: r.owner.email, password: r.owner.tempPassword });
    },
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-6"
    >
      <fieldset className="space-y-3">
        <legend className="display-sm mb-2 text-base">The business</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input required value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
          </Field>
          <Field label="City">
            <Input value={v.city} onChange={(e) => set('city', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Business email">
            <Input type="email" value={v.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={v.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="display-sm mb-2 text-base">Package</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Package">
            <Select value={packageId} onChange={(e) => set('packageId', e.target.value)} required>
              {offered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {money(p.priceCents, 'PKR')} / {intervalLabel(p.interval)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Starts as" hint={v.status === 'trial' ? 'A 14 day free trial.' : 'Active for one billing period. Record the payment on the next screen.'}>
            <Select value={v.status} onChange={(e) => set('status', e.target.value)}>
              <option value="trial">Free trial</option>
              <option value="active">Paid subscription</option>
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="display-sm mb-2 text-base">The owner who will sign in</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Owner name">
            <Input required value={v.ownerName} onChange={(e) => set('ownerName', e.target.value)} maxLength={100} />
          </Field>
          <Field label="Owner email" hint="This is their sign-in.">
            <Input type="email" required value={v.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
          </Field>
          <Field label="Owner phone">
            <Input value={v.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} maxLength={40} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="display-sm mb-2 text-base">First location</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Field label="Location name" hint="Defaults to the business name.">
            <Input
              value={v.locName}
              placeholder={v.name}
              onChange={(e) => {
                set('locName', e.target.value);
                if (!codeTouched) set('locCode', suggestCode(e.target.value));
              }}
              maxLength={100}
            />
          </Field>
          <Field label="Code" hint="Invoice prefix.">
            <Input
              value={v.locCode}
              placeholder={suggestCode(v.locName || v.name)}
              onChange={(e) => {
                setCodeTouched(true);
                set('locCode', e.target.value.toUpperCase());
              }}
              maxLength={6}
            />
          </Field>
        </div>
        <Field label="Address">
          <Input value={v.locAddress} onChange={(e) => set('locAddress', e.target.value)} maxLength={300} />
        </Field>
        <Field label="Sales tax on invoices (%)" hint="For example 13 in Sindh or 16 in Punjab and Islamabad. The owner can change it later.">
          <Input type="number" step="0.01" min={0} max={100} value={v.tax} onChange={(e) => set('tax', e.target.value)} className="max-w-32" />
        </Field>
        <p className="text-xs text-slate">Currency is PKR and the time zone is Pakistan time. The owner can change both in Settings.</p>
      </fieldset>

      <Field label="Internal notes">
        <Textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={2000} />
      </Field>

      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone({ id: '', ownerName: '', ownerEmail: '', password: '' })}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || !packageId}>
          {save.isPending ? 'Registering…' : 'Register coworking space'}
        </Button>
      </div>
    </form>
  );
}

export default function PlatformSpaces() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [registering, setRegistering] = useState(false);
  const [creds, setCreds] = useState<{ id: string; name: string; email: string; password: string } | null>(null);

  useEffect(() => {
    if (params.get('register')) {
      setRegistering(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const list = useQuery({ queryKey: ['platform', 'orgs'], queryFn: () => api.get<OrgSummary[]>('/platform/organizations') });
  const today = todayIn('Asia/Karachi');
  const term = q.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (o) => (!status || (status === 'expired' ? o.expired : o.status === status)) && (!term || [o.name, o.city, o.owner?.email ?? '', o.owner?.name ?? ''].some((x) => x.toLowerCase().includes(term))),
  );

  return (
    <>
      <PageHeader title="Coworking spaces" sub={list.data ? `${list.data.length} registered` : undefined}>
        <Button variant="primary" onClick={() => setRegistering(true)}>
          Register a coworking space
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'trial', label: 'Trial' },
            { value: 'expired', label: 'Ended' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
        <div className="min-w-48 flex-1">
          <Input type="search" aria-label="Search coworking spaces" placeholder="Search by name, city or owner" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : rows.length === 0 ? (
        <Empty
          title={list.data?.length ? 'No spaces match' : 'No coworking spaces yet'}
          hint={list.data?.length ? 'Try a different filter or search.' : 'Register the first one and give its owner their sign-in details.'}
          action={!list.data?.length && <Button variant="primary" onClick={() => setRegistering(true)}>Register a coworking space</Button>}
        />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Coworking space</th>
                <th>Package</th>
                <th>Status</th>
                <th className="r">Locations</th>
                <th className="r">Members</th>
                <th>Valid until</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const left = daysBetween(today, o.periodEnd);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/spaces/${o.id}`} className="font-semibold underline-offset-2 hover:underline">
                        {o.name}
                      </Link>
                      <span className="block text-xs text-slate">{[o.city, o.owner?.name].filter(Boolean).join(', ')}</span>
                    </td>
                    <td>
                      {o.package.name}
                      <span className="block text-xs text-slate">
                        {money(o.package.priceCents, 'PKR')} / {intervalLabel(o.package.interval)}
                      </span>
                    </td>
                    <td>
                      <StatusChip status={o.status} expired={o.expired} />
                    </td>
                    <td className="r">{o.usage.locations}</td>
                    <td className="r">{o.usage.members}</td>
                    <td className="num whitespace-nowrap">
                      {fmtDate(o.periodEnd)}
                      <span className={`block text-xs ${left < 0 ? 'text-busy' : 'text-slate'}`}>{left < 0 ? `${-left} days ago` : left === 0 ? 'today' : `in ${left} days`}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={registering} onClose={() => setRegistering(false)} title="Register a coworking space" wide>
        {registering && (
          <RegisterForm
            onDone={(c) => {
              setRegistering(false);
              if (!c.id) return;
              toast.ok('Coworking space registered');
              setCreds({ id: c.id, name: c.ownerName, email: c.ownerEmail, password: c.password });
            }}
          />
        )}
      </Modal>
      <CredentialsModal
        info={creds}
        onClose={() => {
          const id = creds?.id;
          setCreds(null);
          if (id) navigate(`/spaces/${id}`);
        }}
      />
    </>
  );
}
