import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Fingerprint, RefreshCw } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useAuth, useFeature, useLocation } from '../../auth';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Section, Segmented, Select } from '../../components/ui';
import { titleCase } from '../../lib/format';
import { useRefresh } from '../../lib/queries';
import { addDays, fmtDateTime, fmtDuration, fmtTime, localDateOf, todayIn } from '../../lib/time';
import type { AttendanceDevice, DeviceCommand, DevicePerson, DevicePunch, MemberRow, PunchResult, StaffAttendanceRow, StaffUser } from '../../types';

const RESULT: Record<PunchResult, { tone: 'ok' | 'busy' | 'hold' | 'mine' | 'idle'; label: string }> = {
  checked_in: { tone: 'ok', label: 'Checked in' },
  checked_out: { tone: 'mine', label: 'Checked out' },
  duplicate: { tone: 'idle', label: 'Repeat' },
  ignored: { tone: 'idle', label: 'Ignored' },
  rejected: { tone: 'busy', label: 'Rejected' },
  unknown_pin: { tone: 'hold', label: 'Unknown PIN' },
};

const COMMAND_STATUS: Record<DeviceCommand['status'], { tone: 'ok' | 'busy' | 'hold' | 'idle'; label: string }> = {
  pending: { tone: 'idle', label: 'Waiting' },
  sent: { tone: 'hold', label: 'Sent' },
  done: { tone: 'ok', label: 'Done' },
  failed: { tone: 'busy', label: 'Failed' },
};

/** Commands as the device sees them, in words. */
function describeCommand(cmd: string) {
  const field = (k: string) => new RegExp(`${k}=([^\\t]*)`).exec(cmd)?.[1] ?? '';
  if (cmd.startsWith('DATA UPDATE USERINFO')) return `Add or update ${field('Name') || 'person'} (PIN ${field('PIN')})`;
  if (cmd.startsWith('DATA DELETE USERINFO')) return `Remove PIN ${field('PIN')}`;
  if (cmd.startsWith('DATA QUERY ATTLOG')) return `Send punches from ${field('StartTime').slice(0, 10)} to ${field('EndTime').slice(0, 10)}`;
  if (cmd === 'REBOOT') return 'Restart';
  if (cmd === 'INFO') return 'Report device details';
  return cmd;
}

function DeviceStatus({ device }: { device: AttendanceDevice }) {
  if (!device.active) return <Chip tone="idle">Switched off</Chip>;
  if (device.online) return <Chip tone="ok">Online</Chip>;
  return device.lastSeenAt ? <Chip tone="busy">Offline</Chip> : <Chip tone="hold">Waiting for first connection</Chip>;
}

/** What to set on the machine itself. */
function SetupSteps() {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate">
      <li>
        On the device open <strong className="text-ink">Menu → COMM → Cloud Server Setting</strong>.
      </li>
      <li>
        Enter the server's address and port: the computer running the server on your network (for example <span className="font-mono text-ink">192.168.1.28</span>, port{' '}
        <span className="font-mono text-ink">4310</span>), or the relay's domain name once it is online. Turn <em>Enable Domain Name</em> on only for a name.
      </li>
      <li>
        Find the serial number under <strong className="text-ink">Menu → System Info → Device Info</strong> and register it here.
      </li>
      <li>Within a minute the device connects, and everyone at this location is sent to it with a PIN. Enrol each person's finger on the device under their PIN.</li>
    </ol>
  );
}

function DeviceForm({ initial, onDone }: { initial?: AttendanceDevice; onDone: (d?: AttendanceDevice) => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [name, setName] = useState(initial?.name ?? '');
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const save = useMutation({
    mutationFn: () =>
      initial
        ? api.patch<AttendanceDevice>(`/devices/${initial.id}`, { name, active })
        : api.post<AttendanceDevice & { sent: number }>('/devices', { locationId: loc.id, name, serialNumber: serialNumber.trim() }),
    onSuccess: (d) => {
      toast.ok(initial ? 'Device updated' : `Device registered. ${'sent' in d ? `${d.sent} people are waiting to be sent to it.` : ''}`);
      void refresh('devices');
      onDone(d);
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
      <Field label="Name" hint="Where it is, so you can tell devices apart.">
        <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Front door" />
      </Field>
      {initial ? (
        <>
          <p className="text-sm text-slate">
            Serial number <span className="font-mono text-ink">{initial.serialNumber}</span>
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-ink" />
            Accept punches from this device
          </label>
        </>
      ) : (
        <>
          <Field label="Serial number" hint="Exactly as the device shows it under System Info. The server log also prints it when an unregistered device connects.">
            <Input required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} maxLength={64} pattern="[A-Za-z0-9_\-]+" className="font-mono" autoComplete="off" />
          </Field>
          <div className="rounded-lg bg-plaster px-4 py-3">
            <p className="mb-2 text-[13px] font-semibold">Setting up the device</p>
            <SetupSteps />
          </div>
        </>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {initial ? 'Save' : 'Register device'}
        </Button>
      </div>
    </form>
  );
}

/** Gives a person a PIN: either one typed in, or a PIN the device sent that nobody has yet. */
function PinForm({ person, pin: knownPin, onDone }: { person?: DevicePerson; pin?: string; onDone: () => void }) {
  const loc = useLocation();
  const { user } = useAuth();
  const team = useFeature('team');
  const toast = useToast();
  const refresh = useRefresh();
  const [pin, setPin] = useState(knownPin ?? person?.pin ?? '');
  const [userId, setUserId] = useState(person?.userId ?? '');
  const members = useQuery({ queryKey: ['members', loc.id], queryFn: () => api.get<MemberRow[]>('/members', { locationId: loc.id }), enabled: !person });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffUser[]>('/staff'), enabled: !person && user?.role === 'owner' && team });
  const save = useMutation({
    mutationFn: (value: string | null) => api.put(`/devices/pins/${userId}`, { pin: value }),
    onSuccess: (_d, value) => {
      toast.ok(value ? `PIN ${value} saved. The devices update within a minute.` : 'Removed from the devices');
      void refresh('device-people', 'device-commands', 'devices', 'members');
      onDone();
    },
  });
  const team_ = (staff.data ?? []).filter((s) => s.active && (s.role === 'owner' || s.locationIds.includes(loc.id)));
  const people = (members.data ?? []).filter((m) => m.status !== 'cancelled');
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate(pin.trim());
      }}
      className="space-y-4"
    >
      {person ? (
        <p className="text-sm">
          <strong>{person.name}</strong> is on the devices under PIN <span className="num font-mono font-semibold">{person.pin}</span>.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate">
            Someone is enrolled on the device under PIN <span className="num font-mono font-semibold text-ink">{knownPin}</span>. Pick who it is, and their punches will count from now on.
          </p>
          <Field label="Person">
            <Select required value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choose…</option>
              {people.length > 0 && (
                <optgroup label="Members">
                  {people.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                      {m.devicePin ? ` (now PIN ${m.devicePin})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {team_.length > 0 && (
                <optgroup label="Team">
                  {team_.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.devicePin ? ` (now PIN ${s.devicePin})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>
        </>
      )}
      {person && (
        <Field label="New PIN" hint="1 to 9 digits. Use the number they are already enrolled under, so their fingerprint keeps working.">
          <Input required inputMode="numeric" pattern="[1-9][0-9]{0,8}" value={pin} onChange={(e) => setPin(e.target.value)} className="font-mono" />
        </Field>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex flex-wrap justify-between gap-2">
        {person ? (
          <Button variant="danger" disabled={save.isPending} onClick={() => window.confirm(`Take ${person.name} off every device? Their fingerprints are deleted from the devices too.`) && save.mutate(null)}>
            Remove from devices
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={save.isPending || !userId}>
            Save PIN
          </Button>
        </div>
      </div>
    </form>
  );
}

function FetchPunchesForm({ device, onDone }: { device: AttendanceDevice; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [from, setFrom] = useState(addDays(today, -1));
  const [to, setTo] = useState(today);
  const send = useMutation({
    mutationFn: () => api.post(`/devices/${device.id}/commands`, { kind: 'upload_punches', from, to }),
    onSuccess: () => {
      toast.ok('Asked the device to send those punches again');
      void refresh('device-commands', 'devices');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        send.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-sm text-slate">If the server was unreachable for a while, the device can send its punches again. Punches already received are not counted twice.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From">
          <Input type="date" required max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" required min={from} max={today} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {send.error && <ErrorNote error={new Error(errorMessage(send.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={send.isPending}>
          Ask for punches
        </Button>
      </div>
    </form>
  );
}

function Punches({ device }: { device: AttendanceDevice }) {
  const loc = useLocation();
  const today = todayIn(loc.timezone);
  const [date, setDate] = useState(today);
  const [result, setResult] = useState<PunchResult | ''>('');
  const [linking, setLinking] = useState<string | null>(null);
  const punches = useQuery({
    queryKey: ['device-punches', device.id, date, result],
    queryFn: () => api.get<DevicePunch[]>(`/devices/${device.id}/punches`, { date, result }),
    refetchInterval: date === today ? 15_000 : false,
  });
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="Day" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!w-auto" />
        <Select aria-label="Result" value={result} onChange={(e) => setResult(e.target.value as PunchResult | '')} className="!w-auto">
          <option value="">Every punch</option>
          {(Object.keys(RESULT) as PunchResult[]).map((r) => (
            <option key={r} value={r}>
              {RESULT[r].label}
            </option>
          ))}
        </Select>
      </div>
      {punches.isLoading ? (
        <Loading />
      ) : punches.error ? (
        <ErrorNote error={punches.error} />
      ) : !punches.data?.length ? (
        <Empty title="No punches" hint={date === today ? 'Punches show up here a few seconds after someone uses the device.' : 'Nothing was punched that day.'} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th className="r">PIN</th>
                <th>Person</th>
                <th>Result</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {punches.data.map((p) => (
                <tr key={p.id}>
                  <td className="num">{fmtTime(p.punchedAt, loc.timezone)}</td>
                  <td className="r num font-mono">{p.pin}</td>
                  <td>
                    {p.name ?? <span className="text-slate">Nobody</span>}
                    {p.role && <span className="block text-xs text-slate">{p.role === 'member' ? 'Member' : 'Team'}</span>}
                  </td>
                  <td>
                    <Chip tone={RESULT[p.result].tone}>{RESULT[p.result].label}</Chip>
                    {p.message && <span className="mt-0.5 block text-xs text-slate">{p.message}</span>}
                  </td>
                  <td className="r">
                    {p.result === 'unknown_pin' && (
                      <Button small variant="ghost" onClick={() => setLinking(p.pin)}>
                        Link to person
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={linking !== null} onClose={() => setLinking(null)} title={`Who is PIN ${linking ?? ''}?`}>
        {linking && <PinForm pin={linking} onDone={() => setLinking(null)} />}
      </Modal>
    </>
  );
}

function People({ device }: { device: AttendanceDevice }) {
  const [editing, setEditing] = useState<DevicePerson | null>(null);
  const people = useQuery({ queryKey: ['device-people', device.id], queryFn: () => api.get<DevicePerson[]>(`/devices/${device.id}/people`) });
  if (people.isLoading) return <Loading />;
  if (people.error) return <ErrorNote error={people.error} />;
  if (!people.data?.length) return <Empty title="Nobody on this device yet" hint="Everyone at this location is sent to it once it is registered and switched on." />;
  return (
    <>
      <p className="mb-3 text-sm text-slate">Enrol each person's finger on the device under the PIN shown here. Fingerprints are kept on the device and never sent to the server.</p>
      <div className="surface-table">
        <table className="tbl">
          <thead>
            <tr>
              <th className="r">PIN</th>
              <th>Name</th>
              <th>Who</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {people.data.map((p) => (
              <tr key={p.userId}>
                <td className="r num font-mono font-semibold">{p.pin}</td>
                <td className="font-semibold">{p.name}</td>
                <td className="text-sm text-slate">{p.role === 'member' ? 'Member' : titleCase(p.role)}</td>
                <td className="r">
                  <Button small variant="ghost" onClick={() => setEditing(p)}>
                    Change PIN
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Change PIN">
        {editing && <PinForm person={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function Commands({ device }: { device: AttendanceDevice }) {
  const loc = useLocation();
  const commands = useQuery({ queryKey: ['device-commands', device.id], queryFn: () => api.get<DeviceCommand[]>(`/devices/${device.id}/commands`), refetchInterval: 15_000 });
  if (commands.isLoading) return <Loading />;
  if (commands.error) return <ErrorNote error={commands.error} />;
  if (!commands.data?.length) return <Empty title="Nothing sent yet" />;
  return (
    <>
      <p className="mb-3 text-sm text-slate">The device collects these each time it checks in with the server, about every 30 seconds.</p>
      <div className="surface-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>Queued</th>
              <th>What</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {commands.data.map((c) => (
              <tr key={c.id}>
                <td className="num text-sm">{fmtDateTime(c.createdAt, loc.timezone)}</td>
                <td>{describeCommand(c.command)}</td>
                <td>
                  <Chip tone={COMMAND_STATUS[c.status].tone}>{COMMAND_STATUS[c.status].label}</Chip>
                  {c.status === 'failed' && c.returnCode !== null && <span className="mt-0.5 block text-xs text-slate">Device code {c.returnCode}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DeviceDetail({ device, onEdit }: { device: AttendanceDevice; onEdit: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [view, setView] = useState<'punches' | 'people' | 'commands'>('punches');
  const [fetching, setFetching] = useState(false);
  const sync = useMutation({
    mutationFn: () => api.post<{ sent: number; removed: number }>(`/devices/${device.id}/sync`),
    onSuccess: (r) => {
      toast.ok(`Sending ${r.sent} ${r.sent === 1 ? 'person' : 'people'} to the device${r.removed ? `, removing ${r.removed}` : ''}`);
      void refresh('device-commands', 'device-people', 'devices');
    },
  });
  const reboot = useMutation({
    mutationFn: () => api.post(`/devices/${device.id}/commands`, { kind: 'reboot' }),
    onSuccess: () => {
      toast.ok('The device restarts when it next checks in');
      void refresh('device-commands', 'devices');
    },
  });
  const [firmware, users, , , ip] = device.info.split(',');
  return (
    <Section
      title={device.name}
      aside={
        <span className="flex flex-wrap items-center gap-2">
          <DeviceStatus device={device} />
          <Button small variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        </span>
      }
    >
      <div className="surface mb-5 flex flex-wrap items-center justify-between gap-4 p-4">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate">Serial number</dt>
            <dd className="font-mono font-semibold">{device.serialNumber}</dd>
          </div>
          <div>
            <dt className="text-slate">Last seen</dt>
            <dd className="num font-semibold">{device.lastSeenAt ? fmtDateTime(device.lastSeenAt, loc.timezone) : 'Never'}</dd>
          </div>
          <div>
            <dt className="text-slate">Firmware</dt>
            <dd className="font-semibold">{firmware || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate">Device address</dt>
            <dd className="font-mono font-semibold">{ip || '—'}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button small disabled={!device.active || sync.isPending} onClick={() => sync.mutate()} title="Send everyone at this location to the device again">
            <RefreshCw size={14} aria-hidden /> Send everyone again
          </Button>
          <Button small disabled={!device.active} onClick={() => setFetching(true)}>
            Fetch missed punches
          </Button>
          <Button small variant="danger" disabled={!device.active || reboot.isPending} onClick={() => window.confirm(`Restart ${device.name}? Nobody can punch for about a minute.`) && reboot.mutate()}>
            Restart
          </Button>
        </div>
      </div>
      {(sync.error || reboot.error) && <ErrorNote error={new Error(errorMessage(sync.error ?? reboot.error))} />}
      {device.commandsWaiting > 0 && (
        <p className="mb-4 text-sm text-slate">
          {device.commandsWaiting} {device.commandsWaiting === 1 ? 'change is' : 'changes are'} waiting for the device{users ? `. It reports ${users} users.` : '.'}
        </p>
      )}
      <div className="mb-4">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'punches', label: 'Punches' },
            { value: 'people', label: 'People and PINs' },
            { value: 'commands', label: 'Sent to device' },
          ]}
        />
      </div>
      {view === 'punches' ? <Punches device={device} /> : view === 'people' ? <People device={device} /> : <Commands device={device} />}
      <Modal open={fetching} onClose={() => setFetching(false)} title="Fetch missed punches">
        {fetching && <FetchPunchesForm device={device} onDone={() => setFetching(false)} />}
      </Modal>
    </Section>
  );
}

function DeviceList() {
  const loc = useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<AttendanceDevice | 'new' | null>(null);
  const devices = useQuery({ queryKey: ['devices', loc.id], queryFn: () => api.get<AttendanceDevice[]>('/devices', { locationId: loc.id }), refetchInterval: 15_000 });
  const current = devices.data?.find((d) => d.id === selected) ?? devices.data?.[0];

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button variant="primary" onClick={() => setEditing('new')}>
          Register device
        </Button>
      </div>
      {devices.isLoading ? (
        <Loading />
      ) : devices.error ? (
        <ErrorNote error={devices.error} />
      ) : !devices.data?.length ? (
        <div className="space-y-5">
          <Empty
            title="No attendance devices yet"
            hint="Register a ZKTeco fingerprint machine by its serial number. Members are checked in and out, and the team clocked in and out, when they punch."
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                Register device
              </Button>
            }
          />
          <div className="surface p-5">
            <p className="mb-2 font-semibold">Setting up a device</p>
            <SetupSteps />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.data.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={current?.id === d.id}
                onClick={() => setSelected(d.id)}
                className={`surface flex items-start gap-3 p-4 text-left transition-shadow ${current?.id === d.id ? 'ring-2 ring-ink' : 'hover:ring-1 hover:ring-ink/30'}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-plaster text-ink" aria-hidden>
                  <Fingerprint size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.name}</span>
                  <span className="block truncate font-mono text-xs text-slate">{d.serialNumber}</span>
                  <span className="mt-2 block">
                    <DeviceStatus device={d} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          {current && <DeviceDetail key={current.id} device={current} onEdit={() => setEditing(current)} />}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Register an attendance device' : 'Edit device'} wide={editing === 'new'}>
        {editing && (
          <DeviceForm
            initial={editing === 'new' ? undefined : editing}
            onDone={(d) => {
              if (d && editing === 'new') setSelected(d.id);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

/** The team's clock-ins and clock-outs from the devices. */
function TeamAttendance() {
  const loc = useLocation();
  const today = todayIn(loc.timezone);
  const [date, setDate] = useState(today);
  const rows = useQuery({
    queryKey: ['staff-attendance', loc.id, date],
    queryFn: () => api.get<StaffAttendanceRow[]>('/attendance/staff', { locationId: loc.id, date }),
    refetchInterval: date === today ? 30_000 : false,
  });
  return (
    <>
      <div className="mb-3">
        <Input type="date" aria-label="Day" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!w-auto" />
      </div>
      {rows.isLoading ? (
        <Loading />
      ) : rows.error ? (
        <ErrorNote error={rows.error} />
      ) : !rows.data?.length ? (
        <Empty title="Nobody clocked in" hint="Team members clock in and out by punching an attendance device." />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>In</th>
                <th>Out</th>
                <th className="r">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.data.map((r) => {
                const stillIn = !r.checkOutAt && date === today;
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="font-semibold">{r.name}</span>
                      <span className="block text-xs text-slate">{titleCase(r.role)}</span>
                    </td>
                    <td className="num">{fmtTime(r.checkInAt, loc.timezone)}</td>
                    <td className="num">
                      {r.checkOutAt ? (
                        `${fmtTime(r.checkOutAt, loc.timezone)}${localDateOf(r.checkOutAt, loc.timezone) !== date ? ' (next day)' : ''}`
                      ) : stillIn ? (
                        <Chip tone="ok">In now</Chip>
                      ) : (
                        <Chip tone="busy">No clock-out</Chip>
                      )}
                    </td>
                    <td className="r num">{r.minutes !== null ? fmtDuration(r.minutes) : stillIn ? fmtDuration(Math.max(0, Math.round((Date.now() - Date.parse(r.checkInAt)) / 60_000))) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Devices() {
  const loc = useLocation();
  const [tab, setTab] = useState<'devices' | 'team'>('devices');
  return (
    <>
      <PageHeader title="Attendance devices" sub={`Fingerprint machines at ${loc.name}`} />
      <div className="mb-6">
        <Segmented
          label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'devices', label: 'Devices' },
            { value: 'team', label: 'Team attendance' },
          ]}
        />
      </div>
      {tab === 'devices' ? <DeviceList /> : <TeamAttendance />}
    </>
  );
}
