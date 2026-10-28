import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useAuth, useFeature, useLocation } from '../../auth';
import { can, FRONT_DESK_PRESET, PERMISSION_KEYS } from '../../lib/permissions';
import { CredentialsModal } from '../../components/Credentials';
import { useToast } from '../../components/toast';
import { Button, Chip, ErrorNote, Field, Input, Loading, Modal, PageHeader, Section, Select } from '../../components/ui';
import { fmtDay, todayIn } from '../../lib/time';
import { useHolidays, useRefresh } from '../../lib/queries';
import type { Location, PermissionDef, PermissionKey, StaffUser } from '../../types';

export function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.ok('Password changed');
      setCurrent('');
      setNext('');
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="max-w-sm space-y-3"
    >
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <Input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <Button type="submit" variant="primary" disabled={save.isPending}>
        Change password
      </Button>
    </form>
  );
}

/** Value used by the server (0 is Sunday) and its label, in the order a week is shown. */
const WEEKDAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']] as const;

function LocationForm({ initial, onDone }: { initial?: Location; onDone: () => void }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    address: initial?.address ?? '',
    timezone: initial?.timezone ?? 'Asia/Karachi',
    currency: initial?.currency ?? 'PKR',
    openTime: initial?.openTime ?? '08:00',
    closeTime: initial?.closeTime ?? '20:00',
    tax: initial?.taxRateBps ? String(initial.taxRateBps / 100) : '',
  });
  const [closed, setClosed] = useState<string[]>(initial?.closedWeekdays ? initial.closedWeekdays.split(',') : []);
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, taxRateBps: Math.round(Number(v.tax) * 100), closedWeekdays: [...closed].sort().join(',') };
      return initial ? api.patch(`/locations/${initial.id}`, body) : api.post('/locations', body);
    },
    onSuccess: async () => {
      toast.ok(initial ? 'Location updated' : 'Location added');
      await refresh();
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
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field label="Name">
          <Input required value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />
        </Field>
        <Field label="Code" hint="Prefix on invoice numbers.">
          <Input required value={v.code} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={6} pattern="[A-Za-z0-9]{2,6}" />
        </Field>
      </div>
      <Field label="Address">
        <Input value={v.address} onChange={(e) => set('address', e.target.value)} maxLength={300} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Time zone" hint="For example America/New_York or Europe/London.">
          <Input required value={v.timezone} onChange={(e) => set('timezone', e.target.value)} />
        </Field>
        <Field label="Currency" hint="3-letter code, like USD, GBP, EUR.">
          <Input required value={v.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={3} />
        </Field>
        <Field label="Opens">
          <Input type="time" required value={v.openTime} onChange={(e) => set('openTime', e.target.value)} />
        </Field>
        <Field label="Closes">
          <Input type="time" required value={v.closeTime} onChange={(e) => set('closeTime', e.target.value)} />
        </Field>
        <Field label="Sales tax on invoices (%)" hint="For example 13 or 16. Leave empty for no sales tax.">
          <Input type="number" step="0.01" min={0} max={100} placeholder="No tax" value={v.tax} onChange={(e) => set('tax', e.target.value)} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold">Closed on</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {WEEKDAYS.map(([n, label]) => (
            <label key={n} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={closed.includes(n)} onChange={() => setClosed((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : [...xs, n]))} className="size-4 accent-ink" />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate">Nothing can be booked on these days. Public holidays are added under Settings, Holidays.</p>
      </fieldset>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save location
        </Button>
      </div>
    </form>
  );
}

/** What can be granted, with plain-English names. Read from the server so the two never disagree. */
const usePermissionDefs = () => useQuery({ queryKey: ['staff', 'permissions'], queryFn: () => api.get<PermissionDef[]>('/staff/permissions'), staleTime: Infinity });

/** Tick what a team member may do. Shortcuts fill the list in one click; every box can still be changed after. */
function PermissionPicker({ value, onChange }: { value: PermissionKey[]; onChange: (v: PermissionKey[]) => void }) {
  const defs = usePermissionDefs();
  const groups = [...new Set((defs.data ?? []).map((d) => d.group))];
  const toggle = (k: PermissionKey) => onChange(value.includes(k) ? value.filter((x) => x !== k) : PERMISSION_KEYS.filter((x) => x === k || value.includes(x)));
  const same = (a: PermissionKey[]) => a.length === value.length && a.every((k) => value.includes(k));
  const presets: { label: string; keys: PermissionKey[] }[] = [
    { label: 'Full access', keys: PERMISSION_KEYS },
    { label: 'Front desk', keys: FRONT_DESK_PRESET },
    { label: 'View only', keys: [] },
  ];
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-semibold">What can they do?</legend>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button key={p.label} small variant={same(p.keys) ? 'primary' : 'secondary'} aria-pressed={same(p.keys)} onClick={() => onChange(p.keys)}>
            {p.label}
          </Button>
        ))}
        <span className="num ml-auto text-xs text-slate">
          {value.length} of {PERMISSION_KEYS.length} allowed
        </span>
      </div>
      {defs.isLoading ? (
        <Loading />
      ) : (
        <div className="max-h-[22rem] space-y-4 overflow-y-auto rounded-xl border border-line p-3">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-[11px] font-bold tracking-wide text-slate uppercase">{g}</p>
              <ul className="space-y-1">
                {defs.data!
                  .filter((d) => d.group === g)
                  .map((d) => (
                    <li key={d.key}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink/[0.04]">
                        <input type="checkbox" checked={value.includes(d.key)} onChange={() => toggle(d.key)} className="mt-0.5 size-4 shrink-0 accent-ink" />
                        <span>
                          <span className="block text-sm font-semibold">{d.label}</span>
                          <span className="block text-xs text-slate">{d.description}</span>
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-slate">Everyone on the team can always look at the Today page, the floor board, spaces and plans. These are the things they can change or see beyond that.</p>
    </fieldset>
  );
}

function StaffForm({ initial, onDone, onCreds }: { initial?: StaffUser; onDone: () => void; onCreds: (c: { name: string; email: string; password: string }) => void }) {
  const { locations } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const [v, setV] = useState({ name: initial?.name ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '', active: initial?.active ?? true });
  const [perms, setPerms] = useState<PermissionKey[]>(initial?.permissions ?? FRONT_DESK_PRESET);
  const [locs, setLocs] = useState<string[]>(initial?.locationIds ?? locations.slice(0, 1).map((l) => l.id));
  const save = useMutation({
    mutationFn: () =>
      initial
        ? api.patch<StaffUser>(`/staff/${initial.id}`, { name: v.name, phone: v.phone, permissions: perms, active: v.active, locationIds: locs })
        : api.post<StaffUser>('/staff', { name: v.name, email: v.email, phone: v.phone, permissions: perms, locationIds: locs }),
    onSuccess: (u) => {
      toast.ok(initial ? 'Team member updated' : 'Team member added');
      void refresh('staff');
      onDone();
      if (!initial && u.tempPassword) onCreds({ name: u.name, email: u.email, password: u.tempPassword });
    },
  });
  const toggle = (id: string) => setLocs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" required disabled={!!initial} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
      </div>
      <PermissionPicker value={perms} onChange={setPerms} />
      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold">Can work at</legend>
        <div className="space-y-1">
          {locations.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={locs.includes(l.id)} onChange={() => toggle(l.id)} className="size-4 accent-ink" />
              {l.name}
            </label>
          ))}
        </div>
      </fieldset>
      {initial && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="size-4 accent-ink" />
          Can sign in
        </label>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || locs.length === 0}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** Dates the current location is shut. Managers and owners add and remove them. */
function Holidays() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const from = todayIn(loc.timezone);
  const holidays = useHolidays(loc.id, from);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.post(`/locations/${loc.id}/holidays`, { date, name }),
    onSuccess: () => {
      toast.ok('Holiday added');
      setDate('');
      setName('');
      void refresh('holidays', 'schedule');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/locations/${loc.id}/holidays/${id}`),
    onSuccess: () => void refresh('holidays', 'schedule'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Section title="Holidays" aside={`${loc.name}: closed on these dates`}>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label="Date">
          <Input type="date" required min={from} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Name" className="min-w-48 flex-1">
          <Input value={name} maxLength={100} placeholder="Eid, Independence Day" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={!date || add.isPending}>
          Add holiday
        </Button>
      </form>
      {add.error && <ErrorNote error={new Error(errorMessage(add.error))} />}
      {holidays.isLoading ? (
        <Loading />
      ) : !holidays.data?.length ? (
        <p className="text-sm text-slate">No upcoming holidays.</p>
      ) : (
        <ul className="surface divide-y divide-line px-4">
          {holidays.data.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="num font-semibold">{fmtDay(h.date)}</span>
                {h.name && <span className="text-slate">, {h.name}</span>}
              </span>
              <Button small variant="ghost" onClick={() => remove.mutate(h.id)} disabled={remove.isPending} aria-label={`Remove ${h.name || h.date}`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Team() {
  const { locations } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffUser[]>('/staff') });
  const defs = usePermissionDefs();
  const labelOf = (k: PermissionKey) => defs.data?.find((d) => d.key === k)?.label ?? k;
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);
  const reset = useMutation({
    mutationFn: (u: StaffUser) => api.patch<StaffUser>(`/staff/${u.id}`, { resetPassword: true }),
    onSuccess: (u) => {
      void refresh('staff');
      if (u.tempPassword) setCreds({ name: u.name, email: u.email, password: u.tempPassword });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Section title="Team" aside={<Button small variant="primary" onClick={() => setEditing('new')}>Add team member</Button>}>
      {staff.isLoading ? (
        <Loading />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Access</th>
                <th>Locations</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.data?.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="font-semibold">{u.name}</span>
                    <span className="block text-xs text-slate">{u.email}</span>
                  </td>
                  <td>
                    {u.role === 'owner' ? (
                      <Chip tone="mine">Owner</Chip>
                    ) : u.permissions.length === PERMISSION_KEYS.length ? (
                      <Chip tone="ok">Full access</Chip>
                    ) : u.permissions.length === 0 ? (
                      <Chip tone="idle">View only</Chip>
                    ) : (
                      <span title={u.permissions.map(labelOf).join(', ')}>
                        <Chip tone="hold">
                          {u.permissions.length} of {PERMISSION_KEYS.length} permissions
                        </Chip>
                      </span>
                    )}
                    {u.role !== 'owner' && u.permissions.length > 0 && u.permissions.length < PERMISSION_KEYS.length && (
                      <span className="mt-1 block max-w-[16rem] truncate text-xs text-slate">{u.permissions.map(labelOf).join(', ')}</span>
                    )}
                  </td>
                  <td className="text-sm">{u.role === 'owner' ? 'All locations' : locations.filter((l) => u.locationIds.includes(l.id)).map((l) => l.name).join(', ') || '—'}</td>
                  <td>
                    <Chip tone={u.active ? 'ok' : 'idle'}>{u.active ? 'Active' : 'Disabled'}</Chip>
                  </td>
                  <td className="r whitespace-nowrap">
                    {u.role !== 'owner' && (
                      <>
                        <Button small variant="ghost" onClick={() => setEditing(u)}>
                          Edit
                        </Button>
                        <Button small variant="ghost" onClick={() => reset.mutate(u)}>
                          Reset password
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a team member' : 'Edit team member'} wide>
        {editing && <StaffForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} onCreds={setCreds} />}
      </Modal>
      <CredentialsModal info={creds} onClose={() => setCreds(null)} />
    </Section>
  );
}

export default function Settings() {
  const { user, locations, org } = useAuth();
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const owner = user?.role === 'owner';
  const team = useFeature('team');
  const atLimit = org?.maxLocations != null && locations.length >= org.maxLocations;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-10">
        <Section title="Your account">
          <p className="mb-4 text-sm">
            Signed in as <strong>{user?.name}</strong>, {user?.email}.
          </p>
          <PasswordForm />
        </Section>

        {can(user, 'holidays') && <Holidays />}

        {owner && (
          <>
            <Section
              title="Locations"
              aside={
                <span className="flex items-center gap-3">
                  {org?.maxLocations != null && (
                    <span className="text-xs">
                      {locations.length} of {org.maxLocations} on {org.packageName}
                    </span>
                  )}
                  <Button small variant="primary" disabled={atLimit} title={atLimit ? 'Your package is at its location limit' : undefined} onClick={() => setEditing('new')}>
                    Add location
                  </Button>
                </span>
              }
            >
              <div className="surface-table">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Hours</th>
                      <th>Time zone</th>
                      <th>Currency</th>
                      <th className="r">Tax</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <span className="font-semibold">{l.name}</span>
                          <span className="block text-xs text-slate">
                            {l.code}
                            {l.address ? `, ${l.address}` : ''}
                          </span>
                        </td>
                        <td className="num">
                          {l.openTime} to {l.closeTime}
                          {l.closedWeekdays && (
                            <span className="block text-xs font-normal text-slate">
                              Closed {l.closedWeekdays.split(',').map((n) => WEEKDAYS.find(([k]) => k === n)?.[1]).join(', ')}
                            </span>
                          )}
                        </td>
                        <td>{l.timezone}</td>
                        <td>{l.currency}</td>
                        <td className="r">{l.taxRateBps ? `${(l.taxRateBps / 100).toFixed(2)}%` : 'None'}</td>
                        <td className="r">
                          <Button small variant="ghost" onClick={() => setEditing(l)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            {team && <Team />}
          </>
        )}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a location' : 'Edit location'} wide>
        {editing && <LocationForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
