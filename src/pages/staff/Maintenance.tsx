import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCheck, Download, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { ReportProblem } from '../../components/ReportProblem';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Segmented, Select, Textarea } from '../../components/ui';
import { downloadCsv, titleCase } from '../../lib/format';
import { useRefresh, useResources } from '../../lib/queries';
import { addDays, daysBetween, fmtDate, fmtDateTime, todayIn } from '../../lib/time';
import type { AssetStatus, Issue, IssuePriority, SpaceAsset, SpaceTask, TaskKind } from '../../types';

type Tab = 'problems' | 'schedule' | 'equipment';

/** The spaces to choose from, and the ones a list can be narrowed to. */
function useSpaces() {
  const loc = useLocation();
  const resources = useResources(loc.id);
  return (resources.data ?? []).filter((r) => r.status !== 'retired');
}

const priorityTone = { low: 'idle', normal: 'hold', urgent: 'busy' } as const;
const issueTone = { open: 'hold', in_progress: 'mine', resolved: 'ok' } as const;
const ISSUE_WORD = { open: 'Reported', in_progress: 'Being fixed', resolved: 'Fixed' } as const;

// ---------------------------------------------------------------------------------------------
// Problems

function Problems({ space }: { space: string }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [show, setShow] = useState<'active' | 'resolved' | 'all'>('active');
  const [reporting, setReporting] = useState(false);
  const [resolving, setResolving] = useState<Issue | null>(null);
  const q = useQuery({ queryKey: ['issues', loc.id, space], queryFn: () => api.get<Issue[]>('/issues', { locationId: loc.id, resourceId: space }) });
  const rows = (q.data ?? []).filter((i) => (show === 'all' ? true : show === 'resolved' ? i.status === 'resolved' : i.status !== 'resolved'));
  const patch = useMutation({
    mutationFn: (v: { id: string; body: object }) => api.patch(`/issues/${v.id}`, v.body),
    onSuccess: () => void refresh('issues', 'tasks'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toTask = useMutation({
    mutationFn: (id: string) => api.post(`/issues/${id}/task`),
    onSuccess: () => {
      toast.ok('Added to the schedule, due today');
      void refresh('issues', 'tasks');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Which problems"
          value={show}
          onChange={setShow}
          options={[
            { value: 'active', label: 'Open' },
            { value: 'resolved', label: 'Fixed' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Button onClick={() => setReporting(true)}>
          <Plus size={15} aria-hidden /> Report a problem
        </Button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : rows.length === 0 ? (
        <Empty title={show === 'resolved' ? 'Nothing fixed yet' : 'No open problems'} hint="Members report problems by scanning a space's QR code or from their home page. They show up here." />
      ) : (
        <ul className="surface divide-y divide-line px-4">
          {rows.map((i) => (
            <li key={i.id} className="py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{i.title}</span>
                    <Chip tone={issueTone[i.status]}>{ISSUE_WORD[i.status]}</Chip>
                    {i.priority !== 'normal' && <Chip tone={priorityTone[i.priority]}>{i.priority === 'urgent' ? 'Urgent' : 'Not urgent'}</Chip>}
                  </p>
                  <p className="text-sm text-slate">
                    {i.resourceName}, reported by {i.reporter}, {fmtDateTime(i.createdAt, loc.timezone)}
                  </p>
                  {i.description && <p className="mt-1 max-w-prose text-sm whitespace-pre-line">{i.description}</p>}
                  {i.resolution && <p className="mt-1 text-sm text-ok">Fixed: {i.resolution}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {i.status !== 'resolved' && !i.taskId && (
                    <Button small disabled={toTask.isPending} onClick={() => toTask.mutate(i.id)}>
                      Add to schedule
                    </Button>
                  )}
                  {i.status === 'open' && (
                    <Button small onClick={() => patch.mutate({ id: i.id, body: { status: 'in_progress' } })}>
                      Start
                    </Button>
                  )}
                  {i.status !== 'resolved' ? (
                    <Button small variant="primary" onClick={() => setResolving(i)}>
                      <CheckCheck size={14} aria-hidden /> Fixed
                    </Button>
                  ) : (
                    <Button small variant="ghost" onClick={() => patch.mutate({ id: i.id, body: { status: 'open' } })}>
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReportProblem open={reporting} onClose={() => setReporting(false)} resourceId={space || undefined} />
      <Modal open={resolving !== null} onClose={() => setResolving(null)} title="Mark as fixed">
        {resolving && (
          <ResolveForm
            issue={resolving}
            onDone={() => setResolving(null)}
            onSave={(resolution) =>
              patch.mutateAsync({ id: resolving.id, body: { status: 'resolved', resolution } }).then(() => {
                toast.ok('Marked as fixed');
              })
            }
          />
        )}
      </Modal>
    </>
  );
}

function ResolveForm({ issue, onSave, onDone }: { issue: Issue; onSave: (note: string) => Promise<void>; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(note);
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm">
        <strong>{issue.title}</strong> at {issue.resourceName}.
      </p>
      <Field label="What was done (optional)" hint="The person who reported it can see this.">
        <Textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          Mark as fixed
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Cleaning and upkeep

const KIND_WORD: Record<TaskKind, string> = { cleaning: 'Cleaning', maintenance: 'Maintenance', inspection: 'Inspection' };
const everyWord = (n: number | null) => (n === null ? 'Once' : n === 1 ? 'Every day' : n === 7 ? 'Every week' : n === 14 ? 'Every two weeks' : n === 30 ? 'Every month' : `Every ${n} days`);

function TaskForm({ initial, space, onDone }: { initial?: SpaceTask; space: string; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const spaces = useSpaces();
  const [v, setV] = useState({
    title: initial?.title ?? '',
    kind: (initial?.kind ?? 'cleaning') as TaskKind,
    resourceId: initial?.resourceId ?? space,
    repeat: initial ? (initial.everyDays === null ? 'once' : [1, 7, 14, 30].includes(initial.everyDays) ? String(initial.everyDays) : 'custom') : '7',
    custom: String(initial?.everyDays ?? 7),
    nextDue: initial?.nextDue ?? todayIn(loc.timezone),
    notes: initial?.notes ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => {
      const everyDays = v.repeat === 'once' ? null : v.repeat === 'custom' ? Math.max(1, Math.round(Number(v.custom) || 1)) : Number(v.repeat);
      const body = { title: v.title, kind: v.kind, resourceId: v.resourceId || null, everyDays, nextDue: v.nextDue, notes: v.notes };
      return initial ? api.patch(`/tasks/${initial.id}`, body) : api.post('/tasks', { ...body, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Task updated' : 'Task added to the schedule');
      void refresh('tasks');
      onDone();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="What needs doing">
        <Input required maxLength={150} value={v.title} placeholder="Deep clean, service the AC, check extinguishers" onChange={(e) => set('title', e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={v.kind} onChange={(e) => set('kind', e.target.value as TaskKind)}>
            {(Object.keys(KIND_WORD) as TaskKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_WORD[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Where">
          <Select value={v.resourceId} onChange={(e) => set('resourceId', e.target.value)}>
            <option value="">The whole location</option>
            {spaces.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How often">
          <Select value={v.repeat} onChange={(e) => set('repeat', e.target.value)}>
            <option value="once">Once</option>
            <option value="1">Every day</option>
            <option value="7">Every week</option>
            <option value="14">Every two weeks</option>
            <option value="30">Every month</option>
            <option value="custom">Every so many days</option>
          </Select>
        </Field>
        <Field label={v.repeat === 'once' ? 'Due on' : 'Next due'}>
          <Input type="date" required value={v.nextDue} onChange={(e) => set('nextDue', e.target.value)} />
        </Field>
      </div>
      {v.repeat === 'custom' && (
        <Field label="Repeat every (days)">
          <Input type="number" min={1} max={730} value={v.custom} onChange={(e) => set('custom', e.target.value)} />
        </Field>
      )}
      <Field label="Notes">
        <Textarea rows={2} maxLength={1000} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || !v.title.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Logs({ task }: { task: SpaceTask }) {
  const loc = useLocation();
  const q = useQuery({ queryKey: ['tasks', 'logs', task.id], queryFn: () => api.get<{ id: string; doneAt: string; note: string; doneBy: string }[]>(`/tasks/${task.id}/logs`) });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <p className="text-sm text-slate">Not done yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {q.data.map((l) => (
        <li key={l.id} className="py-2 text-sm">
          <span className="font-semibold">{fmtDateTime(l.doneAt, loc.timezone)}</span>, {l.doneBy}
          {l.note && <span className="block text-slate">{l.note}</span>}
        </li>
      ))}
    </ul>
  );
}

function Schedule({ space }: { space: string }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [editing, setEditing] = useState<SpaceTask | 'new' | null>(null);
  const [history, setHistory] = useState<SpaceTask | null>(null);
  const q = useQuery({ queryKey: ['tasks', loc.id, space], queryFn: () => api.get<SpaceTask[]>('/tasks', { locationId: loc.id, resourceId: space }) });
  const done = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/done`, {}),
    onSuccess: () => {
      toast.ok('Marked as done');
      void refresh('tasks', 'issues');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/tasks/${id}`),
    onSuccess: () => void refresh('tasks'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const groups = useMemo(() => {
    const list = q.data ?? [];
    const week = addDays(today, 7);
    return [
      { title: 'Overdue', tone: 'busy' as const, rows: list.filter((t) => t.nextDue < today) },
      { title: 'Due today and this week', tone: 'hold' as const, rows: list.filter((t) => t.nextDue >= today && t.nextDue <= week) },
      { title: 'Later', tone: 'idle' as const, rows: list.filter((t) => t.nextDue > week) },
    ].filter((g) => g.rows.length);
  }, [q.data, today]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-slate">Cleaning, upkeep and inspections. A repeating job comes round again that many days after you mark it done.</p>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={15} aria-hidden /> New task
        </Button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : groups.length === 0 ? (
        <Empty title="Nothing scheduled" hint="Add the cleaning and upkeep you do, such as a weekly deep clean or a yearly fire check." action={<Button variant="primary" onClick={() => setEditing('new')}>New task</Button>} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3 className="display-sm mb-2 text-[0.95rem]">
                {g.title} <span className="num font-normal text-slate">({g.rows.length})</span>
              </h3>
              <ul className="surface divide-y divide-line px-4">
                {g.rows.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{t.title}</span>
                        <Chip tone={t.kind === 'cleaning' ? 'ok' : t.kind === 'inspection' ? 'mine' : 'hold'}>{KIND_WORD[t.kind]}</Chip>
                      </p>
                      <p className="text-sm text-slate">
                        {t.resourceName ?? 'Whole location'}, {everyWord(t.everyDays).toLowerCase()}, <span className={t.overdue ? 'font-semibold text-busy' : ''}>{t.overdue ? `was due ${fmtDate(t.nextDue)} (${daysBetween(t.nextDue, today)}d ago)` : `due ${fmtDate(t.nextDue)}`}</span>
                      </p>
                      {t.notes && <p className="text-sm text-slate">{t.notes}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button small variant="primary" disabled={done.isPending} onClick={() => done.mutate(t.id)}>
                        <CheckCheck size={14} aria-hidden /> Done
                      </Button>
                      <Button small variant="ghost" aria-label={`History of ${t.title}`} onClick={() => setHistory(t)}>
                        <History size={14} aria-hidden />
                      </Button>
                      <Button small variant="ghost" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>
                        <Pencil size={14} aria-hidden />
                      </Button>
                      <Button small variant="ghost" aria-label={`Delete ${t.title}`} onClick={() => window.confirm(`Delete "${t.title}" and its history?`) && remove.mutate(t.id)}>
                        <Trash2 size={14} aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New task' : 'Edit task'}>
        {editing && <TaskForm initial={editing === 'new' ? undefined : editing} space={space} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={history !== null} onClose={() => setHistory(null)} title={history ? `History: ${history.title}` : ''}>
        {history && <Logs task={history} />}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Equipment

const ASSET_WORD: Record<AssetStatus, string> = { working: 'Working', needs_repair: 'Needs repair', retired: 'Retired' };
const assetTone = { working: 'ok', needs_repair: 'busy', retired: 'idle' } as const;

function AssetForm({ initial, space, onDone }: { initial?: SpaceAsset; space: string; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const spaces = useSpaces();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    resourceId: initial?.resourceId ?? space,
    serialNumber: initial?.serialNumber ?? '',
    purchasedOn: initial?.purchasedOn ?? '',
    warrantyUntil: initial?.warrantyUntil ?? '',
    status: (initial?.status ?? 'working') as AssetStatus,
    notes: initial?.notes ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, resourceId: v.resourceId || null, purchasedOn: v.purchasedOn || null, warrantyUntil: v.warrantyUntil || null };
      return initial ? api.patch(`/assets/${initial.id}`, body) : api.post('/assets', { ...body, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Equipment updated' : 'Equipment added');
      void refresh('assets');
      onDone();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input required maxLength={120} value={v.name} placeholder="Projector, 27-inch monitor" onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Category">
          <Input maxLength={60} value={v.category} placeholder="AV, Furniture, IT" onChange={(e) => set('category', e.target.value)} />
        </Field>
        <Field label="Where it is">
          <Select value={v.resourceId} onChange={(e) => set('resourceId', e.target.value)}>
            <option value="">Not in a particular space</option>
            {spaces.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Serial number">
          <Input maxLength={80} value={v.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
        </Field>
        <Field label="Bought on">
          <Input type="date" value={v.purchasedOn} onChange={(e) => set('purchasedOn', e.target.value)} />
        </Field>
        <Field label="Warranty until">
          <Input type="date" value={v.warrantyUntil} onChange={(e) => set('warrantyUntil', e.target.value)} />
        </Field>
        <Field label="Condition">
          <Select value={v.status} onChange={(e) => set('status', e.target.value as AssetStatus)}>
            {(Object.keys(ASSET_WORD) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>
                {ASSET_WORD[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea rows={2} maxLength={1000} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || !v.name.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Equipment({ space }: { space: string }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [status, setStatus] = useState<'' | AssetStatus>('');
  const [editing, setEditing] = useState<SpaceAsset | 'new' | null>(null);
  const q = useQuery({ queryKey: ['assets', loc.id, space, status], queryFn: () => api.get<SpaceAsset[]>('/assets', { locationId: loc.id, resourceId: space, status }) });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/assets/${id}`),
    onSuccess: () => {
      toast.ok('Removed');
      void refresh('assets');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const soon = addDays(today, 60);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select aria-label="Condition" value={status} onChange={(e) => setStatus(e.target.value as '' | AssetStatus)} className="!w-auto">
          <option value="">All equipment</option>
          {(Object.keys(ASSET_WORD) as AssetStatus[]).map((s) => (
            <option key={s} value={s}>
              {ASSET_WORD[s]}
            </option>
          ))}
        </Select>
        <span className="flex gap-2">
          <Button
            disabled={!q.data?.length}
            onClick={() =>
              downloadCsv('equipment.csv', [
                ['Name', 'Category', 'Space', 'Serial number', 'Bought', 'Warranty until', 'Condition'],
                ...(q.data ?? []).map((a) => [a.name, a.category, a.resourceName ?? '', a.serialNumber, a.purchasedOn ?? '', a.warrantyUntil ?? '', ASSET_WORD[a.status]]),
              ])
            }
          >
            <Download size={15} aria-hidden /> Export
          </Button>
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={15} aria-hidden /> Add equipment
          </Button>
        </span>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !q.data?.length ? (
        <Empty title="No equipment listed" hint="Keep a list of the monitors, projectors and furniture in each space, with serial numbers and warranty dates." action={<Button variant="primary" onClick={() => setEditing('new')}>Add equipment</Button>} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th>Space</th>
                <th>Serial number</th>
                <th>Warranty</th>
                <th>Condition</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="font-semibold">{a.name}</span>
                    {a.category && <span className="block text-xs text-slate">{a.category}</span>}
                  </td>
                  <td>{a.resourceName ?? '—'}</td>
                  <td className="num">{a.serialNumber || '—'}</td>
                  <td className="num whitespace-nowrap">
                    {a.warrantyUntil ? fmtDate(a.warrantyUntil) : '—'}
                    {a.warrantyUntil && a.warrantyUntil < today && <span className="ml-1.5 text-xs font-semibold text-busy">ended</span>}
                    {a.warrantyUntil && a.warrantyUntil >= today && a.warrantyUntil <= soon && <span className="ml-1.5 text-xs font-semibold text-hold">ends soon</span>}
                  </td>
                  <td>
                    <Chip tone={assetTone[a.status]}>{ASSET_WORD[a.status]}</Chip>
                  </td>
                  <td className="r whitespace-nowrap">
                    <Button small variant="ghost" onClick={() => setEditing(a)}>
                      Edit
                    </Button>
                    <Button small variant="ghost" aria-label={`Remove ${a.name}`} onClick={() => window.confirm(`Remove ${a.name} from the list?`) && remove.mutate(a.id)}>
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add equipment' : 'Edit equipment'} wide>
        {editing && <AssetForm initial={editing === 'new' ? undefined : editing} space={space} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export default function Maintenance() {
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const space = params.get('space') ?? '';
  const [tab, setTab] = useState<Tab>('problems');
  const spaces = useSpaces();
  const issues = useQuery({ queryKey: ['issues', loc.id, ''], queryFn: () => api.get<Issue[]>('/issues', { locationId: loc.id }) });
  const tasks = useQuery({ queryKey: ['tasks', loc.id, ''], queryFn: () => api.get<SpaceTask[]>('/tasks', { locationId: loc.id }) });
  const assets = useQuery({ queryKey: ['assets', loc.id, '', ''], queryFn: () => api.get<SpaceAsset[]>('/assets', { locationId: loc.id }) });
  const open = (issues.data ?? []).filter((i) => i.status !== 'resolved').length;
  const overdue = (tasks.data ?? []).filter((t) => t.overdue).length;
  const repair = (assets.data ?? []).filter((a) => a.status === 'needs_repair').length;

  return (
    <>
      <PageHeader title="Maintenance" sub="Problems members report, cleaning and upkeep, and the equipment in each space.">
        <Select aria-label="Only this space" value={space} onChange={(e) => setParams(e.target.value ? { space: e.target.value } : {})} className="!w-auto">
          <option value="">All spaces</option>
          {spaces.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'problems', label: open ? `Problems (${open})` : 'Problems' },
            { value: 'schedule', label: overdue ? `Schedule (${overdue} overdue)` : 'Schedule' },
            { value: 'equipment', label: repair ? `Equipment (${repair} to repair)` : 'Equipment' },
          ]}
        />
        <p className="text-sm text-slate">{titleCase(tab)}</p>
      </div>

      {tab === 'problems' ? <Problems space={space} /> : tab === 'schedule' ? <Schedule space={space} /> : <Equipment space={space} />}
    </>
  );
}

export type { IssuePriority };
