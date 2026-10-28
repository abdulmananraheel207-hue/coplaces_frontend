import { OBJECTS, defaultSize, nextName, styleDef } from '../../lib/catalogue';
import type { FloorObjectType, Frac, PlanReading } from '../../types';
import { LIMIT, SNAP, boxOf, isResource, type Draft, type ObjectThing, type ResourceThing, type Thing } from './editorModel';
import { overlaps, type Box } from './layout';

/**
 * Turns what the server read from a picture of a floor plan into things on the draft. The reading is in
 * fractions of the picture, so changing the scale or the floor never needs another read. Everything placed
 * here follows the editor's own rules: nothing overlaps, rooms sit on the half-metre grid, and what cannot
 * be placed is left out and counted rather than put somewhere wrong.
 */

export interface ImportOptions {
  floor: string;
  /** How wide the building's outline is in real life, in metres. */
  widthMetres: number;
  /** The picture's height divided by its width. */
  aspect: number;
  deskKind: 'hot_desk' | 'dedicated_desk';
  /** Remove what is on the floor first. Otherwise the plan goes beside it. */
  replace: boolean;
}

export interface ImportResult {
  draft: Draft;
  added: { rooms: number; desks: number; amenities: number };
  /** Things in the plan that had no room once everything else was down. */
  skipped: number;
  removed: number;
  /** Where the picture sits in the plan's own coordinates: its top left corner and size, in metres. */
  picture: { x: number; z: number; w: number; d: number };
  notes: string[];
}

/** The server takes this many new spaces and objects in one save. */
export const MAX_NEW_SPACES = 200;
export const MAX_NEW_OBJECTS = 300;

const snap = (n: number) => Math.round(n / SNAP) * SNAP;
const round = (n: number) => Math.round(n * 1000) / 1000;
const GAP = 0.02;
/** How much smaller than usual a desk may be drawn so that a plan's tighter rows still fit. */
const TIGHTEST = 0.85;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const MIN_ROOM = 1.5;
const MIN_OBJECT = 0.8;

/** How big the picture is in real life, from how wide the building is. */
export function pictureSize(reading: Pick<PlanReading, 'outline'>, widthMetres: number, aspect: number) {
  const w = widthMetres / Math.max(reading.outline.w, 0.01);
  return { w, d: w * aspect };
}

/** Every way of pulling a box's four edges in by up to two grid steps, smallest change first. */
const TRIMS = (() => {
  const steps = [0, SNAP, SNAP * 2];
  const all: [number, number, number, number][] = [];
  for (const a of steps) for (const b of steps) for (const c of steps) for (const d of steps) all.push([a, b, c, d]);
  return all.sort((p, q) => p[0] + p[1] + p[2] + p[3] - (q[0] + q[1] + q[2] + q[3]));
})();

/** Plain edges: left, right, top and bottom, in plan metres. */
interface Edges {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const asBox = (e: Edges): Box => ({ x: (e.minX + e.maxX) / 2, z: (e.minZ + e.maxZ) / 2, w: e.maxX - e.minX, d: e.maxZ - e.minZ, rot: 0 });
const inside = (b: Box) => Math.abs(b.x) <= LIMIT && Math.abs(b.z) <= LIMIT;

/** The unique version of a name, given the names already used at the location (case does not matter). "Room 1" becomes "Room 2", and "Pantry" becomes "Pantry 2". */
function unique(base: string, taken: Set<string>, max = 100) {
  if (!taken.has(base.slice(0, max).toLowerCase())) return base.slice(0, max);
  const numbered = /^(.*?)(\d{1,4})$/.exec(base);
  const stem = numbered ? numbered[1]! : `${base} `;
  for (let i = numbered ? Number(numbered[2]) + 1 : 2; ; i++) {
    const name = `${stem.slice(0, max - 6)}${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export function importPlan(draft: Draft, reading: PlanReading, opts: ImportOptions, takenNames: Iterable<string>, serial: () => number): ImportResult {
  const { w: W, d: D } = pictureSize(reading, opts.widthMetres, opts.aspect);
  const floor = opts.floor;

  const removing = opts.replace ? draft.things.filter((t) => t.floor === floor) : [];
  const kept = draft.things.filter((t) => !removing.includes(t));
  const there = kept.filter((t) => t.floor === floor);

  // Where the picture goes: with the building's middle at the floor's origin, or beside what is already there.
  const oMinX = reading.outline.x * W;
  const oMinZ = reading.outline.y * D;
  let offX = snap(-(oMinX + (reading.outline.w * W) / 2));
  let offZ = snap(-(oMinZ + (reading.outline.h * D) / 2));
  if (there.length) {
    const boxes = there.map(boxOf);
    const right = Math.max(...boxes.map((b) => b.x + (b.rot % 2 ? b.d : b.w) / 2));
    const top = Math.min(...boxes.map((b) => b.z - (b.rot % 2 ? b.w : b.d) / 2));
    offX = snap(right + 3 - oMinX);
    offZ = snap(top - oMinZ);
  }

  // Plan coordinates, before snapping.
  const edges = (f: Frac): Edges => ({ minX: f.x * W + offX, maxX: (f.x + f.w) * W + offX, minZ: f.y * D + offZ, maxZ: (f.y + f.h) * D + offZ });

  const solid: Box[] = there.map(boxOf);
  const free = (b: Box) => inside(b) && !solid.some((s) => overlaps(b, s));
  const names = new Set<string>([...takenNames, ...kept.filter(isResource).map((t) => t.name)].map((n) => n.toLowerCase()));
  const claim = (name: string) => {
    names.add(name.toLowerCase());
    return name;
  };

  let newSpaces = kept.filter((t) => isResource(t) && !t.id).length;
  let newObjects = kept.filter((t) => !isResource(t) && !t.id).length;
  const things: Thing[] = [];
  const added = { rooms: 0, desks: 0, amenities: 0 };
  let skipped = 0;
  let capped = 0;

  /** Snaps a box to the grid and, if it collides with something, pulls its edges in until it does not. */
  const settle = (e: Edges, min: number): Edges | null => {
    const s: Edges = { minX: snap(e.minX), maxX: snap(e.maxX), minZ: snap(e.minZ), maxZ: snap(e.maxZ) };
    if (s.maxX - s.minX < min) s.maxX = s.minX + min;
    if (s.maxZ - s.minZ < min) s.maxZ = s.minZ + min;
    for (const [l, r, t, b] of TRIMS) {
      const trial = { minX: s.minX + l, maxX: s.maxX - r, minZ: s.minZ + t, maxZ: s.maxZ - b };
      if (trial.maxX - trial.minX < min || trial.maxZ - trial.minZ < min) continue;
      if (free(asBox(trial))) return trial;
    }
    return null;
  };

  // --- rooms ---
  for (const r of reading.rooms) {
    if (newSpaces >= MAX_NEW_SPACES) {
      capped++;
      continue;
    }
    const fit = settle(edges(r.box), MIN_ROOM);
    if (!fit) {
      skipped++;
      continue;
    }
    const kind = r.kind;
    const def = styleDef(kind, r.style);
    const b = asBox(fit);
    solid.push(b);
    newSpaces++;
    added.rooms++;
    const thing: ResourceThing = {
      type: 'resource',
      key: `new:import:${serial()}`,
      id: null,
      kind,
      style: def.key,
      name: claim(r.label ? unique(r.label, names) : nextName(def.prefix, names)),
      floor,
      capacity: r.seats ?? def.capacity,
      hourlyRateCents: def.hourly ?? 0,
      dailyRateCents: def.daily ?? 0,
      amenities: '',
      x: round(b.x),
      z: round(b.z),
      rot: 0,
      w: round(b.w),
      d: round(b.d),
    };
    things.push(thing);
  }

  // --- amenities ---
  for (const a of reading.amenities) {
    if (newObjects >= MAX_NEW_OBJECTS) {
      capped++;
      continue;
    }
    const def = OBJECTS[a.type as FloorObjectType];
    let box: Box | null = null;
    if (!def.keepSize) {
      const fit = settle(edges(a.box), MIN_OBJECT);
      box = fit && asBox(fit);
    } else {
      // Small things keep their own size and may shift a little to find a clear spot.
      const e = edges(a.box);
      const cx = snap((e.minX + e.maxX) / 2);
      const cz = snap((e.minZ + e.maxZ) / 2);
      const nudges = [0, SNAP, -SNAP, SNAP * 2, -SNAP * 2];
      for (const dz of nudges) {
        for (const dx of nudges) {
          const trial: Box = { x: cx + dx, z: cz + dz, w: def.w, d: def.d, rot: 0 };
          if (!box && free(trial)) box = trial;
        }
      }
    }
    if (!box) {
      skipped++;
      continue;
    }
    solid.push(box);
    newObjects++;
    added.amenities++;
    const thing: ObjectThing = {
      type: 'object',
      key: `new:import:${serial()}`,
      id: null,
      object: a.type,
      label: a.label.slice(0, 60),
      floor,
      x: round(box.x),
      z: round(box.z),
      rot: 0,
      w: !def.keepSize ? round(box.w) : null,
      d: !def.keepSize ? round(box.d) : null,
    };
    things.push(thing);
  }

  // --- desks: each block is a grid of desks, laid out inside the block's box ---
  for (const block of reading.deskBlocks) {
    const def = styleDef(opts.deskKind, block.style);
    const size = defaultSize(opts.deskKind, def.key, 1);
    const turned = block.rot % 2 === 1;
    // The desk's footprint as it sits on the plan, after turning.
    const fw = turned ? size.d : size.w;
    const fd = turned ? size.w : size.d;
    const e = edges(block.box);
    const bw = e.maxX - e.minX;
    const bd = e.maxZ - e.minZ;

    /** Where each desk goes: the middle of its spot and how much smaller than usual it is drawn, or null when it does not fit. */
    const spots: { x: number; z: number }[] = [];
    let own: { w: number | null; d: number | null } = { w: null, d: null };
    if (block.members?.length) {
      // Desks that are not in a neat grid go where they were found, in reading order.
      const placed = [...block.members].sort((a, b) => a.y - b.y || a.x - b.x);
      for (const m of placed) spots.push({ x: round((m.x + m.w / 2) * W + offX), z: round((m.y + m.h / 2) * D + offZ) });
    } else {
      // Desks may sit a little tighter than their usual size, but never more across than that allows, so a bad count
      // cannot pile them on each other.
      const cols = Math.max(1, Math.min(block.columns, Math.floor(bw / (fw * TIGHTEST + GAP))));
      const rows = Math.max(1, Math.min(block.rows, Math.floor(bd / (fd * TIGHTEST + GAP))));
      if (cols < block.columns || rows < block.rows) skipped += block.columns * block.rows - cols * rows;
      const pw = bw / cols;
      const pd = bd / rows;
      const dw = clamp(pw - GAP, fw * TIGHTEST, fw);
      const dd = clamp(pd - GAP, fd * TIGHTEST, fd);
      // Stored in the desk's own frame, before turning.
      if (dw < fw - 1e-6 || dd < fd - 1e-6) own = { w: round(turned ? dd : dw), d: round(turned ? dw : dd) };
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) spots.push({ x: round(e.minX + (c + 0.5) * pw), z: round(e.minZ + (r + 0.5) * pd) });
    }

    for (const spot of spots) {
      if (newSpaces >= MAX_NEW_SPACES) {
        capped++;
        continue;
      }
      // A desk that overlaps its neighbour is tried a little smaller before it is given up on.
      let fit: { w: number | null; d: number | null } | null = null;
      for (const k of block.members?.length ? [1, 0.92, TIGHTEST] : [1]) {
        const mine = k === 1 ? own : { w: round(size.w * k), d: round(size.d * k) };
        const box: Box = { x: spot.x, z: spot.z, w: mine.w ?? size.w, d: mine.d ?? size.d, rot: block.rot };
        if (free(box)) {
          fit = mine;
          solid.push(box);
          break;
        }
      }
      if (!fit) {
        skipped++;
        continue;
      }
      newSpaces++;
      added.desks++;
      things.push({
        type: 'resource',
        key: `new:import:${serial()}`,
        id: null,
        kind: opts.deskKind,
        style: def.key,
        name: claim(nextName(def.prefix, names)),
        floor,
        capacity: 1,
        hourlyRateCents: 0,
        dailyRateCents: def.daily ?? 0,
        amenities: '',
        x: spot.x,
        z: spot.z,
        rot: block.rot,
        w: fit.w,
        d: fit.d,
      });
    }
  }

  const notes: string[] = [];
  if (skipped) notes.push(`${skipped} ${skipped === 1 ? 'thing' : 'things'} in the plan had no room left once the rest was down and ${skipped === 1 ? 'was' : 'were'} left out.`);
  if (capped)
    notes.push(`A floor plan can take ${MAX_NEW_SPACES} new rooms and desks in one save, so ${capped} more ${capped === 1 ? 'was' : 'were'} left out. Save, then import the rest.`);

  return {
    draft: { ...draft, things: [...kept, ...things], floors: draft.floors.includes(floor) ? draft.floors : [...draft.floors, floor] },
    added,
    skipped: skipped + capped,
    removed: removing.length,
    picture: { x: offX, z: offZ, w: W, d: D },
    notes,
  };
}
