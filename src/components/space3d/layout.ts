import { defaultSize, OBJECTS, tagOf } from '../../lib/catalogue';
import type { SpaceItem } from '../../lib/spaceState';
import type { FloorObject, FloorObjectType, ObjectTint, ObjectVariant } from '../../types';

/**
 * Scene units are metres. Everything here is deterministic so the model never jumps around between renders.
 *
 * A floor with a drawn plan uses the stored position of everything on it. A space that has not been placed
 * yet, and a floor that was never drawn, are arranged automatically like a real floor: a service core and
 * the rooms in a band along the back wall with shared partitions, then open-plan desks in pods of four.
 */

export interface Placed {
  item: SpaceItem;
  /** Centre of the footprint, in scene units (relative to the middle of the floor's origin). */
  x: number;
  z: number;
  /** Footprint before turning. */
  w: number;
  d: number;
  /** Quarter turns. 0 faces the viewer (a room's door, a desk's chair); 2 faces away. */
  rot: number;
  /** Staggers neighbouring room tags so they do not cover each other. */
  tier: 0 | 1;
}

/** A kitchen, coffee machine and the like. */
export interface PlacedObject {
  id: string;
  type: FloorObjectType;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  variant: ObjectVariant;
  tint: ObjectTint;
}

export interface Zone {
  kind: 'open' | 'reserved';
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Core {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface FloorLayout {
  floor: string;
  label: string;
  /** Position in the stack, 0 at the bottom. */
  index: number;
  /** Size of the floor plate, including the margin around everything on it. */
  width: number;
  depth: number;
  /** Where the middle of the plate is. */
  cx: number;
  cz: number;
  /** Add this to a scene position to get the plan's own coordinates, which is what gets stored. */
  origin: { x: number; z: number };
  /** Automatic floors only. */
  zones: Zone[];
  core: Core | null;
  placed: Placed[];
  objects: PlacedObject[];
  /** Whether anything on this floor has a stored position. */
  planned: boolean;
}

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
}

/** The area something covers on the floor, after turning. */
export function footprint(b: Box) {
  const [w, d] = b.rot % 2 ? [b.d, b.w] : [b.w, b.d];
  return { minX: b.x - w / 2, maxX: b.x + w / 2, minZ: b.z - d / 2, maxZ: b.z + d / 2 };
}

/** Whether two things overlap. Sitting edge to edge does not count. */
export function overlaps(a: Box, b: Box, gap = 0) {
  const p = footprint(a);
  const q = footprint(b);
  return p.minX < q.maxX - 1e-6 + gap && p.maxX > q.minX + 1e-6 - gap && p.minZ < q.maxZ - 1e-6 + gap && p.maxZ > q.minZ + 1e-6 - gap;
}

export const WALL_HEIGHT = { room: 1.7, corporate: 1.85, office: 2.05 };
export const CORE_HEIGHT = 2.15;

const MARGIN = 1.4;
const MIN_PLATE = { w: 12, d: 9 };
const WALL_GAP = 0.14;
const AISLE = 2.1;
const ROW_MAX = 25;
const POD_GAP = { x: 1.5, z: 1.7 };
const ZONE_PAD = 0.55;
const CORE = OBJECTS.core;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const collator = new Intl.Collator('en', { numeric: true });
/** Lowest floor first: the unnamed ground floor, or one named "Ground ...", then the rest in natural order. */
export const compareFloors = (a: string, b: string) => {
  const key = (f: string) => (!f || /^ground/i.test(f) ? '0' : f);
  return collator.compare(key(a), key(b));
};
const sortItems = (xs: SpaceItem[]) => [...xs].sort((a, b) => collator.compare(a.name, b.name));

export const floorKey = (floor: string) => floor || 'ground';

export function floorLabel(floor: string) {
  // A number or short code reads as "Floor 4"; a name the owner gave, like "Ground Floor", stands as it is.
  return !floor ? 'Ground floor' : floor.length <= 3 ? `Floor ${floor}` : floor;
}

/** What goes on a lift button: the floor number, or G for the ground floor. */
export function floorMark(floor: string) {
  if (!floor) return 'G';
  if (floor.length <= 3) return floor;
  const words = floor.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : floor).slice(0, 3).toUpperCase();
}

export function wallHeight(kind: SpaceItem['kind']) {
  return kind === 'office' ? WALL_HEIGHT.office : kind === 'corporate_room' ? WALL_HEIGHT.corporate : WALL_HEIGHT.room;
}

/** How big something is: what the owner stretched it to, or the default for its style and seats. */
export const sizeOf = (i: SpaceItem) => ({ w: i.plan?.w ?? defaultSize(i.kind, i.style, i.capacity).w, d: i.plan?.d ?? defaultSize(i.kind, i.style, i.capacity).d });

const isDesk = (i: SpaceItem) => i.kind === 'hot_desk' || i.kind === 'dedicated_desk' || i.kind === 'storage';

interface Block {
  placed: Placed[];
  width: number;
  depth: number;
  core?: Core;
}

/** Rooms and offices side by side with shared partitions, wrapped into rows. Every row is as deep as its deepest room. */
function packBand(items: SpaceItem[], withCore: boolean): Block {
  type Box = { item?: SpaceItem; w: number; d: number };
  const boxes: Box[] = withCore ? [{ w: CORE.w, d: 0 }] : [];
  for (const item of items) boxes.push({ item, ...sizeOf(item) });

  const rows: Box[][] = [[]];
  let x = 0;
  for (const b of boxes) {
    if (rows[rows.length - 1]!.length && x + b.w > ROW_MAX) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1]!.push(b);
    x += b.w + WALL_GAP;
  }

  const placed: Placed[] = [];
  let core: Core | undefined;
  let z = 0;
  let width = 0;
  rows.forEach((row, r) => {
    const depth = Math.max(...row.map((b) => b.d), 2.9);
    let cx = 0;
    row.forEach((b, i) => {
      if (!b.item) {
        core = { x: cx + b.w / 2, z: z + depth / 2, w: b.w, d: depth };
      } else {
        placed.push({ item: b.item, x: cx + b.w / 2, z: z + depth / 2, w: b.w, d: depth, rot: 0, tier: (i % 2) as 0 | 1 });
      }
      cx += b.w + WALL_GAP;
    });
    width = Math.max(width, cx - WALL_GAP);
    z += depth + (r < rows.length - 1 ? AISLE : 0);
  });
  return { placed, width, depth: z, core };
}

/** Desks in pods of four: two facing each way, backs together, like a real open-plan bench. */
function packPods(items: SpaceItem[]): Block {
  const sizes = items.map(sizeOf);
  const slot = { w: Math.max(1.7, ...sizes.map((z) => z.w + 0.12)), d: Math.max(1.55, ...sizes.map((z) => z.d + 0.06)) };
  const podW = slot.w * 2 + 0.1;
  const podD = slot.d * 2 + 0.1;
  const pods = Math.ceil(items.length / 4);
  const cols = clamp(Math.ceil(Math.sqrt(pods * 1.7)), 1, 5);
  const placed: Placed[] = [];
  let width = 0;
  let depth = 0;
  items.forEach((item, i) => {
    const pod = Math.floor(i / 4);
    const k = i % 4;
    const ox = (pod % cols) * (podW + POD_GAP.x);
    const oz = Math.floor(pod / cols) * (podD + POD_GAP.z);
    const back = k < 2;
    const x = ox + slot.w / 2 + (k % 2) * (slot.w + 0.1);
    const z = oz + (back ? slot.d / 2 : slot.d + 0.1 + slot.d / 2);
    placed.push({ item, x, z, ...sizes[i]!, rot: back ? 2 : 0, tier: 0 });
    width = Math.max(width, x + slot.w / 2);
    depth = Math.max(depth, z + slot.d / 2);
  });
  return { placed, width, depth };
}

interface Arranged {
  placed: Placed[];
  zones: Zone[];
  core: Core | null;
  /** Size of what was arranged, without margins. */
  width: number;
  depth: number;
}

/** The automatic floor. Everything is centred on the middle of the arrangement. */
function arrange(here: SpaceItem[], withCore: boolean): Arranged {
  const band = sortItems(here.filter((i) => !isDesk(i) && i.kind !== 'office' && i.kind !== 'corporate_room'));
  const rooms = [...band, ...sortItems(here.filter((i) => i.kind === 'corporate_room')), ...sortItems(here.filter((i) => i.kind === 'office'))];
  const hot = sortItems(here.filter((i) => i.kind === 'hot_desk'));
  const dedicated = sortItems(here.filter((i) => i.kind === 'dedicated_desk' || i.kind === 'storage'));

  const stack: { block: Block; zone?: Zone['kind'] }[] = [];
  if (rooms.length || (withCore && here.length)) stack.push({ block: packBand(rooms, withCore) });
  if (hot.length) stack.push({ block: packPods(hot), zone: 'open' });
  if (dedicated.length) stack.push({ block: packPods(dedicated), zone: 'reserved' });

  const pad = (s: { zone?: Zone['kind'] }) => (s.zone ? ZONE_PAD : 0);
  const inner = Math.max(6, ...stack.map((s) => s.block.width + pad(s) * 2));
  let z = 0;
  const placed: Placed[] = [];
  const zones: Zone[] = [];
  let core: Core | null = null;

  for (const s of stack) {
    const p = pad(s);
    const dx = (inner - s.block.width) / 2;
    const dz = z + p;
    for (const pl of s.block.placed) placed.push({ ...pl, x: pl.x + dx, z: pl.z + dz });
    if (s.block.core) core = { ...s.block.core, x: s.block.core.x + dx, z: s.block.core.z + dz };
    if (s.zone) zones.push({ kind: s.zone, x: dx - p, z, w: s.block.width + p * 2, d: s.block.depth + p * 2 });
    z += s.block.depth + p * 2 + AISLE;
  }
  const innerD = Math.max(4, z - AISLE);
  const ox = -inner / 2;
  const oz = -innerD / 2;
  return {
    width: inner,
    depth: innerD,
    zones: zones.map((zn) => ({ ...zn, x: zn.x + ox + zn.w / 2, z: zn.z + oz + zn.d / 2 })),
    core: core && { ...core, x: core.x + ox, z: core.z + oz },
    placed: placed.map((p) => ({ ...p, x: p.x + ox, z: p.z + oz })),
  };
}

const sizeOfObject = (o: FloorObject) => ({ w: o.w ?? OBJECTS[o.type].w, d: o.d ?? OBJECTS[o.type].d });
const snapHalf = (n: number) => Math.round(n * 2) / 2;

export interface LayoutOptions {
  /** Hold a floor's coordinate origin still, so nothing slides under the pointer while editing. */
  origins?: Record<string, { x: number; z: number }>;
  /** Extra floor all round, for room to build into. */
  pad?: number;
  /** Floors that exist even though nothing is on them yet, such as one just added in the editor. */
  floors?: string[];
  /** Ground the plate must also cover, in the plan's own coordinates, such as a floor plan picture drawn under the floor. */
  reach?: Record<string, { x: number; z: number; w: number; d: number }>;
}

export function layoutFloors(items: SpaceItem[], objects: FloorObject[] = [], options: LayoutOptions = {}): FloorLayout[] {
  const floors = [...new Set([...items.map((i) => i.floor), ...objects.map((o) => o.floor), ...(options.floors ?? [])])].sort(compareFloors);

  return floors.map((floor, index) => {
    const key = floorKey(floor);
    const here = items.filter((i) => i.floor === floor);
    const objs = objects.filter((o) => o.floor === floor);
    const stored = here.filter((i) => i.plan);
    const planned = stored.length > 0 || objs.length > 0 || (options.floors ?? []).includes(floor);

    if (!planned) {
      const auto = arrange(here, true);
      return {
        floor,
        label: floorLabel(floor),
        index,
        width: auto.width + MARGIN * 2,
        depth: auto.depth + MARGIN * 2,
        cx: 0,
        cz: 0,
        origin: { x: 0, z: 0 },
        zones: auto.zones,
        core: auto.core,
        placed: auto.placed,
        objects: [],
        planned: false,
      };
    }

    // Stored positions are used as they are; anything not yet placed is arranged in a block beneath.
    const placed: Placed[] = stored.map((i) => ({ item: i, x: i.plan!.x, z: i.plan!.z, ...sizeOf(i), rot: i.plan!.rot, tier: 0 }));
    const placedObjects: PlacedObject[] = objs.map((o) => ({ id: o.id, type: o.type, label: o.label, x: o.x, z: o.z, ...sizeOfObject(o), rot: o.rot, variant: o.variant ?? '', tint: o.tint ?? '' }));

    const extent = () => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const b of [...placed, ...placedObjects]) {
        const f = footprint(b);
        minX = Math.min(minX, f.minX);
        maxX = Math.max(maxX, f.maxX);
        minZ = Math.min(minZ, f.minZ);
        maxZ = Math.max(maxZ, f.maxZ);
      }
      return placed.length + placedObjects.length ? { minX, maxX, minZ, maxZ } : { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
    };

    const loose = here.filter((i) => !i.plan);
    if (loose.length) {
      const at = extent();
      const auto = arrange(loose, false);
      const dx = at.minX + auto.width / 2;
      const dz = at.maxZ + AISLE + auto.depth / 2;
      for (const p of auto.placed) placed.push({ ...p, x: p.x + dx, z: p.z + dz });
    }

    const at = extent();
    const pad = options.pad ?? 0;
    const origin = options.origins?.[key] ?? { x: snapHalf((at.minX + at.maxX) / 2), z: snapHalf((at.minZ + at.maxZ) / 2) };
    const under = options.reach?.[key];
    const minX = Math.min(at.minX - pad, under ? under.x : Infinity);
    const maxX = Math.max(at.maxX + pad, under ? under.x + under.w : -Infinity);
    const minZ = Math.min(at.minZ - pad, under ? under.z : Infinity);
    const maxZ = Math.max(at.maxZ + pad, under ? under.z + under.d : -Infinity);
    const shift = <T extends { x: number; z: number }>(b: T): T => ({ ...b, x: b.x - origin.x, z: b.z - origin.z });
    const width = Math.max(maxX - minX + MARGIN * 2, MIN_PLATE.w);
    const depth = Math.max(maxZ - minZ + MARGIN * 2, MIN_PLATE.d);
    return {
      floor,
      label: floorLabel(floor),
      index,
      width,
      depth,
      cx: (minX + maxX) / 2 - origin.x,
      cz: (minZ + maxZ) / 2 - origin.z,
      origin,
      zones: [],
      core: null,
      placed: placed.map(shift),
      objects: placedObjects.map(shift),
      planned: true,
    };
  });
}

export type FloorMode = 'full' | 'plinth' | 'away';

export interface StackSlot {
  floor: FloorLayout;
  /** Height the plate sits at. */
  y: number;
  /** Fully furnished, a bare slab under the floor in focus, or lifted out of the way. */
  mode: FloorMode;
}

export interface StackPlan {
  slots: StackSlot[];
  /** Every floor on show, exploded one above the other. */
  building: boolean;
  bounds: { cx: number; cy: number; cz: number; radius: number; groundY: number };
}

export const FLOOR_PITCH = 7.6;
const PLINTH_PITCH = 0.62;
const LIFT_AWAY = 12;

/**
 * Where each floor sits. With a focus floor, the floors above lift away and the ones below shrink to a
 * plinth, like a cutaway model. With no focus, every floor is shown exploded in a stack.
 */
export function stackPlan(floors: FloorLayout[], focus: string | null): StackPlan {
  const at = focus === null ? -1 : floors.findIndex((f) => f.floor === focus);
  const building = floors.length > 1 && at < 0;
  const slots: StackSlot[] = floors.map((floor, i) => {
    if (building) return { floor, y: i * FLOOR_PITCH, mode: 'full' };
    if (floors.length <= 1 || at < 0) return { floor, y: 0, mode: 'full' };
    if (i < at) return { floor, y: -(at - i) * PLINTH_PITCH, mode: 'plinth' };
    if (i === at) return { floor, y: 0, mode: 'full' };
    return { floor, y: LIFT_AWAY + (i - at) * 2, mode: 'away' };
  });

  const shown = slots.filter((s) => s.mode !== 'away');
  const w = Math.max(8, ...shown.map((s) => s.floor.width));
  const d = Math.max(8, ...shown.map((s) => s.floor.depth));
  const yMin = Math.min(0, ...shown.map((s) => s.y)) - 0.45;
  const yMax = Math.max(0, ...shown.filter((s) => s.mode === 'full').map((s) => s.y)) + 2.6;
  const mid = (pick: (f: FloorLayout) => number) => (shown.length ? shown.reduce((sum, s) => sum + pick(s.floor), 0) / shown.length : 0);
  return {
    slots,
    building,
    bounds: { cx: mid((f) => f.cx), cy: (yMin + yMax) / 2, cz: mid((f) => f.cz), radius: Math.hypot(w, d, yMax - yMin) / 2, groundY: yMin - 0.9 },
  };
}

export interface LabelSpec {
  id: string;
  kind: 'room' | 'desk' | 'floor' | 'note';
  /** Which floor the label belongs to, so it moves with it and hides when the floor is away. */
  floorKey: string;
  /** Where the label hangs from, relative to the middle of its floor plate. */
  pos: [number, number, number];
  item?: SpaceItem;
  text?: string;
  tier: 0 | 1;
}

/** Where a note hangs: above the thing. Flat markings and thin wall pieces keep it low. */
const noteHeight = (type: FloorObjectType) => (['zone', 'label'].includes(type) ? 0.35 : ['extinguisher', 'first_aid'].includes(type) ? 1.7 : type === 'fire_exit' ? 2.7 : ['terrace', 'bike_rack', 'recreation', 'lounge'].includes(type) ? 1.4 : 2.2);

/** The viewer renders these as ordinary DOM and the scene keeps them pinned in place. */
export function labelSpecs(floors: FloorLayout[]): LabelSpec[] {
  const out: LabelSpec[] = [];
  for (const floor of floors) {
    const key = floorKey(floor.floor);
    out.push({ id: `floor:${key}`, kind: 'floor', floorKey: key, pos: [floor.cx - floor.width / 2 + 6.2, 0.1, floor.cz + floor.depth / 2 + 0.9], text: floor.label, tier: 0 });
    for (const p of floor.placed) {
      const desk = p.item.kind === 'hot_desk' || p.item.kind === 'dedicated_desk' || p.item.kind === 'storage';
      const top = desk ? 1.45 : wallHeight(p.item.kind) + 0.08;
      out.push({ id: p.item.id, kind: desk ? 'desk' : 'room', floorKey: key, pos: [p.x, top, p.z], item: p.item, tier: p.tier });
    }
    // Names on the plan for facilities, exits and anything the owner labelled, so people can find their way.
    for (const o of floor.objects) {
      const text = tagOf(o.type, o.label);
      if (text) out.push({ id: `note:${o.id}`, kind: 'note', floorKey: key, pos: [o.x, noteHeight(o.type), o.z], text, tier: 0 });
    }
  }
  return out;
}
