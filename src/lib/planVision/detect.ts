import type { Frac } from '../../types';
import type { Bitmap, Detection, Region } from './types';

/**
 * Finds the closed shapes in a picture of a floor plan, using nothing but its pixels.
 *
 * 1. Dark pixels are the drawing. Long straight runs of them, across or down, are walls. Text, hatching,
 *    door swings and furniture legs are too short to count.
 * 2. The walls' middle lines cut the picture into a grid of cells.
 * 3. Two neighbouring cells are joined unless a wall covers most of the edge between them, so a doorway
 *    in a wall does not leak one room into the next.
 * 4. Each joined set of cells is a region. The ones that reach the picture's edge are the outside.
 *
 * Plans are drawn on a grid of straight walls, so this is cheap and does not care about line thickness or the
 * picture's size. It does not cope with walls drawn at an angle, or with a drawing that has no closed rooms.
 */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 1 where a pixel is part of the drawing. Paper, light fills and transparent pixels are 0. */
export function inkOf(img: Bitmap): Uint8Array {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const gray = new Uint8Array(n);
  /** Strongly coloured pixels (teal glass partitions, red door leaves): lines in a colour that is not dark enough to pass as grey. */
  const colour = new Uint8Array(n);
  let sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = data[p + 3]! / 255;
    // Transparent pixels are paper.
    const r = data[p]! * a + 255 * (1 - a);
    const gr = data[p + 1]! * a + 255 * (1 - a);
    const bl = data[p + 2]! * a + 255 * (1 - a);
    const g = Math.round(0.299 * r + 0.587 * gr + 0.114 * bl);
    gray[i] = g;
    if (Math.max(r, gr, bl) - Math.min(r, gr, bl) >= 55 && g <= 190) colour[i] = 1;
    sum += g;
  }
  // A drawing in light lines on a dark ground (a blueprint) is turned the right way round.
  const invert = sum / n < 100;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    if (invert) gray[i] = 255 - gray[i]!;
    hist[gray[i]!]!++;
  }
  // Otsu's method picks the level that best separates dark from light.
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * hist[i]!;
  let below = 0;
  let sumBelow = 0;
  let best = -1;
  let level = 128;
  for (let i = 0; i < 256; i++) {
    below += hist[i]!;
    if (!below) continue;
    const above = n - below;
    if (!above) break;
    sumBelow += i * hist[i]!;
    const d = sumBelow / below - (total - sumBelow) / above;
    const v = below * above * d * d;
    if (v > best) {
      best = v;
      level = i;
    }
  }
  // Light grey fills and tints are never walls, whatever the picture's contrast.
  const threshold = clamp(level, 70, 170);
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) ink[i] = gray[i]! <= threshold || (!invert && colour[i]) ? 1 : 0;
  return ink;
}

/** Marks pixels that belong to a straight run of at least `minRun` ink pixels, across or down, bridging tiny breaks. */
export function runMask(ink: Uint8Array, w: number, h: number, minRun: number, bridge: number, vertical: boolean): Uint8Array {
  const mask = new Uint8Array(w * h);
  const lines = vertical ? w : h;
  const len = vertical ? h : w;
  const at = (a: number, b: number) => (vertical ? b * w + a : a * w + b);
  for (let a = 0; a < lines; a++) {
    let b = 0;
    while (b < len) {
      if (!ink[at(a, b)]) {
        b++;
        continue;
      }
      const start = b;
      let last = b;
      let gap = 0;
      b++;
      while (b < len) {
        if (ink[at(a, b)]) {
          last = b;
          gap = 0;
        } else if (++gap > bridge) break;
        b++;
      }
      if (last - start + 1 >= minRun) for (let k = start; k <= last; k++) mask[at(a, k)] = 1;
      b = last + 1;
    }
  }
  return mask;
}

/**
 * The pixels of wall that belong to something big and connected, such as the outer walls and the partitions
 * that join them. A desk, a table or a booth on its own is small however long its lines are.
 */
export function largeStructures(horizontal: Uint8Array, vertical: Uint8Array, w: number, h: number, minExtent: number, reach: number): Uint8Array {
  const n = w * h;
  const label = new Int32Array(n);
  const parent: number[] = [0];
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]!]!;
      a = parent[a]!;
    }
    return a;
  };
  const wall = (i: number) => horizontal[i]! | vertical[i]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!wall(i)) continue;
      let best = 0;
      const near = [x > 0 ? label[i - 1]! : 0, y > 0 && x > 0 ? label[i - w - 1]! : 0, y > 0 ? label[i - w]! : 0, y > 0 && x < w - 1 ? label[i - w + 1]! : 0];
      for (const l of near) {
        if (!l) continue;
        if (!best) best = l;
        else if (find(l) !== find(best)) parent[find(l)] = find(best);
      }
      if (!best) {
        best = parent.length;
        parent.push(best);
      }
      label[i] = best;
    }
  }
  const box = new Map<number, [number, number, number, number]>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = label[y * w + x]!;
      if (!l) continue;
      const root = find(l);
      label[y * w + x] = root;
      const b = box.get(root);
      if (!b) box.set(root, [x, x, y, y]);
      else {
        if (x < b[0]) b[0] = x;
        if (x > b[1]) b[1] = x;
        if (y < b[2]) b[2] = y;
        if (y > b[3]) b[3] = y;
      }
    }
  }
  const extent = (b: [number, number, number, number]) => Math.max(b[1] - b[0], b[3] - b[2]);
  const large = new Set<number>();
  for (const [root, b] of box) if (extent(b) >= minExtent) large.add(root);

  // A piece of wall between two doorways stands alone, but it is part of the building if it sits within a doorway's
  // reach of the big walls. Furniture is too small to count however close it is.
  const near = new Uint8Array(n);
  const pre = new Int32Array(Math.max(w, h) + 1);
  const grow = (vertical: boolean, src: Uint8Array, dst: Uint8Array) => {
    const lines = vertical ? w : h;
    const len = vertical ? h : w;
    for (let a = 0; a < lines; a++) {
      for (let t = 0; t < len; t++) pre[t + 1] = pre[t]! + src[vertical ? t * w + a : a * w + t]!;
      for (let t = 0; t < len; t++) if (pre[Math.min(len, t + reach + 1)]! - pre[Math.max(0, t - reach)]! > 0) dst[vertical ? t * w + a : a * w + t] = 1;
    }
  };
  const bigMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] && large.has(label[i]!)) bigMask[i] = 1;
  const rows = new Uint8Array(n);
  grow(false, bigMask, rows);
  grow(true, rows, near);
  const medium = minExtent * 0.55;
  for (let i = 0; i < n; i++) {
    const l = label[i]!;
    if (l && near[i] && !large.has(l) && extent(box.get(l)!) >= medium) large.add(l);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] && large.has(label[i]!)) out[i] = 1;
  return out;
}

/**
 * Fills the gaps between collinear wall pieces that are no wider than a doorway, so a door in a wall does not
 * count as the wall ending. Without this, a door that happens to span a whole cell would open the room up.
 */
export function closeGaps(mask: Uint8Array, w: number, h: number, bridge: number, vertical: boolean) {
  const lines = vertical ? w : h;
  const len = vertical ? h : w;
  const at = (a: number, b: number) => (vertical ? b * w + a : a * w + b);
  for (let a = 0; a < lines; a++) {
    let end = -1;
    for (let b = 0; b < len; b++) {
      if (!mask[at(a, b)]) continue;
      if (end >= 0 && b - end > 1 && b - end - 1 <= bridge) for (let k = end + 1; k < b; k++) mask[at(a, k)] = 1;
      end = b;
      while (b + 1 < len && mask[at(a, b + 1)]) b++;
      end = b;
    }
  }
}

interface Line {
  /** Where the middle of the wall is, in pixels. */
  pos: number;
  /** Half its thickness. */
  half: number;
}

/** The positions where a lot of wall pixels line up: every wall, however thick, becomes one line. */
export function findLines(mask: Uint8Array, w: number, h: number, vertical: boolean, minLen: number, merge: number): Line[] {
  const len = vertical ? w : h;
  const count = new Uint32Array(len);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) count[vertical ? x : y]!++;

  const found: { pos: number; lo: number; hi: number; weight: number }[] = [];
  let i = 0;
  while (i < len) {
    if (count[i]! < minLen) {
      i++;
      continue;
    }
    const lo = i;
    let hi = i;
    // One thin row or column below the limit does not end a line.
    while (hi + 1 < len && (count[hi + 1]! >= minLen || (hi + 2 < len && count[hi + 2]! >= minLen))) hi++;
    let weight = 0;
    let moment = 0;
    for (let k = lo; k <= hi; k++) {
      weight += count[k]!;
      moment += (k + 0.5) * count[k]!;
    }
    found.push({ pos: moment / weight, lo, hi: hi + 1, weight });
    i = hi + 1;
  }

  // Lines closer than `merge` are one wall drawn twice, such as the two faces of a thick wall.
  const lines: { pos: number; lo: number; hi: number; weight: number }[] = [];
  for (const f of found) {
    const prev = lines[lines.length - 1];
    if (prev && f.pos - prev.pos <= merge) {
      const weight = prev.weight + f.weight;
      prev.pos = (prev.pos * prev.weight + f.pos * f.weight) / weight;
      prev.lo = Math.min(prev.lo, f.lo);
      prev.hi = Math.max(prev.hi, f.hi);
      prev.weight = weight;
    } else lines.push({ ...f });
  }
  return lines.map((l) => ({ pos: l.pos, half: (l.hi - l.lo) / 2 }));
}

/** For a wall line, how many of the pixels up to each point along it are covered by wall. */
function coverage(mask: Uint8Array, w: number, h: number, vertical: boolean, line: Line): Int32Array {
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  const band = Math.max(2, Math.ceil(line.half) + 2);
  const lo = clamp(Math.floor(line.pos - band), 0, across - 1);
  const hi = clamp(Math.ceil(line.pos + band), 0, across - 1);
  const pre = new Int32Array(along + 1);
  for (let t = 0; t < along; t++) {
    let any = 0;
    for (let a = lo; a <= hi && !any; a++) any = mask[vertical ? t * w + a : a * w + t]!;
    pre[t + 1] = pre[t]! + any;
  }
  return pre;
}

/**
 * The box around the building's own walls: the big connected pieces of wall, leaving out the one that is the sheet's
 * border (which, with the title block's lines, reaches nearly the whole picture).
 */
function buildingExtent(walls: Uint8Array, w: number, h: number): Frac | undefined {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let start = 0; start < w * h; start++) {
    if (!walls[start] || seen[start]) continue;
    let a = w;
    let b = h;
    let c = 0;
    let d = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      if (x < a) a = x;
      if (x > c) c = x;
      if (y < b) b = y;
      if (y > d) d = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (walls[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
    }
    const sheet = c - a >= 0.85 * w && d - b >= 0.5 * h;
    if (sheet || c - a < 0.05 * w) continue;
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c + 1);
    y1 = Math.max(y1, d + 1);
  }
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h };
}

const WALLED = 0.4;
const MAX_LINES = 250;
const MAX_REGIONS = 2500;

export function detectRegions(img: Bitmap): Detection {
  const { width: w, height: h } = img;
  const notes: string[] = [];
  const ink = inkOf(img);
  const maxDim = Math.max(w, h);
  const minRun = Math.max(14, Math.round(maxDim * 0.012));
  const merge = Math.max(3, Math.round(maxDim * 0.004));
  const horizontal = runMask(ink, w, h, minRun, 2, false);
  const vertical = runMask(ink, w, h, minRun, 2, true);
  // Doorways in the building's own walls are closed. Furniture, with gaps between its pieces, is left as drawn.
  // A doorway is 1 to 2 metres: a few percent of a building's width.
  const doorway = clamp(Math.round(maxDim * 0.05), 30, 100);
  const big = largeStructures(horizontal, vertical, w, h, maxDim * 0.15, doorway);
  const extent = buildingExtent(big, w, h);
  const structH = horizontal.map((v, i) => v & big[i]!);
  const structV = vertical.map((v, i) => v & big[i]!);
  closeGaps(structH, w, h, doorway, false);
  closeGaps(structV, w, h, doorway, true);
  for (let i = 0; i < w * h; i++) {
    horizontal[i] = horizontal[i]! | structH[i]!;
    vertical[i] = vertical[i]! | structV[i]!;
  }

  // Too many lines means a noisy picture (a photo, hatching). Asking for longer lines thins them out.
  const lines = (mask: Uint8Array, vert: boolean) => {
    let minLen = minRun * 1.5;
    for (let tries = 0; tries < 8; tries++, minLen *= 1.3) {
      const found = findLines(mask, w, h, vert, minLen, merge);
      if (found.length <= MAX_LINES) return found;
    }
    return [];
  };
  const vLines = lines(vertical, true);
  const hLines = lines(horizontal, false);

  // Cell boundaries: the picture's edges and every wall line. Edges take over any wall that sits on them.
  const bounds = (found: Line[], size: number) => {
    const inner = found.filter((l) => l.pos > 2 && l.pos < size - 2);
    return [{ pos: 0, half: 0 }, ...inner, { pos: size, half: 0 }];
  };
  const xLines = bounds(vLines, w);
  const yLines = bounds(hLines, h);
  const xs = xLines.map((l) => Math.round(l.pos));
  const ys = yLines.map((l) => Math.round(l.pos));
  const m = xs.length - 1;
  const n = ys.length - 1;
  if (m < 1 || n < 1) return { regions: [], notes: ['No walls were found in the picture.'] };

  const covV = xLines.map((l) => coverage(vertical, w, h, true, l));
  const covH = yLines.map((l) => coverage(horizontal, w, h, false, l));
  const walled = (cov: Int32Array, a: number, b: number) => (cov[b]! - cov[a]!) / Math.max(1, b - a) >= WALLED;

  // Join cells that no wall separates.
  const OUT = m * n;
  const parent = new Int32Array(OUT + 1);
  for (let i = 0; i <= OUT; i++) parent[i] = i;
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]!]!;
      a = parent[a]!;
    }
    return a;
  };
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) {
      const c = j * m + i;
      if (!walled(covV[i + 1]!, ys[j]!, ys[j + 1]!)) join(c, i < m - 1 ? c + 1 : OUT);
      if (!walled(covH[j + 1]!, xs[i]!, xs[i + 1]!)) join(c, j < n - 1 ? c + m : OUT);
      if (i === 0 && !walled(covV[0]!, ys[j]!, ys[j + 1]!)) join(c, OUT);
      if (j === 0 && !walled(covH[0]!, xs[i]!, xs[i + 1]!)) join(c, OUT);
    }
  }

  // Gather the regions. The one joined to the outside is not a region.
  const outside = find(OUT);
  const compOf = new Int32Array(m * n).fill(-1);
  const ids = new Map<number, number>();
  interface Comp {
    i0: number;
    i1: number;
    j0: number;
    j1: number;
    area: number;
    cells: number;
    fillArea: number;
    holes: Uint8Array | null;
    first: number;
  }
  const comps: Comp[] = [];
  const cw = (i: number) => xs[i + 1]! - xs[i]!;
  const ch = (j: number) => ys[j + 1]! - ys[j]!;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) {
      const root = find(j * m + i);
      if (root === outside) continue;
      let id = ids.get(root);
      if (id === undefined) {
        id = comps.length;
        ids.set(root, id);
        comps.push({ i0: i, i1: i, j0: j, j1: j, area: 0, cells: 0, fillArea: 0, holes: null, first: j * m + i });
      }
      const c = comps[id]!;
      compOf[j * m + i] = id;
      c.i0 = Math.min(c.i0, i);
      c.i1 = Math.max(c.i1, i);
      c.j0 = Math.min(c.j0, j);
      c.j1 = Math.max(c.j1, j);
      c.area += cw(i) * ch(j);
      c.cells++;
    }
  }
  if (comps.length > MAX_REGIONS) return { regions: [], notes: ['The plan is too detailed to read. Try a cleaner copy, with fewer lines.'] };
  if (!comps.length) return { regions: [], notes: ['No closed rooms were found. The walls may have gaps, or the drawing may be too faint.'] };

  // A door frame can cut a thin strip off the end of a room. A strip much narrower than the rooms beside it, in the same
  // row, belongs to the room next to it.
  for (let pass = 0; pass < 2; pass++) {
    for (const a of comps) {
      if (a.cells === 0) continue;
      const row = comps.filter((r) => r.cells > 0 && r.j0 === a.j0 && r.j1 === a.j1);
      if (row.length < 3) continue;
      const widths = row.map((r) => xs[r.i1 + 1]! - xs[r.i0]!).sort((p, q) => p - q);
      const median = widths[Math.floor(widths.length / 2)]!;
      if (xs[a.i1 + 1]! - xs[a.i0]! >= 0.7 * median) continue;
      const next = row.find((r) => r !== a && r.i0 === a.i1 + 1) ?? row.find((r) => r !== a && r.i1 === a.i0 - 1);
      if (!next) continue;
      const nextId = comps.indexOf(next);
      const aId = comps.indexOf(a);
      for (let k = 0; k < compOf.length; k++) if (compOf[k] === aId) compOf[k] = nextId;
      next.i0 = Math.min(next.i0, a.i0);
      next.i1 = Math.max(next.i1, a.i1);
      next.area += a.area;
      next.cells += a.cells;
      next.first = Math.min(next.first, a.first);
      a.cells = 0;
      a.area = 0;
    }
  }

  // Whatever sits inside a region (a table in a room, desks in an open area) counts towards its shape, so a room
  // with furniture in it is still a rectangle. Those are the cells the outside of its box cannot reach.
  comps.forEach((c, id) => {
    const bw = c.i1 - c.i0 + 1;
    const bh = c.j1 - c.j0 + 1;
    c.fillArea = c.area;
    if (c.cells === 0 || bw * bh === c.cells) return;
    const seen = new Uint8Array(bw * bh);
    const queue: number[] = [];
    const visit = (a: number, b: number) => {
      const k = b * bw + a;
      if (seen[k] || compOf[(c.j0 + b) * m + c.i0 + a] === id) return;
      seen[k] = 1;
      queue.push(k);
    };
    for (let a = 0; a < bw; a++) {
      visit(a, 0);
      visit(a, bh - 1);
    }
    for (let b = 0; b < bh; b++) {
      visit(0, b);
      visit(bw - 1, b);
    }
    for (let q = 0; q < queue.length; q++) {
      const a = queue[q]! % bw;
      const b = Math.floor(queue[q]! / bw);
      if (a > 0) visit(a - 1, b);
      if (a < bw - 1) visit(a + 1, b);
      if (b > 0) visit(a, b - 1);
      if (b < bh - 1) visit(a, b + 1);
    }
    const holes = new Uint8Array(bw * bh);
    let any = false;
    for (let b = 0; b < bh; b++) {
      for (let a = 0; a < bw; a++) {
        if (!seen[b * bw + a] && compOf[(c.j0 + b) * m + c.i0 + a] !== id) {
          holes[b * bw + a] = 1;
          c.fillArea += cw(c.i0 + a) * ch(c.j0 + b);
          any = true;
        }
      }
    }
    if (any) c.holes = holes;
  });

  // The nearest region around each one: the smallest whose filled-in holes contain it.
  const containers = comps.map((c, id) => ({ c, id })).filter((e) => e.c.holes);
  const around = comps.map((c, id) => {
    const ci = c.first % m;
    const cj = Math.floor(c.first / m);
    let best = -1;
    for (const { c: p, id: pid } of containers) {
      if (pid === id || ci < p.i0 || ci > p.i1 || cj < p.j0 || cj > p.j1) continue;
      if (!p.holes![(cj - p.j0) * (p.i1 - p.i0 + 1) + (ci - p.i0)]) continue;
      if (best < 0 || p.fillArea < comps[best]!.fillArea) best = pid;
    }
    return best;
  });

  // Specks smaller than a letter are dropped, and anything inside one is passed up to what surrounds it.
  // How much drawing sits inside each region, measured clear of its walls.
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += ink[y * w + x]!;
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1]! + run;
    }
  }
  const inkIn = (x0: number, y0: number, x1: number, y1: number) => {
    const pad = Math.max(3, merge + 1);
    const a = clamp(x0 + pad, 0, w);
    const b = clamp(x1 - pad, 0, w);
    const c = clamp(y0 + pad, 0, h);
    const d = clamp(y1 - pad, 0, h);
    if (b <= a || d <= c) return 0;
    return (sat[d * (w + 1) + b]! - sat[c * (w + 1) + b]! - sat[d * (w + 1) + a]! + sat[c * (w + 1) + a]!) / ((b - a) * (d - c));
  };
  const minArea = Math.max(40, maxDim * maxDim * 0.00004);
  const keep = comps.map((c) => c.area >= minArea);
  const regionId = new Map<number, number>();
  const regions: Region[] = [];
  comps.forEach((c, id) => {
    if (!keep[id]) return;
    regionId.set(id, regions.length);
    const boxArea = (xs[c.i1 + 1]! - xs[c.i0]!) * (ys[c.j1 + 1]! - ys[c.j0]!);
    regions.push({
      id: regions.length,
      box: { x: xs[c.i0]! / w, y: ys[c.j0]! / h, w: (xs[c.i1 + 1]! - xs[c.i0]!) / w, h: (ys[c.j1 + 1]! - ys[c.j0]!) / h },
      fill: clamp(c.fillArea / boxArea, 0, 1),
      ink: inkIn(xs[c.i0]!, ys[c.j0]!, xs[c.i1 + 1]!, ys[c.j1 + 1]!),
      parent: null,
    });
  });
  comps.forEach((_, id) => {
    const at = regionId.get(id);
    if (at === undefined) return;
    let up = around[id]!;
    while (up >= 0 && !keep[up]) up = around[up]!;
    regions[at]!.parent = up >= 0 ? regionId.get(up)! : null;
  });

  return { regions, notes, ...(extent ? { extent } : {}) };
}
