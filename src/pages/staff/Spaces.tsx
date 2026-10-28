import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Flag, Flame, PencilRuler, QrCode } from 'lucide-react';
import { Link } from 'react-router';
import { api, errorMessage } from '../../api';
import { useAuth, useLocation } from '../../auth';
import { can } from '../../lib/permissions';
import { ItemDetail } from '../../components/ItemDetail';
import { QrSheet } from '../../components/QrSheet';
import { ReportProblem } from '../../components/ReportProblem';
import { FloorsForm } from '../../components/FloorsForm';
import { SpaceForm } from '../../components/SpaceForm';
import { MemberSelect } from '../../components/MemberSelect';
import { SpaceBoard, use3d } from '../../components/SpaceBoard';
import { SpaceList } from '../../components/SpaceList';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Segmented, buttonClass } from '../../components/ui';
import { fmtDate } from '../../lib/time';
import { useFloorObjects, useFloors, useOccupancy, useRefresh, useResources, useSchedule } from '../../lib/queries';
import { buildSpaceItems, type SpaceItem } from '../../lib/spaceState';
import { todayIn } from '../../lib/time';
import type { Issue, Occupancy, Resource, SpaceAsset, SpaceTask } from '../../types';

// The editor pulls in the whole 3D scene, so it is only fetched when someone opens it.
const FloorPlanEditor = lazy(() => import('../../components/space3d/FloorPlanEditor'));

/** What the team has on a space: open problems, cleaning due, equipment. Only for those who handle maintenance. */
function SpaceOps({ id }: { id: string }) {
  const loc = useLocation();
  const issues = useQuery({ queryKey: ['issues', loc.id, 'ops', id], queryFn: () => api.get<Issue[]>('/issues', { locationId: loc.id, resourceId: id }) });
  const tasks = useQuery({ queryKey: ['tasks', loc.id, 'ops', id], queryFn: () => api.get<SpaceTask[]>('/tasks', { locationId: loc.id, resourceId: id }) });
  const assets = useQuery({ queryKey: ['assets', loc.id, 'ops', id], queryFn: () => api.get<SpaceAsset[]>('/assets', { locationId: loc.id, resourceId: id }) });
  const open = (issues.data ?? []).filter((i) => i.status !== 'resolved').length;
  const overdue = (tasks.data ?? []).filter((t) => t.overdue).length;
  const next = (tasks.data ?? [])[0];
  const repair = (assets.data ?? []).filter((a) => a.status === 'needs_repair').length;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <Chip tone={open ? 'busy' : 'ok'}>{open ? `${open} open problem${open === 1 ? '' : 's'}` : 'No open problems'}</Chip>
      {next && <Chip tone={overdue ? 'busy' : 'idle'}>{overdue ? `${overdue} overdue` : `${next.title}, ${fmtDate(next.nextDue)}`}</Chip>}
      {!!assets.data?.length && <Chip tone={repair ? 'hold' : 'idle'}>{assets.data.length} item{assets.data.length === 1 ? '' : 's'} of equipment{repair ? `, ${repair} to repair` : ''}</Chip>}
      <Link to={`/maintenance?space=${id}`} className="font-semibold underline underline-offset-2">
        Maintenance
      </Link>
    </p>
  );
}

const DAYS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

/** The key to the colours on the 3D view, and who has been busiest and quietest. */
function HeatPanel({ data, days, onDays }: { data: Occupancy | undefined; days: number; onDays: (d: number) => void }) {
  const ranked = [...(data?.items ?? [])].filter((i) => i.kind !== 'storage').sort((a, b) => b.utilization - a.utilization);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const row = (i: Occupancy['items'][number]) => (
    <li key={i.resourceId} className="flex items-baseline justify-between gap-3 text-sm">
      <span className="truncate">{i.name}</span>
      <span className="num shrink-0 font-semibold">{pct(i.utilization)}</span>
    </li>
  );
  return (
    <div className="surface mb-3 flex flex-wrap items-start gap-x-8 gap-y-3 p-4" role="region" aria-label="How busy each space has been">
      <div className="min-w-48">
        <Segmented label="Period" value={String(days)} onChange={(v) => onDays(Number(v))} options={DAYS} />
        <div className="mt-3 h-2.5 w-56 rounded-full" style={{ background: 'linear-gradient(90deg,#dce7f2,#f3e6a6,#f6c324,#e0802a,#b8381a)' }} aria-hidden />
        <p className="mt-1 flex w-56 justify-between text-xs text-slate">
          <span>Quiet</span>
          <span>Busy</span>
        </p>
        <p className="mt-2 text-sm text-slate">
          Rooms are measured in booked hours, desks in booked days, and anything assigned in days held. Closed days are left out.
        </p>
      </div>
      {data && (
        <>
          <div className="min-w-44">
            <p className="text-xs font-semibold tracking-wide text-slate uppercase">Average</p>
            <p className="display num text-[1.8rem] leading-tight">{pct(data.average)}</p>
            <p className="text-xs text-slate">of {data.openDays} open days</p>
          </div>
          <div className="min-w-48 flex-1">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate uppercase">Busiest</p>
            <ul className="space-y-0.5">{ranked.slice(0, 4).map(row)}</ul>
          </div>
          <div className="min-w-48 flex-1">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate uppercase">Quietest</p>
            <ul className="space-y-0.5">{[...ranked].reverse().slice(0, 4).map(row)}</ul>
          </div>
        </>
      )}
    </div>
  );
}

function AssignForm({ resource, onDone }: { resource: Resource; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(todayIn(loc.timezone));
  const [endDate, setEndDate] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/assignments', { resourceId: resource.id, memberId, startDate, endDate: endDate || null }),
    onSuccess: () => {
      toast.ok(`${resource.name} assigned`);
      void refresh('resources', 'dashboard', 'members');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <Field label="Member">
        <MemberSelect locationId={loc.id} value={memberId} onChange={setMemberId} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Until (optional)" hint="Leave empty for an open-ended assignment.">
          <Input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!memberId || save.isPending}>
          Assign {resource.name}
        </Button>
      </div>
    </form>
  );
}

export default function Spaces() {
  const { user } = useAuth();
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const manager = can(user, 'spaces');
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);
  const [addingFloors, setAddingFloors] = useState(false);
  const [assigning, setAssigning] = useState<Resource | null>(null);
  const resources = useResources(loc.id);
  const schedule = useSchedule(loc.id, todayIn(loc.timezone));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [qr, setQr] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [heatOn, setHeatOn] = useState(false);
  const [days, setDays] = useState(30);
  const maintenance = can(user, 'maintenance');
  const can3d = use3d();
  const floorObjects = useFloorObjects(loc.id, can3d);
  const floors = useFloors(loc.id);
  // With the 3D editor, spaces are drawn on floors; Add space only names the floors. Without it, spaces are added one by one.
  const floorsFirst = can3d;
  const addSpace = () => (floorsFirst ? setAddingFloors(true) : setEditing('new'));
  const assignments = useQuery({
    queryKey: ['assignments', loc.id],
    queryFn: () => api.get<{ id: string; resourceId: string; startDate: string; endDate: string | null }[]>('/assignments', { locationId: loc.id }),
  });

  const endAssignment = useMutation({
    mutationFn: (id: string) => api.patch(`/assignments/${id}`, { endDate: todayIn(loc.timezone) }),
    onSuccess: () => {
      toast.ok('Assignment ended today');
      void refresh('resources', 'assignments', 'dashboard', 'members');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const all = resources.data ?? [];
  const minute = Math.floor(Date.now() / 60_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => buildSpaceItems(all, schedule.data, new Date(), { currency: loc.currency }), [resources.data, schedule.data, minute, loc.currency]);
  // The list is also where retired spaces are managed, so it keeps them and says when an assignment ends.
  const listItems = useMemo(
    () =>
      buildSpaceItems(all, schedule.data, new Date(), { currency: loc.currency, includeRetired: true }).map((i) => {
        const r = all.find((x) => x.id === i.id);
        const end = r?.occupant && assignments.data?.find((x) => x.id === r.occupant!.assignmentId)?.endDate;
        return end ? { ...i, detail: [i.detail, `until ${fmtDate(end)}`].filter(Boolean).join(', ') } : i;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resources.data, schedule.data, assignments.data, minute, loc.currency],
  );

  const occupancy = useOccupancy(loc.id, days, heatOn);
  const heat = useMemo(() => (heatOn && occupancy.data ? Object.fromEntries(occupancy.data.items.map((i) => [i.resourceId, i.utilization])) : undefined), [heatOn, occupancy.data]);

  const detail = (item: SpaceItem) => {
    const r = all.find((x) => x.id === item.id);
    const canAssign = r && (r.kind === 'dedicated_desk' || r.kind === 'office' || r.kind === 'storage') && r.status === 'available';
    return (
      <ItemDetail item={item} onClose={() => setSelectedId(null)} extra={maintenance ? <SpaceOps id={item.id} /> : undefined}>
        <Button onClick={() => setReporting(item.id)}>
          <Flag size={15} aria-hidden /> Report a problem
        </Button>
        {r && canAssign &&
          (r.occupied && r.occupant ? (
            <Button onClick={() => endAssignment.mutate(r.occupant!.assignmentId)}>End assignment</Button>
          ) : (
            <Button variant="primary" onClick={() => setAssigning(r)}>
              Assign
            </Button>
          ))}
        {r && manager && <Button onClick={() => setEditing(r)}>Edit</Button>}
      </ItemDetail>
    );
  };

  return (
    <>
      <PageHeader title="Spaces" sub={`Rooms, desks and offices at ${loc.name}`}>
        {all.length > 0 && !drawing && (
          <Button onClick={() => setQr(true)}>
            <QrCode size={16} aria-hidden /> QR codes
          </Button>
        )}
        {manager && can3d && !drawing && (
          <Button onClick={() => setDrawing(true)} disabled={resources.isLoading || floorObjects.isLoading || floors.isLoading}>
            <PencilRuler size={16} aria-hidden /> Edit floor plan
          </Button>
        )}
        {manager && !drawing && (
          <Button variant="primary" onClick={addSpace}>
            {floorsFirst ? 'Add floors' : 'Add space'}
          </Button>
        )}
      </PageHeader>

      {drawing && resources.data && floorObjects.data && !floors.isLoading ? (
        <Suspense fallback={<Loading label="Loading the floor plan editor" />}>
          <FloorPlanEditor locationId={loc.id} locationName={loc.name} currency={loc.currency} resources={resources.data} objects={floorObjects.data} floors={floors.data?.floors} floorLimit={floors.data?.limit ?? null} onClose={() => setDrawing(false)} />
        </Suspense>
      ) : resources.isLoading ? (
        <Loading />
      ) : all.length === 0 ? (
        <Empty
          title="No spaces yet"
          hint={
            !manager
              ? 'Someone with the spaces permission can add them.'
              : floorsFirst
                ? floors.data?.floors.length
                  ? 'Your floors are ready. Open Edit floor plan to add meeting rooms, desks and more to them.'
                  : 'Start by adding your floors. Then add rooms, desks and offices to them in Edit floor plan.'
                : 'Add your rooms, desks and offices and they will appear on the live board.'
          }
          action={manager && <Button variant="primary" onClick={addSpace}>{floorsFirst ? 'Add floors' : 'Add space'}</Button>}
        />
      ) : (
        <>
        {can3d && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Button aria-pressed={heatOn} variant={heatOn ? 'primary' : 'secondary'} onClick={() => setHeatOn((on) => !on)}>
              <Flame size={15} aria-hidden /> {heatOn ? 'Hide how busy' : 'Show how busy'}
            </Button>
            {!heatOn && <span className="text-sm text-slate">Colour every space by how much it has been used.</span>}
          </div>
        )}
        {heatOn && <HeatPanel data={occupancy.data} days={days} onDays={setDays} />}
        <SpaceBoard
          items={items}
          heat={heat}
          selectedId={selectedId}
          onSelect={setSelectedId}
          renderDetail={detail}
          list={<SpaceList items={listItems} selectedId={selectedId} onSelect={setSelectedId} renderDetail={detail} />}
        />
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a space' : 'Edit space'} wide>
        {editing && <SpaceForm initial={editing === 'new' ? undefined : editing} kind="room" onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={addingFloors} onClose={() => setAddingFloors(false)} title="Floors">
        {addingFloors && <FloorsForm onDone={() => setAddingFloors(false)} />}
      </Modal>
      <QrSheet open={qr} onClose={() => setQr(false)} spaces={all} place={loc.name} />
      <ReportProblem open={reporting !== null} onClose={() => setReporting(null)} resourceId={reporting ?? undefined} />
      <Modal open={assigning !== null} onClose={() => setAssigning(null)} title={assigning ? `Assign ${assigning.name}` : ''}>
        {assigning && <AssignForm resource={assigning} onDone={() => setAssigning(null)} />}
      </Modal>
    </>
  );
}
