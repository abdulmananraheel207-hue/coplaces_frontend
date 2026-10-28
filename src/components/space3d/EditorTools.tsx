import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Copy,
  Printer,
  RotateCw,
  Save,
  Trash2,
} from 'lucide-react';
import { api, errorMessage } from '../../api';
import { OBJECTS, PALETTE, TINTS, styleDef, type PaletteEntry } from '../../lib/catalogue';
import type { FloorTemplate, TemplateThing } from '../../types';
import { Button, Empty, ErrorNote, Field, Input, Loading, Modal, Select } from '../ui';
import { boxOf, isResource, type AlignMode, type Draft, type GridOptions, type Thing } from './editorModel';
import { floorLabel, footprint } from './layout';

const ENTRIES = PALETTE.flatMap((g) => g.entries.map((e) => ({ group: g.title, entry: e })));
const isDesk = (e: PaletteEntry) => e.type === 'resource' && (e.kind === 'hot_desk' || e.kind === 'dedicated_desk') && (e.style === 'standard' || e.style === 'standing' || e.style === 'corner');

// ---------------------------------------------------------------------------------------------
// Many at once

/** Pick one thing and how many of it, in a grid, or a pod of four desks. It lands at the nearest free spot, selected, ready to drag. */
export function AddMany({ open, onClose, initial, onAdd }: { open: boolean; onClose: () => void; initial: PaletteEntry | null; onAdd: (entry: PaletteEntry, o: GridOptions) => string | null }) {
  const [id, setId] = useState(initial?.id ?? 'hot_desk:standard');
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(2);
  const [gap, setGap] = useState('0.1');
  const [turned, setTurned] = useState(false);
  const [pod, setPod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = ENTRIES.find((e) => e.entry.id === id)?.entry ?? ENTRIES[0]!.entry;
  const podOk = isDesk(picked);
  const n = pod && podOk ? 4 : cols * rows;
  const tooMany = picked.type === 'resource' ? n > 60 : n > 80;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const g = Number(gap);
    const problem = onAdd(picked, { cols, rows, gap: Number.isFinite(g) ? Math.min(3, Math.max(0, g)) : 0.1, rot: turned ? 1 : 0, pod: pod && podOk });
    if (problem) setError(problem);
    else {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add many at once">
      <form onSubmit={submit} className="space-y-4">
        <Field label="What to add">
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            {PALETTE.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        {podOk && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={pod} onChange={(e) => setPod(e.target.checked)} className="size-4 accent-ink" />
            A pod of four desks, two facing each way
          </label>
        )}
        {!(pod && podOk) && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Across">
              <Input type="number" min={1} max={30} value={cols} onChange={(e) => setCols(Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1))))} />
            </Field>
            <Field label="Down">
              <Input type="number" min={1} max={30} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1))))} />
            </Field>
            <Field label="Gap (m)">
              <Input type="number" min={0} max={3} step={0.05} value={gap} onChange={(e) => setGap(e.target.value)} />
            </Field>
          </div>
        )}
        {!(pod && podOk) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={turned} onChange={(e) => setTurned(e.target.checked)} className="size-4 accent-ink" />
            Turn them a quarter
          </label>
        )}
        <p className="text-sm text-slate">
          This adds <strong className="num text-ink">{n}</strong> {picked.label.toLowerCase()}
          {n === 1 ? '' : 's'} at the nearest free spot, all selected so you can drag them where you want. Each gets its own name.
        </p>
        {tooMany && <ErrorNote error={new Error('That is more than can be added at once. Make the grid smaller.')} />}
        {error && <ErrorNote error={new Error(error)} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={tooMany}>
            Add {n}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Templates

/** Saved arrangements for the whole organization: put one on this floor, or save what is selected as a new one. */
export function Templates({ open, onClose, selectedCount, onSave, onApply }: { open: boolean; onClose: () => void; selectedCount: number; onSave: (name: string) => Promise<void>; onApply: (t: FloorTemplate) => string | null }) {
  const q = useQuery({ queryKey: ['floor-templates'], queryFn: () => api.get<FloorTemplate[]>('/floor-plan/templates'), enabled: open });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => onSave(name.trim()),
    onSuccess: () => {
      setName('');
      setError(null);
      void q.refetch();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/floor-plan/templates/${id}`),
    onSuccess: () => void q.refetch(),
    onError: (e) => setError(errorMessage(e)),
  });

  const count = (t: FloorTemplate) => {
    const spaces = t.things.filter((x) => x.type === 'resource').length;
    const rest = t.things.length - spaces;
    return [spaces && `${spaces} space${spaces === 1 ? '' : 's'}`, rest && `${rest} other${rest === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  };

  return (
    <Modal open={open} onClose={onClose} title="Floor templates" wide>
      <div className="space-y-5">
        <form
          className="rounded-xl border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && selectedCount) save.mutate();
          }}
        >
          <p className="mb-2 text-sm font-semibold">Save what is selected as a template</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Name" className="min-w-48 flex-1">
              <Input value={name} maxLength={80} placeholder="Open-plan pod, Reception area" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={!selectedCount || !name.trim() || save.isPending}>
              <Save size={15} aria-hidden /> Save {selectedCount || ''} selected
            </Button>
          </div>
          {!selectedCount && <p className="mt-2 text-xs text-slate">Close this, select the things you want to reuse (Shift and drag draws a box), then come back.</p>}
        </form>

        {error && <ErrorNote error={new Error(error)} />}

        {q.isLoading ? (
          <Loading />
        ) : !q.data?.length ? (
          <Empty title="No templates yet" hint="A template remembers an arrangement, such as a pod of desks with plants. Drop it on any floor, in any of your locations." />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {q.data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <span>
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block text-xs text-slate">{count(t)}</span>
                </span>
                <span className="flex gap-1.5">
                  <Button
                    small
                    variant="primary"
                    onClick={() => {
                      const problem = onApply(t);
                      if (problem) setError(problem);
                      else onClose();
                    }}
                  >
                    Place on this floor
                  </Button>
                  <Button small variant="ghost" aria-label={`Delete ${t.name}`} disabled={remove.isPending} onClick={() => window.confirm(`Delete the template "${t.name}"?`) && remove.mutate(t.id)}>
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Several selected

const ALIGN: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: 'left', label: 'Line up left edges', Icon: AlignStartVertical },
  { mode: 'centre', label: 'Line up centres, left to right', Icon: AlignCenterVertical },
  { mode: 'right', label: 'Line up right edges', Icon: AlignEndVertical },
  { mode: 'top', label: 'Line up top edges', Icon: AlignStartHorizontal },
  { mode: 'middle', label: 'Line up middles, top to bottom', Icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Line up bottom edges', Icon: AlignEndHorizontal },
  { mode: 'spread-x', label: 'Space evenly, left to right', Icon: AlignHorizontalSpaceBetween },
  { mode: 'spread-z', label: 'Space evenly, top to bottom', Icon: AlignVerticalSpaceBetween },
];

export function GroupPanel({ things, onDuplicate, onTurn, onRemove, onAlign, onTemplate, onClear }: { things: Thing[]; onDuplicate: () => void; onTurn: () => void; onRemove: () => void; onAlign: (m: AlignMode) => void; onTemplate: () => void; onClear: () => void }) {
  const spaces = things.filter(isResource).length;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="display text-lg">{things.length} selected</h3>
        <p className="text-sm text-slate">
          {spaces} space{spaces === 1 ? '' : 's'}, {things.length - spaces} other. Drag any one of them to move them all. Shift-click to add or remove one.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onDuplicate}>
          <Copy size={15} aria-hidden /> Duplicate
        </Button>
        <Button onClick={onTurn}>
          <RotateCw size={15} aria-hidden /> Turn each
        </Button>
        <Button onClick={onTemplate}>
          <Save size={15} aria-hidden /> Save as template
        </Button>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold">Line up</p>
        <div className="flex flex-wrap gap-1">
          {ALIGN.map(({ mode, label, Icon }) => (
            <button key={mode} type="button" title={label} aria-label={label} onClick={() => onAlign(mode)} className="grid size-9 place-items-center rounded-lg border border-line-strong bg-paper hover:border-ink/50">
              <Icon size={16} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={onRemove}>
          <Trash2 size={15} aria-hidden /> Remove all
        </Button>
        <Button variant="ghost" onClick={onClear}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A plan on paper

const KIND_FILL: Record<string, string> = {
  room: '#c5d8f2',
  corporate_room: '#9fbbe6',
  office: '#cde7d9',
  hot_desk: '#f4e7b0',
  dedicated_desk: '#f0d98a',
  storage: '#dfe5eb',
  object: '#e8edf3',
};

const kindName = (t: Thing) => (t.type === 'object' ? 'Facility or amenity' : { room: 'Meeting room', corporate_room: 'Corporate room', office: 'Office', hot_desk: 'Hot desk', dedicated_desk: 'Dedicated desk', storage: 'Locker, mailbox or parking' }[t.kind]);

/** The floor drawn flat, with names and a scale, to print or save as a PDF. */
export function PlanPrint({ open, onClose, draft, floor, title }: { open: boolean; onClose: () => void; draft: Draft; floor: string; title: string }) {
  const things = useMemo(() => draft.things.filter((t) => t.floor === floor), [draft, floor]);
  const view = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const t of things) {
      const f = footprint(boxOf(t));
      minX = Math.min(minX, f.minX);
      maxX = Math.max(maxX, f.maxX);
      minZ = Math.min(minZ, f.minZ);
      maxZ = Math.max(maxZ, f.maxZ);
    }
    if (!things.length) return { minX: -5, minZ: -4, w: 10, d: 8 };
    const pad = 1.5;
    return { minX: minX - pad, minZ: minZ - pad, w: maxX - minX + pad * 2, d: maxZ - minZ + pad * 2 };
  }, [things]);
  const scale = Math.min(900 / view.w, 600 / view.d);
  const sx = (x: number) => (x - view.minX) * scale;
  const sz = (z: number) => (z - view.minZ) * scale;
  const kinds = [...new Set(things.map((t) => (t.type === 'object' ? 'object' : t.kind)))];
  const meter = 5;

  const print = () => {
    document.body.classList.add('printing-plan');
    const done = () => {
      document.body.classList.remove('printing-plan');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <Modal open={open} onClose={onClose} title="Print the floor plan" xwide>
      <div className="space-y-4">
        <div className="plan-print-sheet rounded-xl border border-line bg-white p-4 text-ink">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h3 className="display text-xl">{title}</h3>
            <p className="text-sm text-slate">{floorLabel(floor)}</p>
          </div>
          <svg viewBox={`0 0 ${view.w * scale} ${view.d * scale}`} className="h-auto w-full" role="img" aria-label={`Floor plan of ${floorLabel(floor)}`}>
            <rect width="100%" height="100%" fill="#fbfcfd" />
            {things
              .filter((t) => t.type === 'object' && t.object === 'zone')
              .map((t) => {
                const f = footprint(boxOf(t));
                const tint = TINTS.find((x) => x.value === (t.type === 'object' ? (t.tint ?? '') : '')) ?? TINTS[0]!;
                return <rect key={t.key} x={sx(f.minX)} y={sz(f.minZ)} width={(f.maxX - f.minX) * scale} height={(f.maxZ - f.minZ) * scale} fill={tint.color} opacity={0.7} rx={6} />;
              })}
            {things
              .filter((t) => !(t.type === 'object' && t.object === 'zone'))
              .map((t) => {
                const f = footprint(boxOf(t));
                const w = (f.maxX - f.minX) * scale;
                const h = (f.maxZ - f.minZ) * scale;
                const wall = t.type === 'object' && (t.object === 'wall' || t.object === 'glass_wall');
                const opening = t.type === 'object' && (t.object === 'door' || t.object === 'window');
                const fill = wall ? '#14263f' : opening ? '#f6c324' : KIND_FILL[t.type === 'object' ? 'object' : t.kind]!;
                const name = t.type === 'object' ? (t.label || OBJECTS[t.object].tag || OBJECTS[t.object].label) : t.name;
                const showName = !wall && !opening && w > 30 && h > 16;
                return (
                  <g key={t.key}>
                    <rect x={sx(f.minX)} y={sz(f.minZ)} width={w} height={h} fill={fill} stroke="#14263f" strokeWidth={wall || opening ? 0 : 0.8} rx={wall ? 0 : 2} />
                    {showName && (
                      <text x={sx(f.minX) + w / 2} y={sz(f.minZ) + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(11, Math.max(6, w / Math.max(4, name.length) * 1.5))} fill="#14263f" fontFamily="sans-serif">
                        {name}
                      </text>
                    )}
                  </g>
                );
              })}
            {/* Scale bar */}
            <g transform={`translate(12 ${view.d * scale - 20})`}>
              <rect width={meter * scale} height={5} fill="#14263f" />
              <text y={-3} fontSize={10} fill="#14263f" fontFamily="sans-serif">
                {meter} m
              </text>
            </g>
          </svg>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm border border-ink/40" style={{ background: KIND_FILL[k] }} />
                {k === 'object' ? 'Facilities and amenities' : kindName(things.find((t) => t.type === 'resource' && t.kind === k)!)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={print}>
            <Printer size={15} aria-hidden /> Print or save as PDF
          </Button>
        </div>
        <p className="text-xs text-slate">In the print window, choose "Save as PDF" as the printer to keep a file.</p>
      </div>
    </Modal>
  );
}

/** Looks a palette entry up by its id, for the add-many dialog to start from what is armed. */
export const entryById = (id: string) => ENTRIES.find((e) => e.entry.id === id)?.entry ?? null;
export { styleDef };
export type { TemplateThing };
