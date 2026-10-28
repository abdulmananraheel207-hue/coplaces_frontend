import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Accessibility,
  ArrowUpDown,
  BedDouble,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Candy,
  Car,
  ClipboardPaste,
  Coffee,
  Columns3,
  ConciergeBell,
  CookingPot,
  Copy,
  Cross,
  Droplets,
  DoorClosed,
  DoorOpen,
  Eye,
  EyeOff,
  FileUp,
  FireExtinguisher,
  Footprints,
  Gamepad2,
  GraduationCap,
  Headphones,
  Landmark,
  Laptop,
  LayoutTemplate,
  Library,
  Lock,
  Mail,
  Mic,
  Minus,
  Monitor,
  MousePointer2,
  Package,
  PanelTop,
  Phone,
  PhoneCall,
  Plus,
  Presentation,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Search,
  Server,
  ShieldCheck,
  Sofa,
  Sprout,
  Square,
  SquareStack,
  Theater,
  Toilet,
  Trash2,
  TreePine,
  Type,
  Undo2,
  UserRoundCheck,
  Users,
  UtensilsCrossed,
  Video,
  Warehouse,
  X,
  Zap,
  BrickWall,
  type LucideIcon,
} from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useFeature } from '../../auth';
import { OBJECTS, PALETTE, STYLES, TINTS, VARIANTS, isRoomKind, styleDef, type PaletteEntry } from '../../lib/catalogue';
import { fromCents, toCents } from '../../lib/format';
import { useRefresh } from '../../lib/queries';
import type { SpaceItem } from '../../lib/spaceState';
import type { FloorObject, FloorTemplate, ObjectTint, ObjectVariant, Resource } from '../../types';
import { AmenityPicker } from '../AmenityPicker';
import { useToast } from '../toast';
import { Button, ErrorNote, Field, Input, Modal, Segmented, Select } from '../ui';
import { AddMany, GroupPanel, PlanPrint, Templates, entryById } from './EditorTools';
import {
  SNAP,
  addFloor,
  alignThings,
  anyCollision,
  applyTemplate,
  boxOf,
  buildSave,
  duplicateThings,
  fits,
  floorsOf,
  isFree,
  isObject,
  isResizable,
  limitsOf,
  moveThings,
  patchObject,
  patchResource,
  placeGrid,
  placeThing,
  problems,
  removeThings,
  resizeThing,
  rotateThings,
  sceneItems,
  sceneObjects,
  sizeOfThing,
  startDraft,
  toTemplate,
  type AlignMode,
  type Draft,
  type GridOptions,
  type Thing,
} from './editorModel';
import { GLASS, LabelOverlay, STAGE_BG } from './Labels';
import { floorKey, floorLabel, floorMark, labelSpecs, layoutFloors, stackPlan } from './layout';
import PlanImport, { type Imported } from './PlanImport';
import type { EditApi, Underlay } from './Scene';
import { Boundary } from './SpaceViewer';

const Scene = lazy(() => import('./Scene'));

const ICONS: Record<string, LucideIcon> = {
  'room:meeting': Presentation,
  'room:phone_booth': Phone,
  'room:huddle': Sofa,
  'room:training': GraduationCap,
  'room:studio': Mic,
  'room:interview': Users,
  'room:focus': Headphones,
  'room:video_call': Video,
  'corporate_room:boardroom': Landmark,
  'corporate_room:training_hall': Theater,
  'corporate_room:event_hall': Presentation,
  'office:standard': Building2,
  'office:executive': Briefcase,
  'hot_desk:standard': Monitor,
  'hot_desk:standing': Laptop,
  'hot_desk:corner': Monitor,
  'hot_desk:day_office': DoorClosed,
  'dedicated_desk:standard': UserRoundCheck,
  'dedicated_desk:standing': UserRoundCheck,
  'dedicated_desk:corner': UserRoundCheck,
  'dedicated_desk:team_pod': Users,
  'storage:locker': Lock,
  'storage:mailbox': Mail,
  'storage:parking': Car,
  'object:kitchen': CookingPot,
  'object:coffee_machine': Coffee,
  'object:lounge': Sofa,
  'object:print_station': Printer,
  'object:reception': ConciergeBell,
  'object:plant': Sprout,
  'object:core': ArrowUpDown,
  'object:pantry': UtensilsCrossed,
  'object:water_dispenser': Droplets,
  'object:vending_machine': Candy,
  'object:recreation': Gamepad2,
  'object:nap_pod': BedDouble,
  'object:phone_corner': PhoneCall,
  'object:library': Library,
  'object:washroom_men': Toilet,
  'object:washroom_women': Toilet,
  'object:washroom_accessible': Accessibility,
  'object:prayer_room': BookOpen,
  'object:server_room': Server,
  'object:storage_room': Package,
  'object:mail_room': Mail,
  'object:generator_room': Zap,
  'object:security_desk': ShieldCheck,
  'object:fire_exit': DoorOpen,
  'object:extinguisher': FireExtinguisher,
  'object:first_aid': Cross,
  'object:terrace': TreePine,
  'object:bike_rack': Bike,
  'object:wall': BrickWall,
  'object:glass_wall': PanelTop,
  'object:door': DoorOpen,
  'object:window': Square,
  'object:column': Columns3,
  'object:zone': SquareStack,
  'object:label': Type,
};

const collator = new Intl.Collator('en', { numeric: true });
const EDIT_PAD = 3;

/** A text box that commits when you leave it or press Enter, so one edit is one step in the undo history. */
function Commit({ value, onCommit, ...props }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const done = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <Input
      {...props}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          done();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** A size in metres: type it, or step it. */
function SizeField({ label, value, step, min, max, onSet }: { label: string; value: number; step: number; min: number; max: number; onSet: (v: number) => void }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold">{label}</p>
      <div className="flex items-center gap-1">
        <Button small aria-label={`${label}: smaller`} onClick={() => onSet(Math.max(min, value - step))} disabled={value <= min}>
          <Minus size={14} />
        </Button>
        <Commit
          aria-label={`${label} in metres`}
          inputMode="decimal"
          value={String(Math.round(value * 100) / 100)}
          className="num !w-16 !px-1 !py-1 text-center"
          onCommit={(t) => {
            const v = Number(t);
            if (Number.isFinite(v)) onSet(Math.min(max, Math.max(min, v)));
          }}
        />
        <Button small aria-label={`${label}: larger`} onClick={() => onSet(Math.min(max, value + step))} disabled={value >= max}>
          <Plus size={14} />
        </Button>
        <span className="text-xs text-slate">m</span>
      </div>
    </div>
  );
}

export default function FloorPlanEditor({
  locationId,
  locationName,
  currency,
  resources,
  objects,
  onClose,
}: {
  locationId: string;
  locationName?: string;
  currency: string;
  resources: Resource[];
  objects: FloorObject[];
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefresh();

  const [start] = useState(() => startDraft(resources, objects));
  const [hist, setHist] = useState(() => ({ past: [] as Draft[], present: start.draft, future: [] as Draft[] }));
  const draft = hist.present;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirty = hist.past.length > 0;

  const commit = useCallback(
    (next: Draft) => setHist((h) => (next === h.present ? h : { past: [...h.past.slice(-59), h.present], present: next, future: [] })),
    [],
  );
  const undo = useCallback(() => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h)), []);

  // A location with nothing in it yet still gets a first floor to build on.
  const floorList = (d: Draft) => {
    const all = [...new Set(floorsOf(d))].sort((a, b) => collator.compare(a || '0', b || '0'));
    return all.length ? all : ['1'];
  };
  const floors = useMemo(() => floorList(draft), [draft]);
  const [floor, setFloor] = useState(() => floorList(start.draft)[0]!);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [armed, setArmed] = useState<PaletteEntry | null>(null);
  const [ghostRot, setGhostRot] = useState(0);
  const [tab, setTab] = useState<'add' | 'selected'>('add');
  const [find, setFind] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [addingFloor, setAddingFloor] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [many, setMany] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [tool, setTool] = useState<'select' | 'measure'>('select');
  const [clipboard, setClipboard] = useState<ReturnType<typeof toTemplate> | null>(null);
  const canImport = useFeature('plan_import');
  // The plan picture drawn under a floor to trace over. It lives only for this editing session.
  const [picture, setPicture] = useState<{ url: string; floor: string; x: number; z: number; w: number; d: number } | null>(null);
  const [pictureOn, setPictureOn] = useState(true);
  const [pictureOpacity, setPictureOpacity] = useState(0.55);
  const [notice, setNotice] = useState('');
  const serial = useRef(0);
  const nextSerial = useCallback(() => ++serial.current, []);
  const overlay = useRef<HTMLDivElement>(null);

  const takenNames = useMemo(() => resources.map((r) => r.name), [resources]);
  const primary = selected.at(-1) ?? null;
  const single = selected.length === 1 ? (draft.things.find((t) => t.key === selected[0]) ?? null) : null;
  const group = useMemo(() => draft.things.filter((t) => selected.includes(t.key)), [draft, selected]);

  // Each floor's coordinates stay put for the whole session, so nothing slides about as things are moved.
  const origins = useRef(start.origins);
  for (const f of floors) if (!origins.current[floorKey(f)]) origins.current[floorKey(f)] = { x: 0, z: 0 };

  const items = useMemo(() => sceneItems(draft), [draft]);
  const objs = useMemo(() => sceneObjects(draft), [draft]);
  const reach = useMemo(() => (picture ? { [floorKey(picture.floor)]: picture } : undefined), [picture]);
  const layouts = useMemo(() => layoutFloors(items, objs, { origins: origins.current, pad: EDIT_PAD, floors, reach }), [items, objs, floors, reach]);
  const underlay = useMemo<Underlay | undefined>(
    () => (picture && pictureOn ? { floorKey: floorKey(picture.floor), url: picture.url, x: picture.x, z: picture.z, w: picture.w, d: picture.d, opacity: pictureOpacity } : undefined),
    [picture, pictureOn, pictureOpacity],
  );
  const pictureRef = useRef(picture);
  pictureRef.current = picture;
  useEffect(() => () => {
    if (pictureRef.current) URL.revokeObjectURL(pictureRef.current.url);
  }, []);
  const plan = useMemo(() => stackPlan(layouts, floor), [layouts, floor]);
  const labels = useMemo(() => labelSpecs(layouts), [layouts]);

  // Frame the camera once per floor, and again on request, rather than on every change.
  const planRef = useRef(plan);
  planRef.current = plan;
  const [fit, setFit] = useState<typeof plan.bounds | undefined>();
  useEffect(() => setFit(planRef.current.bounds), [floor, resetKey]);

  // The current floor must exist; if it no longer does (everything on it removed in a fresh floor), go to the first.
  useEffect(() => {
    if (!floors.includes(floor)) setFloor(floors[0] ?? '1');
  }, [floors, floor]);
  // Things that no longer exist, or are on another floor, drop out of the selection.
  useEffect(() => {
    const live = selected.filter((k) => draft.things.some((t) => t.key === k && t.floor === floor));
    if (live.length !== selected.length) setSelected(live);
  }, [draft, floor, selected]);

  // --- the armed thing, as a ghost ---
  const ghost = useMemo((): EditApi['ghost'] => {
    if (!armed) return null;
    if (armed.type === 'object') {
      const def = OBJECTS[armed.object];
      return { object: { id: 'ghost', type: armed.object, label: '', x: 0, z: 0, w: def.w, d: def.d, rot: ghostRot, variant: '', tint: '' } };
    }
    const def = styleDef(armed.kind, armed.style);
    const size = def.size(def.capacity);
    const item: SpaceItem = { id: 'ghost', kind: armed.kind, style: def.key, name: '', floor, capacity: def.capacity, amenities: '', plan: null, tone: 'ok', status: '', bookable: false };
    return { placed: { item, x: 0, z: 0, w: size.w, d: size.d, rot: ghostRot, tier: 0 } };
  }, [armed, ghostRot, floor]);

  const arm = (entry: PaletteEntry | null) => {
    setArmed(entry);
    setNotice('');
    if (entry) {
      setSelected([]);
      setTab('add');
      setTool('select');
    }
  };

  /** Where new things go when nothing says: the middle of what is in view. */
  const viewCentre = useCallback(() => {
    const o = origins.current[floorKey(floor)] ?? { x: 0, z: 0 };
    const b = planRef.current.bounds;
    return { x: b.cx + o.x, z: b.cz + o.z };
  }, [floor]);

  const place = useCallback(
    (x: number, z: number) => {
      if (!armed) return;
      const { draft: next } = placeThing(draftRef.current, armed, floor, x, z, ghostRot, takenNames, ++serial.current);
      commit(next);
      setNotice('');
    },
    [armed, floor, ghostRot, takenNames, commit],
  );

  const edit: EditApi = {
    floorKey: floorKey(floor),
    ghost,
    fits: (box, ignore, free) => fits(draftRef.current, floor, box, ignore, free),
    others: (ignore) => draftRef.current.things.filter((t) => t.floor === floor && !ignore.includes(t.key)).map(boxOf),
    selectedIds: selected,
    onMoveMany: (moves) => {
      commit(moveThings(draftRef.current, moves.map((m) => ({ key: m.id, x: m.x, z: m.z }))));
      setNotice('');
    },
    onPlace: place,
    onSelect: (key, additive) => {
      setSelected((cur) => (key === null ? [] : additive ? (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]) : [key]));
      if (key) {
        setArmed(null);
        setTab('selected');
      }
    },
    onMarquee: (ids, additive) => {
      setSelected((cur) => [...new Set(additive ? [...cur, ...ids] : ids)]);
      if (ids.length) {
        setArmed(null);
        setTab('selected');
      }
    },
    tool,
    onMeasured: (m) => setNotice(m === null ? '' : `Distance: ${m.toFixed(2)} m`),
    snap: SNAP,
  };

  // --- an imported plan ---
  const applyImport = (im: Imported) => {
    commit(im.draft);
    setPicture((old) => {
      if (old) URL.revokeObjectURL(old.url);
      const { blob, ...at } = im.picture;
      return { url: URL.createObjectURL(blob), floor: im.floor, ...at };
    });
    setPictureOn(true);
    setFloor(im.floor);
    setSelected([]);
    setArmed(null);
    setImporting(false);
    setResetKey((k) => k + 1);
    setNotice(im.summary);
  };
  const dropPicture = () => {
    setPicture((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
  };

  // --- changes to the selection ---
  const turn = useCallback(() => {
    if (armed) {
      setGhostRot((r) => (r + 1) % 4);
      return;
    }
    const d = draftRef.current;
    const keys = selectedRef.current;
    if (!keys.length) return;
    const next = rotateThings(d, keys);
    const turned = next.things.filter((t) => keys.includes(t.key));
    if (!turned.every((t) => isFree(t) || fits(next, t.floor, boxOf(t), keys))) setNotice('There is not enough room to turn that here. Move it first, or clear the space beside it.');
    else {
      commit(next);
      setNotice('');
    }
  }, [armed, commit]);

  const remove = useCallback(() => {
    const keys = selectedRef.current;
    if (!keys.length) return;
    commit(removeThings(draftRef.current, keys));
    setSelected([]);
    setNotice('');
  }, [commit]);

  const nudge = useCallback(
    (dx: number, dz: number) => {
      const d = draftRef.current;
      const keys = selectedRef.current;
      const things = d.things.filter((x) => keys.includes(x.key));
      if (!things.length) return;
      const moved = things.map((t) => ({ t, box: { ...boxOf(t), x: t.x + dx, z: t.z + dz } }));
      if (moved.every(({ t, box }) => fits(d, t.floor, box, keys, isFree(t)))) commit(moveThings(d, moved.map(({ t, box }) => ({ key: t.key, x: box.x, z: box.z }))));
    },
    [commit],
  );

  const setSize = (t: Thing, w: number, d: number) => {
    const next = resizeThing(draftRef.current, t.key, w, d);
    const grown = next.things.find((x) => x.key === t.key)!;
    if (!isFree(grown) && !fits(next, t.floor, boxOf(grown), t.key)) setNotice('There is no room to make it that size. Move what is beside it first.');
    else {
      commit(next);
      setNotice('');
    }
  };

  const select = (keys: string[]) => {
    setSelected(keys);
    if (keys.length) {
      setArmed(null);
      setTab('selected');
    }
  };

  const duplicate = useCallback(() => {
    const keys = selectedRef.current;
    if (!keys.length) return;
    const r = duplicateThings(draftRef.current, keys, nextSerial);
    if (!r) setNotice('There is no free room on this floor for copies.');
    else {
      commit(r.draft);
      select(r.keys);
      setNotice(`${r.keys.length === 1 ? 'A copy' : `${r.keys.length} copies`} added beside the original. Drag to move.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, nextSerial]);

  const copy = useCallback(() => {
    const keys = selectedRef.current;
    if (!keys.length) return;
    setClipboard(toTemplate(draftRef.current, keys));
    setNotice(`${keys.length} copied. Press Ctrl+V to paste on any floor.`);
  }, []);

  const paste = useCallback(() => {
    if (!clipboard?.length) return;
    const r = applyTemplate(draftRef.current, clipboard, floor, viewCentre(), takenNames, nextSerial);
    if (!r) setNotice('There is no free room on this floor to paste into.');
    else {
      commit(r.draft);
      select(r.keys);
      setNotice(`${r.keys.length} pasted. Drag to move.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipboard, floor, viewCentre, takenNames, commit, nextSerial]);

  const align = (mode: AlignMode) => {
    const next = alignThings(draftRef.current, selectedRef.current, mode);
    if (anyCollision(next, floor) && !anyCollision(draftRef.current, floor)) setNotice('Lining those up would put them on top of each other. Move them apart first.');
    else {
      commit(next);
      setNotice('');
    }
  };

  const addMany = (entry: PaletteEntry, o: GridOptions): string | null => {
    const r = placeGrid(draftRef.current, entry, floor, o, viewCentre(), takenNames, nextSerial);
    if (!r) return 'There is no free room on this floor for that many.';
    commit(r.draft);
    select(r.keys);
    setNotice(`${r.keys.length} added. They are all selected, so drag any one to move them together.`);
    return null;
  };

  // --- keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], dialog')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const some = selectedRef.current.length > 0;
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'a') {
        e.preventDefault();
        select(draftRef.current.things.filter((t) => t.floor === floor).map((t) => t.key));
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && key === 'c') {
        if (some) {
          e.preventDefault();
          copy();
        }
      } else if (mod && key === 'v') {
        e.preventDefault();
        paste();
      } else if (key === 'escape') {
        if (tool === 'measure') setTool('select');
        else if (armed) setArmed(null);
        else setSelected([]);
      } else if (!mod && key === 'r') {
        turn();
      } else if (!mod && key === 'm') {
        setTool((t) => (t === 'measure' ? 'select' : 'measure'));
        setArmed(null);
      } else if (key === 'delete' || key === 'backspace') {
        if (some && !armed) {
          e.preventDefault();
          remove();
        }
      } else if (key.startsWith('arrow') && some && !armed) {
        e.preventDefault();
        nudge(key === 'arrowleft' ? -SNAP : key === 'arrowright' ? SNAP : 0, key === 'arrowup' ? -SNAP : key === 'arrowdown' ? SNAP : 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, tool, floor, undo, redo, turn, remove, nudge, duplicate, copy, paste]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // --- saving ---
  const issues = useMemo(() => problems(draft, resources), [draft, resources]);
  const { body, changes } = useMemo(() => buildSave(locationId, draft, resources, objects), [locationId, draft, resources, objects]);
  const save = useMutation({
    mutationFn: () => api.put('/floor-plan', body),
    onSuccess: () => {
      toast.ok('Floor plan saved');
      void refresh('resources', 'floor-objects', 'schedule', 'dashboard', 'assignments');
      onClose();
    },
  });

  // An error from the last attempt is about a draft that has since changed.
  useEffect(() => {
    if (save.isError) save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const summary = [changes.added && `${changes.added} added`, changes.changed && `${changes.changed} changed`, changes.removed && `${changes.removed} removed`].filter(Boolean).join(', ');
  const sorted = [...floors].reverse();
  const suggestedFloor = String(Math.max(0, ...floors.map((f) => Number(f) || 0)) + 1);

  const hint =
    tool === 'measure'
      ? 'Measuring. Click two points on the floor to read the distance. M or Esc goes back.'
      : armed
        ? `Placing ${armed.label}. Click the floor to put it down. R turns it, Esc stops.`
        : selected.length > 1
          ? `${selected.length} selected. Drag one to move them all, Ctrl+D copies them, Delete removes them.`
          : single
            ? 'Drag to move it, R to turn it, Delete to remove it. Arrow keys nudge it. Shift-click adds more.'
            : 'Choose something to add, or click a room or desk to move it. Shift and drag draws a box to select many. Drag empty floor to turn the view.';

  const words = find.trim().toLowerCase();
  const palette = words ? PALETTE.map((g) => ({ ...g, entries: g.entries.filter((e) => `${e.label} ${e.blurb} ${g.title}`.toLowerCase().includes(words)) })).filter((g) => g.entries.length) : PALETTE;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="display-sm text-lg">Editing the floor plan</h2>
          <p className="num text-sm text-slate">{summary || 'No changes yet.'}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canImport && (
            <Button onClick={() => setImporting(true)}>
              <FileUp size={16} aria-hidden /> Import plan
            </Button>
          )}
          <Button onClick={() => setTemplates(true)}>
            <LayoutTemplate size={16} aria-hidden /> Templates
          </Button>
          <Button onClick={() => setPrinting(true)}>
            <Printer size={16} aria-hidden /> Print
          </Button>
          <Button aria-label="Undo" onClick={undo} disabled={!hist.past.length}>
            <Undo2 size={16} aria-hidden /> Undo
          </Button>
          <Button aria-label="Redo" onClick={redo} disabled={!hist.future.length}>
            <Redo2 size={16} aria-hidden /> Redo
          </Button>
          <Button onClick={() => (dirty ? setLeaving(true) : onClose())}>{dirty ? 'Discard' : 'Close'}</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={!dirty || issues.length > 0 || save.isPending}>
            Save floor plan
          </Button>
        </div>
      </div>

      {(issues.length > 0 || save.error) && (
        <div className="mb-3 space-y-1.5">
          {issues.map((m) => (
            <ErrorNote key={m} error={new Error(m)} />
          ))}
          {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div role="group" aria-label="3D floor plan editor" className="on-ink relative isolate h-[32rem] overflow-hidden rounded-lg lg:h-[41rem]" style={{ background: STAGE_BG }}>
          <div role="img" aria-label={`3D editor for ${floorLabel(floor)}. Use the panel beside it to add and change things.`} className="absolute inset-0">
            <Boundary fallback={<div className="grid h-full place-items-center px-6 text-center text-sm text-white/80">The 3D editor could not start in this browser.</div>}>
              <Suspense fallback={<p role="status" className="grid h-full place-items-center text-sm text-white/70">Loading the editor…</p>}>
                <Scene plan={plan} labels={labels} overlay={overlay} selectedId={primary} onSelect={() => undefined} onHover={setHoverId} resetKey={resetKey} edit={edit} fit={fit} underlay={underlay} />
              </Suspense>
            </Boundary>
            <LabelOverlay labels={labels} selectedId={primary} hoverId={hoverId} overlay={overlay} />
          </div>

          <div role="group" aria-label="Floor" className={`absolute top-3 left-3 flex flex-col gap-1 rounded-full p-1 ${GLASS}`}>
            {sorted.map((f) => (
              <button
                key={f || 'ground'}
                type="button"
                aria-pressed={f === floor}
                aria-label={floorLabel(f)}
                title={floorLabel(f)}
                onClick={() => setFloor(f)}
                className={`display grid size-9 place-items-center rounded-full text-[14px] transition-colors ${f === floor ? 'bg-signal text-ink' : 'text-white/90 hover:bg-white/15'}`}
              >
                {floorMark(f)}
              </button>
            ))}
            <button type="button" aria-label="Add a floor" title="Add a floor" onClick={() => setAddingFloor(true)} className="grid size-9 place-items-center rounded-full border border-dashed border-white/50 text-white/90 hover:bg-white/15">
              <Plus size={16} aria-hidden />
            </button>
          </div>

          <div role="group" aria-label="Tool" className={`absolute top-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full p-1 ${GLASS}`}>
            <button type="button" aria-pressed={tool === 'select'} onClick={() => setTool('select')} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${tool === 'select' ? 'bg-signal text-ink' : 'text-white/90 hover:bg-white/15'}`}>
              <MousePointer2 size={14} aria-hidden /> Select
            </button>
            <button type="button" aria-pressed={tool === 'measure'} onClick={() => { setTool('measure'); setArmed(null); }} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${tool === 'measure' ? 'bg-signal text-ink' : 'text-white/90 hover:bg-white/15'}`}>
              <Ruler size={14} aria-hidden /> Measure
            </button>
          </div>

          <button type="button" onClick={() => setResetKey((k) => k + 1)} className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold hover:bg-ink ${GLASS}`}>
            <RotateCcw size={14} aria-hidden /> Reset view
          </button>

          {picture && picture.floor === floor && (
            <div role="group" aria-label="Floor plan picture" className={`absolute top-14 right-3 flex items-center gap-2 rounded-full py-1 pr-1.5 pl-3 text-[13px] ${GLASS}`}>
              <button type="button" aria-pressed={pictureOn} onClick={() => setPictureOn((on) => !on)} className="flex items-center gap-1.5 font-semibold hover:text-signal">
                {pictureOn ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />} Plan
              </button>
              <input
                type="range"
                aria-label="Plan picture opacity"
                min={15}
                max={95}
                value={Math.round(pictureOpacity * 100)}
                disabled={!pictureOn}
                onChange={(e) => setPictureOpacity(Number(e.target.value) / 100)}
                className="w-24 accent-[#f6c324]"
              />
              <button type="button" aria-label="Remove the plan picture" title="Remove the plan picture" onClick={dropPicture} className="grid size-7 place-items-center rounded-full hover:bg-white/15">
                <X size={14} aria-hidden />
              </button>
            </div>
          )}

          <p role="status" className={`pointer-events-none absolute right-3 bottom-3 left-3 rounded-2xl px-3 py-1.5 text-[13px] sm:right-auto sm:max-w-[36rem] ${GLASS}`}>
            {notice || hint}
          </p>
        </div>

        <aside className="flex min-h-0 flex-col gap-2 lg:h-[41rem]">
          <Segmented
            label="Panel"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'add', label: 'Add' },
              { value: 'selected', label: selected.length > 1 ? `Selected (${selected.length})` : single ? 'Selected' : 'Selected (none)' },
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto surface p-3">
            {tab === 'add' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button small onClick={() => setMany(true)}>
                    <SquareStack size={14} aria-hidden /> Add many…
                  </Button>
                  {clipboard && (
                    <Button small onClick={paste}>
                      <ClipboardPaste size={14} aria-hidden /> Paste {clipboard.length}
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate" />
                  <Input aria-label="Find something to add" placeholder="Find something to add" value={find} onChange={(e) => setFind(e.target.value)} className="!pl-8" />
                </div>
                <p className="text-sm text-slate">Pick something, then click the floor to place it. It stays armed so you can place several.</p>
                {palette.length === 0 && <p className="text-sm text-slate">Nothing matches "{find}".</p>}
                {palette.map((g) => (
                  <section key={g.title} aria-label={g.title}>
                    <h3 className="display-sm mb-1.5 text-[0.95rem]">{g.title}</h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {g.entries.map((e) => {
                        const Icon = ICONS[e.id] ?? Presentation;
                        const on = armed?.id === e.id;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => arm(on ? null : e)}
                            className={`flex items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-ink/30 bg-paper hover:border-ink hover:bg-plaster'}`}
                          >
                            <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${on ? 'text-signal' : 'text-ink'}`} />
                            <span className="min-w-0">
                              <span className="block text-[13px] leading-tight font-semibold">{e.label}</span>
                              <span className={`block text-[12px] leading-snug ${on ? 'text-white/75' : 'text-slate'}`}>{e.blurb}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : selected.length > 1 ? (
              <GroupPanel things={group} onDuplicate={duplicate} onTurn={turn} onRemove={remove} onAlign={align} onTemplate={() => setTemplates(true)} onClear={() => setSelected([])} />
            ) : single ? (
              <Properties
                t={single}
                currency={currency}
                overlapping={!isFree(single) && !fits(draft, single.floor, boxOf(single), single.key)}
                onPatch={(patch) => commit(patchResource(draft, single.key, patch))}
                onObject={(patch) => commit(patchObject(draft, single.key, patch))}
                onTurn={turn}
                onRemove={remove}
                onDuplicate={duplicate}
                onSize={(w, d) => setSize(single, w, d)}
              />
            ) : (
              <p className="text-sm text-slate">Click a room, desk or object in the 3D view to change its details, size or position. Hold Shift and drag across the floor to select several.</p>
            )}
          </div>
        </aside>
      </div>

      <Modal open={addingFloor} onClose={() => setAddingFloor(false)} title="Add a floor">
        <AddFloor
          suggested={suggestedFloor}
          existing={floors}
          onAdd={(label) => {
            commit(addFloor(draftRef.current, label));
            setFloor(label);
            setAddingFloor(false);
          }}
          onCancel={() => setAddingFloor(false)}
        />
      </Modal>

      {canImport && (
        <PlanImport open={importing} onClose={() => setImporting(false)} floors={floors} floor={floor} draft={draft} takenNames={takenNames} nextSerial={nextSerial} onApply={applyImport} />
      )}

      <AddMany key={many ? 'open' : 'closed'} open={many} onClose={() => setMany(false)} initial={armed ?? entryById('hot_desk:standard')} onAdd={addMany} />
      <Templates
        open={templates}
        onClose={() => setTemplates(false)}
        selectedCount={selected.length}
        onSave={async (name) => {
          await api.post('/floor-plan/templates', { name, things: toTemplate(draftRef.current, selectedRef.current) });
          toast.ok(`Saved the template "${name}"`);
        }}
        onApply={(t: FloorTemplate) => {
          const r = applyTemplate(draftRef.current, t.things, floor, viewCentre(), takenNames, nextSerial);
          if (!r) return 'There is no free room on this floor for that template.';
          commit(r.draft);
          select(r.keys);
          setNotice(`"${t.name}" placed. Drag to move it.`);
          return null;
        }}
      />
      <PlanPrint open={printing} onClose={() => setPrinting(false)} draft={draft} floor={floor} title={locationName ?? 'Floor plan'} />

      <Modal open={leaving} onClose={() => setLeaving(false)} title="Discard your changes?">
        <p className="text-sm">{summary ? `You have ${summary}. ` : ''}Nothing has been saved yet, so leaving now loses them.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setLeaving(false)}>Keep editing</Button>
          <Button variant="danger" onClick={onClose}>
            Discard changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AddFloor({ suggested, existing, onAdd, onCancel }: { suggested: string; existing: string[]; onAdd: (label: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(suggested);
  const clean = label.trim();
  const taken = existing.includes(clean);
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (clean && !taken) onAdd(clean);
      }}
      className="space-y-4"
    >
      <Field label="Floor name or number" hint={taken ? 'That floor already exists.' : 'For example 4, or M for a mezzanine. Add something to it to keep it.'}>
        <Input autoFocus required maxLength={50} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!clean || taken}>
          Add floor
        </Button>
      </div>
    </form>
  );
}

function Properties({
  t,
  currency,
  overlapping,
  onPatch,
  onObject,
  onTurn,
  onRemove,
  onDuplicate,
  onSize,
}: {
  t: Thing;
  currency: string;
  overlapping: boolean;
  onPatch: (patch: Parameters<typeof patchResource>[2]) => void;
  onObject: (patch: { label?: string; variant?: ObjectVariant; tint?: ObjectTint }) => void;
  onTurn: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onSize: (w: number, d: number) => void;
}) {
  const size = sizeOfThing(t);
  const resizable = isResizable(t);
  const limits = limitsOf(t);
  const sides = t.type === 'object' ? (OBJECTS[t.object].sides ?? { w: 'Width', d: 'Depth' }) : { w: 'Width', d: 'Depth' };
  const stepD = limits.max.d <= 1 ? 0.05 : SNAP;
  const title = isObject(t) ? OBJECTS[t.object].label : t.name || 'Unnamed';
  const variants = isObject(t) ? VARIANTS[t.object] : undefined;
  const rate = (apply: (c: number) => void) => (text: string) => {
    const c = toCents(text);
    if (c !== null) apply(c);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="display text-lg">{title}</h3>
        <p className="text-sm text-slate">
          {isObject(t) ? OBJECTS[t.object].blurb : `${styleDef(t.kind, t.style).label}${t.id ? '' : ', new'}`} on {floorLabel(t.floor).toLowerCase()}
        </p>
      </div>

      {overlapping && (
        <p role="alert" className="rounded-lg border border-busy/25 bg-busy-wash px-3 py-2 text-sm">
          This overlaps something beside it. Move it, or make it smaller.
        </p>
      )}

      {!isObject(t) ? (
        <>
          <Field label="Name">
            <Commit value={t.name} maxLength={100} onCommit={(name) => onPatch({ name })} />
          </Field>
          <Field label="Type">
            <Select value={t.style} onChange={(e) => onPatch({ style: e.target.value })}>
              {STYLES[t.kind].map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          {(isRoomKind(t.kind) || t.kind === 'office' || t.style === 'day_office' || t.style === 'team_pod') && (
            <Field label="Seats">
              <Commit type="number" min={1} max={500} value={String(t.capacity)} onCommit={(v) => Number(v) >= 1 && onPatch({ capacity: Math.min(500, Math.round(Number(v))) })} />
            </Field>
          )}
          {isRoomKind(t.kind) && (
            <Field label={`Hourly rate (${currency})`} hint={t.kind === 'corporate_room' ? "Always billed at this rate. A plan's included minutes do not apply. Peak hours, day passes and more are under Edit on the Spaces page." : 'Peak hours, day passes and more are under Edit on the Spaces page.'}>
              <Commit inputMode="decimal" value={fromCents(t.hourlyRateCents)} onCommit={rate((c) => onPatch({ hourlyRateCents: c }))} />
            </Field>
          )}
          {t.kind === 'hot_desk' && (
            <Field label={`Day rate (${currency})`}>
              <Commit inputMode="decimal" value={fromCents(t.dailyRateCents)} onCommit={rate((c) => onPatch({ dailyRateCents: c }))} />
            </Field>
          )}
          {(isRoomKind(t.kind) || t.kind === 'office' || t.kind === 'hot_desk' || t.kind === 'dedicated_desk') && (
            <div>
              <p className="mb-1 text-[13px] font-semibold">What it offers</p>
              <AmenityPicker compact value={t.amenities} onChange={(amenities) => onPatch({ amenities })} />
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Label" hint={OBJECTS[t.object].tag ? `Shown on the plan. Leave empty for "${OBJECTS[t.object].tag}".` : 'Shown on the plan, for example Lobby coffee.'}>
            <Commit value={t.label} maxLength={60} onCommit={(label) => onObject({ label })} />
          </Field>
          {variants && (
            <Field label="Style">
              <Select value={t.variant ?? ''} onChange={(e) => onObject({ variant: e.target.value as ObjectVariant })}>
                {variants.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {t.object === 'zone' && (
            <div>
              <p className="mb-1 text-[13px] font-semibold">Colour</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zone colour">
                {TINTS.map((x) => (
                  <button
                    key={x.value}
                    type="button"
                    title={x.label}
                    aria-label={x.label}
                    aria-pressed={(t.tint ?? '') === x.value}
                    onClick={() => onObject({ tint: x.value })}
                    className={`size-8 rounded-lg border-2 ${(t.tint ?? '') === x.value ? 'border-ink' : 'border-transparent hover:border-ink/40'}`}
                    style={{ background: x.color }}
                  />
                ))}
              </div>
              {(t.variant ?? '') === 'l' && <p className="mt-1 text-xs text-slate">The L-shape leaves the top right corner empty. Turn it to move the gap.</p>}
            </div>
          )}
        </>
      )}

      {resizable && (
        <div className="flex flex-wrap gap-4">
          <SizeField label={sides.w} value={size.w} step={SNAP} min={limits.min.w} max={limits.max.w} onSet={(w) => onSize(w, size.d)} />
          <SizeField label={sides.d} value={size.d} step={stepD} min={limits.min.d} max={limits.max.d} onSet={(d) => onSize(size.w, d)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={onTurn}>
          <RotateCw size={15} aria-hidden /> Turn
        </Button>
        <Button onClick={onDuplicate}>
          <Copy size={15} aria-hidden /> Duplicate
        </Button>
        <Button variant="danger" onClick={onRemove}>
          <Trash2 size={15} aria-hidden /> Remove
        </Button>
      </div>
      {!isObject(t) && t.id && <p className="text-[13px] text-slate">Removing a space takes it off the floor plan and out of booking. Its history stays. It cannot be removed while it has bookings coming up or is assigned to a member.</p>}
    </div>
  );
}
