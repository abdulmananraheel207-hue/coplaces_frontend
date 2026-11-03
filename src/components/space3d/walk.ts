import { isDeskKind, mayOverlap, styleKey } from '../../lib/catalogue';
import { footprint, type FloorLayout, type Placed } from './layout';

/** A spot on a floor, in the same units as the layout (metres, relative to the floor's origin). */
export interface Pt {
  x: number;
  z: number;
}

/** Where someone ends up for a space, and the point they walk to first. */
export interface Spot {
  /** Where they stop, before sitting. */
  approach: Pt;
  /** Where they sit or stand. */
  at: Pt;
  /** Which way they face there, in radians about the vertical axis (0 faces +z). */
  yaw: number;
  sit: boolean;
}

const CELL = 0.35;
const WALK_MARGIN = 0.12;

const turn = (p: { x: number; z: number; rot: number }, lx: number, lz: number): Pt => {
  const a = (p.rot * Math.PI) / 2;
  return { x: p.x + lx * Math.cos(a) + lz * Math.sin(a), z: p.z - lx * Math.sin(a) + lz * Math.cos(a) };
};

/**
 * Where a person goes in a space. A desk's chair is on its front (local +z) and faces the desk; a room's door is on its front too,
 * so people stop outside it and then step in. `n` is how many are already there, so a room's guests do not stand on each other.
 */
export function spotFor(p: Placed, n = 0): Spot {
  const a = (p.rot * Math.PI) / 2;
  if (isDeskKind(p.item.kind)) {
    const standing = styleKey(p.item.kind, p.item.style) === 'standing';
    const at = turn(p, 0, standing ? 0.4 : 0.38);
    return { approach: turn(p, 0, 1.15), at, yaw: a + Math.PI, sit: !standing };
  }
  const lx = ((n % 3) - 1) * Math.min(1.1, p.w / 4);
  const lz = -p.d / 2 + Math.min(1.4, p.d * 0.45) + Math.floor(n / 3) * 0.7;
  return { approach: turn(p, 0, p.d / 2 + 0.75), at: turn(p, lx, Math.min(lz, p.d / 2 - 0.6)), yaw: a + Math.PI, sit: false };
}

/** The doorway people come in by: the door drawn nearest the edge of the floor, else the middle of its front edge. Returns the point outside it. */
export function entranceOf(f: FloorLayout): { door: Pt; outside: Pt } {
  const half = { w: f.width / 2, d: f.depth / 2 };
  const edge = (o: Pt) => Math.min(half.w - Math.abs(o.x - f.cx), half.d - Math.abs(o.z - f.cz));
  const doors = f.objects.filter((o) => o.type === 'door').sort((a, b) => edge(a) - edge(b) || b.z - a.z);
  const d = doors[0];
  if (!d || edge(d) > 3) {
    const door = { x: f.cx, z: f.cz + half.d - 0.6 };
    return { door, outside: { x: door.x, z: door.z + 1.2 } };
  }
  // Out from the middle of the floor, along whichever side the door is nearest.
  const dx = d.x - f.cx;
  const dz = d.z - f.cz;
  const alongX = half.w - Math.abs(dx) < half.d - Math.abs(dz);
  const out = alongX ? { x: Math.sign(dx) * 1.2, z: 0 } : { x: 0, z: Math.sign(dz) * 1.2 };
  return { door: { x: d.x, z: d.z }, outside: { x: d.x + out.x, z: d.z + out.z } };
}

export interface Grid {
  minX: number;
  minZ: number;
  nx: number;
  nz: number;
  blocked: Uint8Array;
}

/** What people cannot walk through on a floor: the rooms and desks, and the walls, furniture and fittings drawn on it. Doors are gaps. */
export function gridOf(f: FloorLayout, exceptId?: string): Grid {
  const minX = f.cx - f.width / 2 - 2;
  const minZ = f.cz - f.depth / 2 - 2;
  const nx = Math.min(500, Math.ceil((f.width + 4) / CELL));
  const nz = Math.min(500, Math.ceil((f.depth + 4) / CELL));
  const blocked = new Uint8Array(nx * nz);
  const paint = (box: { x: number; z: number; w: number; d: number; rot: number }, value: 0 | 1, grow: number) => {
    const b = footprint(box);
    const x0 = Math.max(0, Math.floor((b.minX - grow - minX) / CELL));
    const x1 = Math.min(nx - 1, Math.floor((b.maxX + grow - minX) / CELL));
    const z0 = Math.max(0, Math.floor((b.minZ - grow - minZ) / CELL));
    const z1 = Math.min(nz - 1, Math.floor((b.maxZ + grow - minZ) / CELL));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blocked[z * nx + x] = value;
  };
  for (const p of f.placed) if (p.item.id !== exceptId) paint(p, 1, -WALK_MARGIN);
  for (const o of f.objects) if (!mayOverlap(o.type)) paint(o, 1, -WALK_MARGIN);
  for (const o of f.objects) if (o.type === 'door') paint({ ...o, w: Math.max(o.w, 1.1), d: Math.max(o.d, 1.1) }, 0, 0.35);
  return { minX, minZ, nx, nz, blocked };
}

const cellOf = (g: Grid, p: Pt) => ({ x: Math.min(g.nx - 1, Math.max(0, Math.floor((p.x - g.minX) / CELL))), z: Math.min(g.nz - 1, Math.max(0, Math.floor((p.z - g.minZ) / CELL))) });
const centre = (g: Grid, x: number, z: number): Pt => ({ x: g.minX + (x + 0.5) * CELL, z: g.minZ + (z + 0.5) * CELL });

/** Whether a straight walk between two points crosses nothing. */
function clear(g: Grid, a: Pt, b: Pt) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
  for (let i = 1; i < steps; i++) {
    const c = cellOf(g, { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps });
    if (g.blocked[c.z * g.nx + c.x]) return false;
  }
  return true;
}

/**
 * The way from one point to another around whatever is in the way: A* over the grid, then pulled straight where it can be.
 * When there is no way through (a plan drawn without gaps) the walk is a straight line, so people still arrive.
 */
export function findPath(g: Grid, from: Pt, to: Pt): Pt[] {
  const s = cellOf(g, from);
  const t = cellOf(g, to);
  // Starting and finishing spots are allowed to sit against furniture.
  const open = (c: { x: number; z: number }) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (x >= 0 && z >= 0 && x < g.nx && z < g.nz) g.blocked[z * g.nx + x] = 0;
    }
  };
  open(s);
  open(t);
  if (clear(g, from, to)) return [to];

  const idx = (c: { x: number; z: number }) => c.z * g.nx + c.x;
  const cost = new Float32Array(g.nx * g.nz).fill(Infinity);
  const prev = new Int32Array(g.nx * g.nz).fill(-1);
  const heap: [number, number][] = [];
  cost[idx(s)] = 0;
  const h = (x: number, z: number) => Math.hypot(x - t.x, z - t.z);
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0 && heap[(i - 1) >> 1]![0] > heap[i]![0]) {
      [heap[i], heap[(i - 1) >> 1]] = [heap[(i - 1) >> 1]!, heap[i]!];
      i = (i - 1) >> 1;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };
  push([h(s.x, s.z), idx(s)]);

  let found = false;
  while (heap.length) {
    const [, cur] = pop();
    const cx = cur % g.nx;
    const cz = (cur - cx) / g.nx;
    if (cx === t.x && cz === t.z) {
      found = true;
      break;
    }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= g.nx || z >= g.nz || g.blocked[z * g.nx + x]) continue;
        // No cutting a corner of something solid.
        if (dx && dz && (g.blocked[cz * g.nx + x] || g.blocked[z * g.nx + cx])) continue;
        const next = cost[cur]! + (dx && dz ? 1.414 : 1);
        const n = z * g.nx + x;
        if (next < cost[n]!) {
          cost[n] = next;
          prev[n] = cur;
          push([next + h(x, z), n]);
        }
      }
  }
  if (!found) return [to];

  const cells: Pt[] = [];
  for (let c = idx(t); c !== -1 && c !== idx(s); c = prev[c]!) cells.push(centre(g, c % g.nx, Math.floor(c / g.nx)));
  cells.reverse();
  // Keep only the corners: from each point, jump to the furthest one that can be seen.
  const out: Pt[] = [];
  let at = from;
  for (let i = 0; i < cells.length; ) {
    let j = cells.length - 1;
    while (j > i && !clear(g, at, cells[j]!)) j--;
    out.push(cells[j]!);
    at = cells[j]!;
    i = j + 1;
  }
  out[out.length - 1] = to;
  return out;
}

/** The whole way in: from outside the door, through it, to a space and the spot in it. */
export function routeIn(f: FloorLayout, g: Grid, spot: Spot): Pt[] {
  const { door, outside } = entranceOf(f);
  return [...findPath(g, outside, door), ...findPath(g, door, spot.approach), spot.at];
}

/** The whole way out, from wherever they are. */
export function routeOut(f: FloorLayout, g: Grid, from: Pt): Pt[] {
  const { door, outside } = entranceOf(f);
  return [...findPath(g, from, door), outside];
}
