import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DoorOpen, LogIn, LogOut, X } from 'lucide-react';
import { Link } from 'react-router';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { ItemDetail } from '../../components/ItemDetail';
import { use3d } from '../../components/SpaceBoard';
import { LiveFloor, type Focus } from '../../components/space3d/LiveFloor';
import { initialsOf } from '../../components/space3d/Crowd';
import { floorLabel, layoutFloors, type FloorLayout } from '../../components/space3d/layout';
import { sampleBuilding } from '../../components/space3d/Showcase';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, PageHeader, Segmented } from '../../components/ui';
import { STRUCTURE_TYPES, isDeskKind, resourceLabel, tagOf } from '../../lib/catalogue';
import { money } from '../../lib/format';
import { fromAttendance, useDemoPresence, type Presence } from '../../lib/live';
import { useFloorObjects, usePresent, useRefresh, useResources, useSchedule } from '../../lib/queries';
import { buildSpaceItems, type SpaceItem } from '../../lib/spaceState';
import { fmtDuration, fmtTime, todayIn } from '../../lib/time';
import type { MemberDetail } from '../../types';

const ROOMY = ['room', 'corporate_room', 'office'];

/** Re-renders now and then so "here for 2h 10m" keeps counting. */
function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

interface Area {
  id: string;
  name: string;
  sub: string;
  floor: string;
  x: number;
  z: number;
  r: number;
  n: number;
  /** A room or desk that can be selected in the 3D view. */
  spaceId?: string;
}

/** Everything the owner drew that is worth flying to: rooms and offices, facilities, and each floor's desks together. */
function areasOf(floors: FloorLayout[], inside: Map<string, Presence[]>): Area[] {
  const out: Area[] = [];
  for (const f of floors) {
    const desks = f.placed.filter((p) => isDeskKind(p.item.kind));
    if (desks.length) {
      const x0 = Math.min(...desks.map((p) => p.x - p.w / 2));
      const x1 = Math.max(...desks.map((p) => p.x + p.w / 2));
      const z0 = Math.min(...desks.map((p) => p.z - p.d / 2));
      const z1 = Math.max(...desks.map((p) => p.z + p.d / 2));
      const used = desks.filter((p) => inside.has(p.item.id)).length;
      out.push({ id: `desks:${f.floor}`, name: floors.length > 1 ? `Desks · ${f.label}` : 'Desks', sub: `${used} of ${desks.length} in use`, floor: f.floor, x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.max(6, Math.hypot(x1 - x0, z1 - z0) / 2 + 1.5), n: used });
    }
    for (const p of f.placed) {
      if (!ROOMY.includes(p.item.kind)) continue;
      const n = inside.get(p.item.id)?.length ?? 0;
      out.push({ id: p.item.id, spaceId: p.item.id, name: p.item.name, sub: resourceLabel(p.item.kind, p.item.style) + (floors.length > 1 ? ` · ${f.label}` : ''), floor: f.floor, x: p.x, z: p.z, r: Math.max(5, Math.max(p.w, p.d) * 0.8), n });
    }
    for (const o of f.objects) {
      if (STRUCTURE_TYPES.includes(o.type)) continue;
      const name = tagOf(o.type, o.label);
      if (name) out.push({ id: o.id, name, sub: 'Facility' + (floors.length > 1 ? ` · ${f.label}` : ''), floor: f.floor, x: o.x, z: o.z, r: Math.max(4.5, Math.max(o.w, o.d) * 0.8), n: 0 });
    }
  }
  return out;
}

function Stat({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className="rounded-xl bg-ink/[0.04] p-3">
      <p className="text-[11px] font-semibold tracking-wide text-slate uppercase">{label}</p>
      <p className="display num mt-0.5 text-2xl">
        {value}
        {of !== undefined && <span className="text-base text-slate"> / {of}</span>}
      </p>
    </div>
  );
}

function PersonCard({ p, spaceName, floorName, demo, onClose }: { p: Presence; spaceName: string; floorName: string; demo: boolean; onClose: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const now = useNow();
  const member = useQuery({ queryKey: ['member', p.memberId], queryFn: () => api.get<MemberDetail>(`/members/${p.memberId}`), enabled: !demo });
  const schedule = useSchedule(loc.id, todayIn(loc.timezone));
  const todays = demo ? [] : (schedule.data?.bookings ?? []).filter((b) => b.memberId === p.memberId && b.status !== 'cancelled');
  const nameOf = (id: string) => schedule.data?.resources.find((r) => r.id === id)?.name ?? 'Space';
  const out = useMutation({
    mutationFn: () => api.post(`/attendance/${p.id}/check-out`),
    onSuccess: () => {
      toast.ok(`${p.name} checked out`);
      void refresh('attendance', 'schedule', 'members', 'dashboard');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const m = member.data;
  const email = demo ? p.demo?.email : m?.email;
  const phone = demo ? p.demo?.phone : m?.phone;
  const plan = demo ? p.demo?.plan : (m?.plan?.name ?? 'No plan');
  const owed = m?.balanceDueCents ?? 0;
  const mins = Math.max(0, Math.round((now - Date.parse(p.checkInAt)) / 60_000));

  return (
    <div className="surface p-4" role="region" aria-label={`${p.name} details`}>
      <div className="flex items-start gap-3">
        <span className="display grid size-11 shrink-0 place-items-center rounded-full bg-ink text-sm text-white">{initialsOf(p.name)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="display truncate text-lg">{p.name}</h3>
          <p className="truncate text-sm text-slate">{p.company || 'No company'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate hover:bg-ink/[0.06]">
          <X size={16} aria-hidden />
        </button>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Chip tone="mine">Here for {fmtDuration(mins)}</Chip>
        <span className="text-slate">in at {fmtTime(p.checkInAt, loc.timezone)}</span>
      </p>

      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-slate">Sitting at</dt>
        <dd className="font-semibold">{spaceName || 'At the door'}{floorName ? ` · ${floorName}` : ''}</dd>
        <dt className="text-slate">Plan</dt>
        <dd>{plan ?? '…'}</dd>
        {demo && p.demo ? (
          <>
            <dt className="text-slate">Booking</dt>
            <dd>{p.demo.booking}</dd>
          </>
        ) : (
          <>
            <dt className="text-slate">Today</dt>
            <dd>
              {todays.length ? (
                <ul className="space-y-0.5">
                  {todays.map((b) => (
                    <li key={b.id}>
                      {nameOf(b.resourceId)}, {fmtTime(b.startsAt, loc.timezone)} to {fmtTime(b.endsAt, loc.timezone)}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-slate">No bookings today</span>
              )}
            </dd>
          </>
        )}
        {email && (
          <>
            <dt className="text-slate">Email</dt>
            <dd className="truncate">{email}</dd>
          </>
        )}
        {phone && (
          <>
            <dt className="text-slate">Phone</dt>
            <dd>{phone}</dd>
          </>
        )}
        <dt className="text-slate">Payments</dt>
        <dd>{demo ? <Chip tone={p.demo?.paid ? 'ok' : 'busy'}>{p.demo?.paid ? 'Paid up' : 'Balance due'}</Chip> : m ? <Chip tone={owed > 0 ? 'busy' : 'ok'}>{owed > 0 ? `${money(owed, loc.currency)} due` : 'Paid up'}</Chip> : '…'}</dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {!demo && (
          <>
            <Link to={`/members/${p.memberId}`} className="inline-flex items-center rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white">
              Open profile
            </Link>
            <Button onClick={() => out.mutate()} disabled={out.isPending}>
              <LogOut size={15} aria-hidden /> Check out
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Live() {
  const loc = useLocation();
  const can3d = use3d();
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const demo = mode === 'demo';
  const resources = useResources(loc.id);
  const schedule = useSchedule(loc.id, todayIn(loc.timezone));
  const floorObjects = useFloorObjects(loc.id, can3d);
  // Real check-ins, asked for every few seconds so someone walking in at the front desk shows up on the floor almost at once.
  const present = usePresent(loc.id, 5000);

  const minute = Math.floor(Date.now() / 60_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const realItems = useMemo(() => buildSpaceItems(resources.data ?? [], schedule.data, new Date(), { currency: loc.currency }), [resources.data, schedule.data, minute, loc.currency]);
  const sample = useMemo(sampleBuilding, []);
  // A demo on a floor with no desks drawn yet uses a sample building, so there is always something to show.
  const sampleFloor = demo && !realItems.some((i) => isDeskKind(i.kind));
  const baseItems = sampleFloor ? sample : realItems;
  const objects = sampleFloor ? undefined : floorObjects.data;

  const demoPeople = useDemoPresence(baseItems, demo);
  const realPeople = useMemo(() => (present.data ?? []).map(fromAttendance), [present.data]);
  const people = demo ? demoPeople : realPeople;

  const inside = useMemo(() => {
    const m = new Map<string, Presence[]>();
    for (const p of people) if (p.resourceId) m.set(p.resourceId, [...(m.get(p.resourceId) ?? []), p]);
    return m;
  }, [people]);

  // The same items the Spaces tab shows, with the desks and rooms people are in marked as it happens.
  const items = useMemo(
    () =>
      baseItems.map((i): SpaceItem => {
        const here = inside.get(i.id);
        if (isDeskKind(i.kind)) {
          if (here) return { ...i, tone: 'mine', status: 'Checked in', detail: here[0]!.name, live: true };
          if (i.tone === 'busy' || i.tone === 'mine') return { ...i, tone: 'hold', status: 'Booked, not here yet' };
          return i;
        }
        return here ? { ...i, tone: 'busy', status: `${here.length} inside`, detail: here.map((h) => h.name).join(', ') } : i;
      }),
    [baseItems, inside],
  );
  const floors = useMemo(() => layoutFloors(items, objects), [items, objects]);
  const nameOf = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const floorOf = useMemo(() => new Map(floors.flatMap((f) => f.placed.map((p) => [p.item.id, f] as const))), [floors]);

  const [personId, setPersonId] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const person = people.find((p) => p.id === personId) ?? null;
  const space = items.find((i) => i.id === spaceId) ?? null;

  // Changing between live and demo is a different crowd.
  useEffect(() => {
    setPersonId(null);
    setSpaceId(null);
    setFocus(null);
  }, [mode]);

  const flyTo = (a: Pick<Area, 'floor' | 'x' | 'z' | 'r'>) => setFocus({ key: Date.now(), ...a });
  const pickPerson = (id: string | null) => {
    setPersonId(id);
    setSpaceId(null);
    const p = people.find((x) => x.id === id);
    const f = p?.resourceId ? floorOf.get(p.resourceId) : undefined;
    const placed = f?.placed.find((x) => x.item.id === p!.resourceId);
    if (f && placed) flyTo({ floor: f.floor, x: placed.x, z: placed.z, r: Math.max(5, Math.max(placed.w, placed.d) * 0.8) });
  };
  const pickArea = (a: Area) => {
    flyTo(a);
    setPersonId(null);
    setSpaceId(a.spaceId ?? null);
  };

  // What just happened: who came in and who left, as the list of people changes.
  const [feed, setFeed] = useState<{ key: number; kind: 'in' | 'out'; text: string; at: number }[]>([]);
  const before = useRef<{ mode: string; people: Map<string, Presence> } | null>(null);
  useEffect(() => {
    // Wait for the first real answer, so people already inside are not announced as arrivals.
    if (!demo && !present.isSuccess) return;
    const now = new Map(people.map((p) => [p.id, p]));
    const prev = before.current;
    before.current = { mode, people: now };
    if (!prev || prev.mode !== mode) return setFeed([]);
    const fresh: typeof feed = [];
    for (const p of people) if (!prev.people.has(p.id)) fresh.push({ key: Math.random(), kind: 'in', at: Date.now(), text: `${p.name} checked in${p.resourceId ? ` · ${nameOf.get(p.resourceId)?.name ?? ''}` : ''}` });
    for (const p of prev.people.values()) if (!now.has(p.id)) fresh.push({ key: Math.random(), kind: 'out', at: Date.now(), text: `${p.name} left` });
    if (fresh.length) setFeed((f) => [...fresh.reverse(), ...f].slice(0, 25));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, mode, present.isSuccess]);

  const desks = items.filter((i) => isDeskKind(i.kind));
  const rooms = items.filter((i) => ROOMY.includes(i.kind));
  const expected = demo
    ? 3
    : (schedule.data?.bookings ?? []).filter((b) => b.status === 'confirmed' && Date.parse(b.startsAt) > Date.now() && Date.parse(b.startsAt) < Date.now() + 3_600_000 && !people.some((p) => p.memberId === b.memberId)).length;
  const areas = useMemo(() => areasOf(floors, inside), [floors, inside]);

  if (!can3d) return <Empty title="The live floor needs the 3D view" hint="Your package or this browser does not include the 3D floor plan." />;

  const updated = present.dataUpdatedAt ? new Date(present.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <>
      <PageHeader title="Live" sub={`Who is in ${loc.name} right now`}>
        <Segmented
          label="Data"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'demo', label: 'Demo' },
          ]}
        />
      </PageHeader>

      <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {demo ? (
          <Chip tone="hold">Demo: made-up members on {sampleFloor ? 'a sample building' : 'your floor plan'}</Chip>
        ) : present.isError ? (
          <Chip tone="busy">Cannot reach the server, retrying</Chip>
        ) : (
          <Chip tone="ok">Live{updated ? `, updated ${updated}` : ''}</Chip>
        )}
        <span className="text-slate">{demo ? 'Nothing here is real. Members arrive, sit down and leave by themselves.' : 'Checks in at the front desk or by device appear within a few seconds.'}</span>
      </p>

      {!demo && resources.isSuccess && items.length === 0 ? (
        <Empty title="No spaces on the floor yet" hint="Draw your floor in the Spaces tab, then come back. Or switch to Demo to see how this works." action={<Button onClick={() => setMode('demo')}>Try the demo</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">
            <LiveFloor floors={floors} people={people} selectedPerson={personId} onPerson={pickPerson} selectedSpace={spaceId} onSpace={(id) => { setSpaceId(id); if (id) setPersonId(null); }} focus={focus} onClearFocus={() => setFocus(null)} />
            {space && (
              <div className="mt-3">
                <ItemDetail
                  item={space}
                  onClose={() => setSpaceId(null)}
                  extra={
                    inside.get(space.id)?.length ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {inside.get(space.id)!.map((p) => (
                          <li key={p.id}>
                            <button type="button" onClick={() => pickPerson(p.id)} className="rounded-full bg-ink/[0.06] px-3 py-1 text-sm font-semibold hover:bg-ink/[0.12]">
                              {p.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : undefined
                  }
                />
              </div>
            )}
          </div>

          <aside className="min-w-0 space-y-4">
            <div className="surface p-4">
              <h2 className="display-sm mb-3 text-[1.05rem]">Right now</h2>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="In the building" value={people.length} />
                <Stat label="Desks in use" value={desks.filter((d) => d.live).length} of={desks.length} />
                <Stat label="Rooms in use" value={rooms.filter((r) => inside.has(r.id)).length} of={rooms.length} />
                <Stat label="Due within the hour" value={expected} />
              </div>
            </div>

            {person && (
              <PersonCard
                key={person.id}
                p={person}
                spaceName={person.resourceId ? (nameOf.get(person.resourceId)?.name ?? '') : ''}
                floorName={person.resourceId && floors.length > 1 ? floorLabel(floorOf.get(person.resourceId)?.floor ?? '') : ''}
                demo={demo}
                onClose={() => setPersonId(null)}
              />
            )}

            <div className="surface p-4">
              <h2 className="display-sm mb-2 text-[1.05rem]">Look around</h2>
              <ul className="max-h-72 space-y-0.5 overflow-y-auto">
                {areas.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => pickArea(a)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-ink/[0.06] ${spaceId && spaceId === a.spaceId ? 'bg-ink/[0.08]' : ''}`}>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{a.name}</span>
                        <span className="block truncate text-xs text-slate">{a.sub}</span>
                      </span>
                      {a.n > 0 && <span className="num grid min-w-6 shrink-0 place-items-center rounded-full bg-busy px-1.5 text-[11px] font-bold text-white">{a.n}</span>}
                    </button>
                  </li>
                ))}
                {!areas.length && <li className="text-sm text-slate">Nothing drawn yet.</li>}
              </ul>
            </div>

            <div className="surface p-4">
              <h2 className="display-sm mb-2 text-[1.05rem]">What just happened</h2>
              {feed.length ? (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
                  {feed.map((e) => (
                    <li key={e.key} className="flex items-start gap-2">
                      {e.kind === 'in' ? <LogIn size={15} className="mt-0.5 shrink-0 text-ok" aria-hidden /> : <DoorOpen size={15} className="mt-0.5 shrink-0 text-slate" aria-hidden />}
                      <span className="min-w-0 flex-1">{e.text}</span>
                      <time className="num shrink-0 text-xs text-slate">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate">Waiting for the next check-in…</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
