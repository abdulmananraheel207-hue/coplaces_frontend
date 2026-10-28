import { OBJECTS, defaultSize, mayOverlap, nextName, styleDef, styleKey, type PaletteEntry } from '../../lib/catalogue';
import type { SpaceItem } from '../../lib/spaceState';
import type { FloorObject, FloorObjectType, ObjectTint, ObjectVariant, Resource, ResourceKind, TemplateThing } from '../../types';
import { floorKey, footprint, layoutFloors, overlaps, type Box } from './layout';

/**
 * The floor plan as it is while being edited. Nothing here touches the server: the editor works on a draft,
 * and `buildSave` turns the difference between the draft and what is stored into one request.
 */

export interface ResourceThing {
  type: 'resource';
  /** An existing space's id, or "new:n" until it has been saved. */
  key: string;
  id: string | null;
  kind: ResourceKind;
  /** Always spelled out, never empty. */
  style: string;
  name: string;
  floor: string;
  capacity: number;
  hourlyRateCents: number;
  dailyRateCents: number;
  amenities: string;
  /** In the plan's own coordinates, metres. */
  x: number;
  z: number;
  rot: number;
  /** Null means the default size for its style and seats. */
  w: number | null;
  d: number | null;
}

export interface ObjectThing {
  type: 'object';
  key: string;
  id: string | null;
  object: FloorObjectType;
  label: string;
  floor: string;
  x: number;
  z: number;
  rot: number;
  w: number | null;
  d: number | null;
  /** An L-shaped zone, a double door. Empty (or missing) is the plain one. */
  variant?: ObjectVariant;
  /** The colour wash of a zone. */
  tint?: ObjectTint;
}

export type Thing = ResourceThing | ObjectThing;

export interface Draft {
  things: Thing[];
  /** Floors added in this session that may not have anything on them yet. */
  floors: string[];
}

export const SNAP = 0.5;
export const LIMIT = 250;
export const MIN_SIDE = 1;
export const MAX_SIDE = 30;
const round = (n: number) => Math.round(n * 1000) / 1000;
/** Positions are compared to the millimetre, so float noise never looks like an edit. */
const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.0015);

export const isResource = (t: Thing): t is ResourceThing => t.type === 'resource';
export const isObject = (t: Thing): t is ObjectThing => t.type === 'object';

/** Walls, doors, zones and the like sit over other things, so they never count as being in the way. */
export const isFree = (t: Thing) => t.type === 'object' && mayOverlap(t.object);

export function sizeOfThing(t: Thing) {
  if (t.type === 'object') return { w: t.w ?? OBJECTS[t.object].w, d: t.d ?? OBJECTS[t.object].d };
  const def = defaultSize(t.kind, t.style, t.capacity);
  return { w: t.w ?? def.w, d: t.d ?? def.d };
}

export const boxOf = (t: Thing): Box => ({ x: t.x, z: t.z, rot: t.rot, ...sizeOfThing(t) });

/** The smallest and largest either side of a thing may be made. */
export function limitsOf(t: Thing) {
  if (t.type === 'object') {
    const def = OBJECTS[t.object];
    return { min: def.min ?? { w: MIN_SIDE, d: MIN_SIDE }, max: def.max ?? { w: MAX_SIDE, d: MAX_SIDE } };
  }
  return { min: { w: MIN_SIDE, d: MIN_SIDE }, max: { w: MAX_SIDE, d: MAX_SIDE } };
}

/** Whether a thing can be stretched. Desks, lockers and the like have a fixed size. */
export function isResizable(t: Thing) {
  if (t.type === 'object') return OBJECTS[t.object].resizable;
  const fixed = t.kind === 'hot_desk' || t.kind === 'dedicated_desk' || t.kind === 'storage';
  // The larger kinds of desk-like space (a day office, a team pod, a parking bay) can be stretched; a desk or a locker cannot.
  const large = (t.kind === 'hot_desk' && t.style === 'day_office') || (t.kind === 'dedicated_desk' && t.style === 'team_pod') || (t.kind === 'storage' && t.style === 'parking');
  return !fixed || large;
}

/** A thing as the 3D scene wants it. Everything is drawn quietly while editing, so only the shapes stand out. */
export function asSpaceItem(t: ResourceThing): SpaceItem {
  return {
    id: t.key,
    kind: t.kind,
    style: t.style,
    name: t.name,
    floor: t.floor,
    capacity: t.capacity,
    amenities: t.amenities,
    plan: { x: t.x, z: t.z, rot: t.rot, w: t.w, d: t.d },
    tone: 'idle',
    status: styleDef(t.kind, t.style).label,
    bookable: false,
  };
}

const asItem = (r: Resource): SpaceItem => ({
  id: r.id,
  kind: r.kind,
  style: r.style,
  name: r.name,
  floor: r.floor,
  capacity: r.capacity,
  amenities: r.amenities,
  plan: r.planX === null || r.planZ === null ? null : { x: r.planX, z: r.planZ, rot: r.planRot, w: r.planW, d: r.planD },
  tone: 'idle',
  status: '',
  bookable: false,
});

export const sceneItems = (d: Draft) => d.things.filter(isResource).map(asSpaceItem);

export const sceneObjects = (d: Draft): FloorObject[] =>
  d.things.filter(isObject).map((t) => ({ id: t.key, locationId: '', floor: t.floor, type: t.object, label: t.label, x: t.x, z: t.z, w: t.w, d: t.d, rot: t.rot, variant: t.variant ?? '', tint: t.tint ?? '' }));

export interface Start {
  draft: Draft;
  /** Each floor's coordinate origin, held still while editing so nothing slides under the pointer. */
  origins: Record<string, { x: number; z: number }>;
}

/**
 * Starts a session from what is stored. Everything, placed or not, gets a position now: spaces that were
 * never placed take the spot the automatic layout would give them, so saving fixes them in place.
 */
export function startDraft(resources: Resource[], objects: FloorObject[], floors: string[] = []): Start {
  const live = resources.filter((r) => r.status !== 'retired');
  const layouts = layoutFloors(live.map(asItem), objects, { floors });
  const things: Thing[] = [];
  const origins: Start['origins'] = {};
  const byId = new Map(live.map((r) => [r.id, r]));
  const objectById = new Map(objects.map((o) => [o.id, o]));

  for (const f of layouts) {
    origins[floorKey(f.floor)] = f.origin;
    for (const p of f.placed) {
      const r = byId.get(p.item.id)!;
      things.push({
        type: 'resource',
        key: r.id,
        id: r.id,
        kind: r.kind,
        style: styleKey(r.kind, r.style),
        name: r.name,
        floor: r.floor,
        capacity: r.capacity,
        hourlyRateCents: r.hourlyRateCents,
        dailyRateCents: r.dailyRateCents,
        amenities: r.amenities,
        x: round(p.x + f.origin.x),
        z: round(p.z + f.origin.z),
        rot: p.rot,
        w: r.planW,
        d: r.planD,
      });
    }
    for (const o of f.objects) {
      const stored = objectById.get(o.id)!;
      things.push({ type: 'object', key: o.id, id: o.id, object: o.type, label: o.label, floor: f.floor, x: round(o.x + f.origin.x), z: round(o.z + f.origin.z), rot: o.rot, w: stored.w, d: stored.d, variant: stored.variant ?? '', tint: stored.tint ?? '' });
    }
    // A floor that was never drawn has an automatic lift core; keep it as a real object once it is drawn.
    if (!f.planned && f.core) {
      things.push({ type: 'object', key: `new:core:${floorKey(f.floor)}`, id: null, object: 'core', label: '', floor: f.floor, x: round(f.core.x), z: round(f.core.z), rot: 0, w: round(f.core.w), d: round(f.core.d) });
    }
  }
  return { draft: { things, floors: layouts.map((f) => f.floor) }, origins };
}

export const floorsOf = (d: Draft) => [...new Set([...d.things.map((t) => t.floor), ...d.floors])];

// ---------------------------------------------------------------------------------------------
// Changes. Each returns a new draft.

function makeThing(entry: PaletteEntry, key: string, floor: string, x: number, z: number, rot: number, names: string[]): Thing {
  if (entry.type === 'object') return { type: 'object', key, id: null, object: entry.object, label: '', floor, x, z, rot, w: null, d: null, variant: '', tint: '' };
  const def = styleDef(entry.kind, entry.style);
  return {
    type: 'resource',
    key,
    id: null,
    kind: entry.kind,
    style: def.key,
    name: nextName(def.prefix, names),
    floor,
    capacity: def.capacity,
    hourlyRateCents: def.hourly ?? 0,
    dailyRateCents: def.daily ?? 0,
    amenities: '',
    x,
    z,
    rot,
    w: null,
    d: null,
  };
}

const namesOf = (d: Draft, taken: Iterable<string>) => [...taken, ...d.things.filter(isResource).map((t) => t.name)];

export function placeThing(d: Draft, entry: PaletteEntry, floor: string, x: number, z: number, rot: number, takenNames: Iterable<string>, serial: number): { draft: Draft; thing: Thing } {
  const thing = makeThing(entry, `new:${serial}`, floor, x, z, rot, namesOf(d, takenNames));
  return { draft: { ...d, things: [...d.things, thing] }, thing };
}

const mapThing = (d: Draft, key: string, f: (t: Thing) => Thing): Draft => ({ ...d, things: d.things.map((t) => (t.key === key ? f(t) : t)) });
const mapThings = (d: Draft, keys: readonly string[], f: (t: Thing) => Thing): Draft => ({ ...d, things: d.things.map((t) => (keys.includes(t.key) ? f(t) : t)) });

export const moveThing = (d: Draft, key: string, x: number, z: number) => mapThing(d, key, (t) => ({ ...t, x: round(x), z: round(z) }));
export const moveThings = (d: Draft, moves: { key: string; x: number; z: number }[]): Draft => {
  const at = new Map(moves.map((m) => [m.key, m]));
  return { ...d, things: d.things.map((t) => (at.has(t.key) ? { ...t, x: round(at.get(t.key)!.x), z: round(at.get(t.key)!.z) } : t)) };
};
export const rotateThing = (d: Draft, key: string) => mapThing(d, key, (t) => ({ ...t, rot: (t.rot + 1) % 4 }));
export const rotateThings = (d: Draft, keys: readonly string[]) => mapThings(d, keys, (t) => ({ ...t, rot: (t.rot + 1) % 4 }));
export const resizeThing = (d: Draft, key: string, w: number, z: number) => mapThing(d, key, (t) => ({ ...t, w: round(w), d: round(z) }));
export const removeThing = (d: Draft, key: string): Draft => ({ ...d, things: d.things.filter((t) => t.key !== key) });
export const removeThings = (d: Draft, keys: readonly string[]): Draft => ({ ...d, things: d.things.filter((t) => !keys.includes(t.key)) });

export function patchResource(d: Draft, key: string, patch: Partial<Pick<ResourceThing, 'name' | 'style' | 'capacity' | 'hourlyRateCents' | 'dailyRateCents' | 'amenities'>>): Draft {
  return mapThing(d, key, (t) => (t.type === 'resource' ? { ...t, ...patch } : t));
}

/** Changes an object's label, or its label, variant and colour together. */
export function patchObject(d: Draft, key: string, patch: string | Partial<Pick<ObjectThing, 'label' | 'variant' | 'tint'>>): Draft {
  const p = typeof patch === 'string' ? { label: patch } : patch;
  return mapThing(d, key, (t) => (t.type === 'object' ? { ...t, ...p } : t));
}

export const addFloor = (d: Draft, floor: string): Draft => (floorsOf(d).includes(floor) ? d : { ...d, floors: [...d.floors, floor] });

// ---------------------------------------------------------------------------------------------
// Fit

/**
 * Whether something of this size would sit clear of everything else on the floor, and inside the allowed area. A thing
 * that may overlap (a wall, a door, a zone) always fits, and never stands in the way of anything else.
 */
export function fits(d: Draft, floor: string, box: Box, ignore?: string | readonly string[], free = false) {
  if (Math.abs(box.x) > LIMIT || Math.abs(box.z) > LIMIT) return false;
  if (free) return true;
  const skip = typeof ignore === 'string' ? [ignore] : (ignore ?? []);
  return !d.things.some((t) => t.floor === floor && !skip.includes(t.key) && !isFree(t) && overlaps(box, boxOf(t)));
}

// ---------------------------------------------------------------------------------------------
// Groups: many at once, duplicates, templates

interface Part {
  thing: Thing;
  /** Position within the group, from its middle. */
  dx: number;
  dz: number;
}

/** The middle of the rectangle that holds all of these boxes. */
function centreOf(boxes: Box[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of boxes) {
    const f = footprint(b);
    minX = Math.min(minX, f.minX);
    maxX = Math.max(maxX, f.maxX);
    minZ = Math.min(minZ, f.minZ);
    maxZ = Math.max(maxZ, f.maxZ);
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

/** The nearest spot on the grid, searching outward from `near`, where the whole group fits clear of everything. */
export function findSpot(d: Draft, floor: string, parts: { box: Box; free: boolean }[], near: { x: number; z: number }, ignore: readonly string[] = []): { x: number; z: number } | null {
  const snap = (n: number) => Math.round(n / SNAP) * SNAP;
  const cx = snap(near.x);
  const cz = snap(near.z);
  const ok = (x: number, z: number) => parts.every((p) => fits(d, floor, { ...p.box, x: x + p.box.x, z: z + p.box.z }, ignore, p.free));
  if (ok(cx, cz)) return { x: cx, z: cz };
  for (let k = 1; k <= 160; k++) {
    for (let i = -k; i <= k; i++) {
      for (const [dx, dz] of [
        [i, -k],
        [i, k],
        [-k, i],
        [k, i],
      ] as const) {
        const x = cx + dx * SNAP;
        const z = cz + dz * SNAP;
        if (ok(x, z)) return { x, z };
      }
    }
  }
  return null;
}

const keep = (parts: Part[]) => parts.map((p) => ({ box: { ...boxOf(p.thing), x: p.dx, z: p.dz }, free: isFree(p.thing) }));

/** Drops the parts onto the draft with the group's middle at `at`, giving each a fresh key. */
function drop(d: Draft, parts: Part[], at: { x: number; z: number }, floor: string, serial: () => number, taken: Iterable<string> = []): { draft: Draft; keys: string[] } {
  const names = [...taken, ...d.things.filter(isResource).map((t) => t.name)];
  const made: Thing[] = parts.map((p) => {
    const key = `new:${serial()}`;
    const t: Thing = { ...p.thing, key, id: null, floor, x: round(at.x + p.dx), z: round(at.z + p.dz) };
    if (t.type === 'resource') {
      t.name = nextName(styleDef(t.kind, t.style).prefix, names);
      names.push(t.name);
    }
    return t;
  });
  return { draft: { ...d, things: [...d.things, ...made] }, keys: made.map((t) => t.key) };
}

/** Copies of these things, placed at the nearest free spot to where they are now, shifted by about a metre. */
export function duplicateThings(d: Draft, keys: readonly string[], serial: () => number, floor?: string): { draft: Draft; keys: string[]; at: { x: number; z: number } } | null {
  const src = d.things.filter((t) => keys.includes(t.key));
  if (!src.length) return null;
  const middle = centreOf(src.map(boxOf));
  const parts: Part[] = src.map((t) => ({ thing: t, dx: round(t.x - middle.x), dz: round(t.z - middle.z) }));
  const onFloor = floor ?? src[0]!.floor;
  const at = findSpot(d, onFloor, keep(parts), { x: middle.x + 1, z: middle.z + 1 });
  if (!at) return null;
  return { ...drop(d, parts, at, onFloor, serial), at };
}

/** A saved arrangement of these things, positioned from their middle, ready to be stored or pasted. */
export function toTemplate(d: Draft, keys: readonly string[]): TemplateThing[] {
  const src = d.things.filter((t) => keys.includes(t.key));
  if (!src.length) return [];
  const m = centreOf(src.map(boxOf));
  return src.map((t) =>
    t.type === 'resource'
      ? { type: 'resource', kind: t.kind, style: t.style, name: t.name, capacity: t.capacity, hourlyRateCents: t.hourlyRateCents, dailyRateCents: t.dailyRateCents, amenities: t.amenities, x: round(t.x - m.x), z: round(t.z - m.z), rot: t.rot, w: t.w, d: t.d }
      : { type: 'object', object: t.object, label: t.label, variant: t.variant ?? '', tint: t.tint ?? '', x: round(t.x - m.x), z: round(t.z - m.z), rot: t.rot, w: t.w, d: t.d },
  );
}

/** Puts a saved arrangement on a floor at the nearest free spot to `near`. Names carry on from the ones already used. */
export function applyTemplate(d: Draft, things: readonly TemplateThing[], floor: string, near: { x: number; z: number }, takenNames: Iterable<string>, serial: () => number): { draft: Draft; keys: string[] } | null {
  const parts: Part[] = things.map((t) => ({
    dx: t.x,
    dz: t.z,
    thing:
      t.type === 'resource'
        ? { type: 'resource', key: '', id: null, kind: t.kind, style: styleKey(t.kind, t.style), name: t.name, floor, capacity: t.capacity, hourlyRateCents: t.hourlyRateCents, dailyRateCents: t.dailyRateCents, amenities: t.amenities, x: 0, z: 0, rot: t.rot, w: t.w, d: t.d }
        : { type: 'object', key: '', id: null, object: t.object, label: t.label, floor, x: 0, z: 0, rot: t.rot, w: t.w, d: t.d, variant: t.variant, tint: t.tint },
  }));
  const at = findSpot(d, floor, keep(parts), near);
  if (!at) return null;
  return drop(d, parts, at, floor, serial, takenNames);
}

export interface GridOptions {
  cols: number;
  rows: number;
  /** Space left between neighbours, metres. */
  gap: number;
  rot: number;
  /** Four desks backed together in two rows, the way an open-plan floor lays them out. Ignores columns, rows and turn. */
  pod?: boolean;
}

/** A block of the same thing in a grid, placed at the nearest free spot to `near`. For ten desks in a row, or a bank of lockers. */
export function placeGrid(d: Draft, entry: PaletteEntry, floor: string, o: GridOptions, near: { x: number; z: number }, takenNames: Iterable<string>, serial: () => number): { draft: Draft; keys: string[] } | null {
  const proto = makeThing(entry, '', floor, 0, 0, o.rot, []);
  const one = sizeOfThing(proto);
  const turned = o.rot % 2 === 1;
  const sw = turned ? one.d : one.w;
  const sd = turned ? one.w : one.d;
  const parts: Part[] = [];
  if (o.pod) {
    for (let k = 0; k < 4; k++) {
      const back = k < 2;
      parts.push({ thing: { ...proto, rot: back ? 2 : 0 }, dx: (k % 2 === 0 ? -1 : 1) * (one.w / 2 + o.gap / 2), dz: (back ? -1 : 1) * (one.d / 2 + o.gap / 2) });
    }
  } else {
    for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) parts.push({ thing: proto, dx: (c - (o.cols - 1) / 2) * (sw + o.gap), dz: (r - (o.rows - 1) / 2) * (sd + o.gap) });
  }
  const at = findSpot(d, floor, keep(parts), near);
  if (!at) return null;
  return drop(d, parts, at, floor, serial, takenNames);
}

export type AlignMode = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom' | 'spread-x' | 'spread-z';

/** Lines things up on one edge or centre, or spreads them evenly between the first and last. */
export function alignThings(d: Draft, keys: readonly string[], mode: AlignMode): Draft {
  const group = d.things.filter((t) => keys.includes(t.key));
  if (group.length < 2) return d;
  const fp = new Map(group.map((t) => [t.key, footprint(boxOf(t))]));
  const all = [...fp.values()];
  const next = new Map<string, { x: number; z: number }>();

  if (mode === 'spread-x' || mode === 'spread-z') {
    const horizontal = mode === 'spread-x';
    const sorted = [...group].sort((a, b) => (horizontal ? a.x - b.x : a.z - b.z));
    const first = horizontal ? sorted[0]!.x : sorted[0]!.z;
    const last = horizontal ? sorted.at(-1)!.x : sorted.at(-1)!.z;
    sorted.forEach((t, i) => {
      const v = first + ((last - first) * i) / (sorted.length - 1);
      next.set(t.key, horizontal ? { x: v, z: t.z } : { x: t.x, z: v });
    });
  } else {
    const minX = Math.min(...all.map((f) => f.minX));
    const maxX = Math.max(...all.map((f) => f.maxX));
    const minZ = Math.min(...all.map((f) => f.minZ));
    const maxZ = Math.max(...all.map((f) => f.maxZ));
    for (const t of group) {
      const f = fp.get(t.key)!;
      const hw = (f.maxX - f.minX) / 2;
      const hd = (f.maxZ - f.minZ) / 2;
      if (mode === 'left') next.set(t.key, { x: minX + hw, z: t.z });
      else if (mode === 'right') next.set(t.key, { x: maxX - hw, z: t.z });
      else if (mode === 'centre') next.set(t.key, { x: (minX + maxX) / 2, z: t.z });
      else if (mode === 'top') next.set(t.key, { x: t.x, z: minZ + hd });
      else if (mode === 'bottom') next.set(t.key, { x: t.x, z: maxZ - hd });
      else next.set(t.key, { x: t.x, z: (minZ + maxZ) / 2 });
    }
  }
  return moveThings(d, [...next].map(([key, p]) => ({ key, ...p })));
}

/** Whether any two things that cannot overlap do, on one floor. Used to refuse an alignment that would pile things up. */
export function anyCollision(d: Draft, floor: string) {
  const solid = d.things.filter((t) => t.floor === floor && !isFree(t));
  return solid.some((a, i) => solid.slice(i + 1).some((b) => overlaps(boxOf(a), boxOf(b))));
}

// ---------------------------------------------------------------------------------------------
// Saving

export interface Changes {
  added: number;
  changed: number;
  removed: number;
}

export interface SaveBody {
  locationId: string;
  /** Floors with nothing on them yet, so they are kept. */
  floors?: string[];
  update: { id: string; plan: { x: number; z: number; rot: number; w: number | null; d: number | null }; props?: Record<string, string | number> }[];
  create: {
    kind: ResourceKind;
    style: string;
    name: string;
    floor: string;
    capacity: number;
    hourlyRateCents: number;
    dailyRateCents: number;
    amenities: string;
    plan: { x: number; z: number; rot: number; w: number | null; d: number | null };
  }[];
  retire: string[];
  objects: {
    upsert: { id?: string; type: FloorObjectType; floor: string; label: string; variant: ObjectVariant; tint: ObjectTint; x: number; z: number; rot: number; w: number | null; d: number | null }[];
    remove: string[];
  };
}

/** The one request that turns what is stored into what the draft shows, and how much that is. */
export function buildSave(locationId: string, draft: Draft, resources: Resource[], objects: FloorObject[]): { body: SaveBody; changes: Changes } {
  const body: SaveBody = { locationId, update: [], create: [], retire: [], objects: { upsert: [], remove: [] } };
  const changes: Changes = { added: 0, changed: 0, removed: 0 };
  const live = new Map(resources.filter((r) => r.status !== 'retired').map((r) => [r.id, r]));
  const storedObjects = new Map(objects.map((o) => [o.id, o]));
  const here = new Set(draft.things.map((t) => t.id).filter((id): id is string => !!id));

  for (const t of draft.things) {
    if (t.type === 'resource') {
      const plan = { x: t.x, z: t.z, rot: t.rot, w: t.w, d: t.d };
      if (!t.id) {
        body.create.push({ kind: t.kind, style: t.style, name: t.name, floor: t.floor, capacity: t.capacity, hourlyRateCents: t.hourlyRateCents, dailyRateCents: t.dailyRateCents, amenities: t.amenities, plan });
        changes.added++;
        continue;
      }
      const r = live.get(t.id)!;
      const props: Record<string, string | number> = {};
      if (t.name !== r.name) props.name = t.name;
      if (t.style !== styleKey(r.kind, r.style)) props.style = t.style;
      if (t.capacity !== r.capacity) props.capacity = t.capacity;
      if (t.hourlyRateCents !== r.hourlyRateCents) props.hourlyRateCents = t.hourlyRateCents;
      if (t.dailyRateCents !== r.dailyRateCents) props.dailyRateCents = t.dailyRateCents;
      if (t.amenities !== r.amenities) props.amenities = t.amenities;
      const moved = !same(r.planX, t.x) || !same(r.planZ, t.z) || r.planRot !== t.rot || !same(r.planW, t.w) || !same(r.planD, t.d);
      // Spaces that were never placed get a position saved even when nothing else changed.
      if (moved || Object.keys(props).length) {
        body.update.push({ id: t.id, plan, ...(Object.keys(props).length ? { props } : {}) });
        if (r.planX !== null && (moved || Object.keys(props).length)) changes.changed++;
      }
    } else {
      const o = { type: t.object, floor: t.floor, label: t.label, variant: t.variant ?? '', tint: t.tint ?? '', x: t.x, z: t.z, rot: t.rot, w: t.w, d: t.d };
      if (!t.id) {
        body.objects.upsert.push(o);
        changes.added++;
        continue;
      }
      const s = storedObjects.get(t.id)!;
      if (!same(s.x, t.x) || !same(s.z, t.z) || s.rot !== t.rot || !same(s.w, t.w) || !same(s.d, t.d) || s.label !== t.label || (s.variant ?? '') !== o.variant || (s.tint ?? '') !== o.tint) {
        body.objects.upsert.push({ id: t.id, ...o });
        changes.changed++;
      }
    }
  }
  for (const id of live.keys()) {
    if (!here.has(id)) {
      body.retire.push(id);
      changes.removed++;
    }
  }
  for (const id of storedObjects.keys()) {
    if (!here.has(id)) {
      body.objects.remove.push(id);
      changes.removed++;
    }
  }
  const bare = draft.floors.filter((f) => f && !draft.things.some((t) => t.floor === f));
  if (bare.length) body.floors = bare;
  return { body, changes };
}

/** What stops the draft being saved, in words. Names must be filled in and used once, retired spaces included. */
export function problems(draft: Draft, resources: Resource[]): string[] {
  const out: string[] = [];
  const names = new Map<string, number>();
  for (const t of draft.things.filter(isResource)) {
    const name = t.name.trim();
    if (!name) out.push('Every room and desk needs a name.');
    names.set(name.toLowerCase(), (names.get(name.toLowerCase()) ?? 0) + 1);
  }
  const retired = new Set(resources.filter((r) => r.status === 'retired').map((r) => r.name.toLowerCase()));
  for (const [lower, n] of names) {
    const shown = draft.things.filter(isResource).find((t) => t.name.trim().toLowerCase() === lower)?.name.trim() ?? lower;
    if (lower && n > 1) out.push(`"${shown}" is used more than once.`);
    else if (lower && retired.has(lower)) out.push(`"${shown}" is the name of a space that was removed earlier. Choose another name.`);
  }
  return [...new Set(out)];
}
