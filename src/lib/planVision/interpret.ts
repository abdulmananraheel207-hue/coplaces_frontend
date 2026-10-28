import type { FloorObjectType, Frac, PlanReading } from '../../types';
import { OBJECTS } from '../catalogue';
import { ROOM_TYPES, type Item, type ItemType, type Region, type RoomType, type Word } from './types';

/**
 * Decides what the regions of a floor plan are, once the building's real size is known. Text from the plan
 * (a PDF's own text) names rooms when there is any. Otherwise a room is judged by its size and what is
 * drawn inside it: a table, a few desks. The reader is a best guess, so every decision comes with a reason
 * and the owner can change any of them.
 */

export type Overrides = Record<string, ItemType>;

export interface Interpretation {
  items: Item[];
  /** The building's outline, which the width refers to. */
  outline: Frac;
  notes: string[];
}

// ---------------------------------------------------------------------------------------------
// What a label says

type Meaning = RoomType | FloorObjectType | 'ignore';

const MEANINGS: [RegExp, Meaning][] = [
  [
    /\b(corridor|passage|passageway|hallway|walkway|terrace|balcony|void|duct|open to below|open plan|open space|hot desks?|desk area|co-?working|work ?area|workspace|flexi)\b/,
    'ignore',
  ],
  [
    /\b(lifts?|elevators?|stairs?|staircase|toilets?|wc|baths?|washrooms?|restrooms?|lavatory|bathrooms?|shafts?|risers?|ducts?|stores?|storage|server|electrical|janitor|plant room|fire exit)\b|^(?:dn|up|down)(?:\s+(?:dn|up|down))*$/,
    'core',
  ],
  [/\b(kitchen|kitchenette|pantry|tea point|canteen|cafeteria|caf[eé])\b/, 'kitchen'],
  [/\b(reception|front desk|entrance|lobby|welcome)\b/, 'reception'],
  [/\b(lounge|breakout|break out|waiting|seating|sitting|sofas?|relax|chill)\b/, 'lounge'],
  [/\b(coffee|vending|espresso)\b/, 'coffee_machine'],
  [/\b(print|printer|printing|copy|copier)\b/, 'print_station'],
  [/\b(board ?room)\b/, 'boardroom'],
  [/\b(event|auditorium|town hall|training hall|conference hall|seminar hall|banquet|multi-?purpose)\b/, 'training_hall'],
  [/\b(training|classroom|workshop)\b/, 'training_room'],
  [/\bhall\b/, 'ignore'],
  [/\b(huddle)\b/, 'huddle_room'],
  [/\b(phone|call booth|booth|pod|zoom)\b/, 'phone_booth'],
  [/\b(executive|director|ceo|md|president|chairman|founder)\b/, 'executive_office'],
  [/\b(office|cabin|manager|admin|hr|accounts|team)\b/, 'private_office'],
  [/\b(meeting|conference|discussion|interview|room)\b/, 'meeting_room'],
];

/** Text on a plan that is about the drawing, not the building. */
const JUNK =
  /\b(title|drawing|scale|sheet|notes?|legend|project|date|north|revision|client|drawn|checked|approved|key plan|address|consultants?|architect|engineer|drg|e-?mail|designerz)\b/;

export function meaningOf(label: string): Meaning | null {
  const text = label.toLowerCase();
  for (const [re, meaning] of MEANINGS) if (re.test(text)) return meaning;
  return null;
}

/**
 * Text found inside a shape, as a name: pieces of one word that a PDF split apart are joined, units, sizes and
 * stray marks are removed, and capitals are tidied. `aspect` is the picture's height over its width.
 */
export function labelOf(words: Word[], aspect = 1): string {
  const same = (a: Word, b: Word) => Math.abs(a.cy - b.cy) * aspect <= Math.max(a.h, b.h) * aspect * 0.6;
  const ordered = [...words].sort((a, b) => (same(a, b) ? a.cx - b.cx : a.cy - b.cy));
  let text = '';
  ordered.forEach((w, i) => {
    const prev = ordered[i - 1];
    // A PDF often splits a word where its letters change spacing, such as "Of fi ce". Pieces that touch are one word.
    const touching = prev && same(prev, w) && w.cx - w.w / 2 - (prev.cx + prev.w / 2) <= w.h * aspect * 0.3;
    text += (i === 0 ? '' : touching ? '' : ' ') + w.text.trim();
  });
  text = text
    // Drawing annotations that sit inside rooms are not names.
    .replace(/\d*\s*[½¼¾]?\s*["”″]?\s*\b(?:brick|glass|wood(?:en)?)\s+partition\b/gi, ' ')
    .replace(/\bup\s+to\s+(?:slab|ceiling)\s+level\b/gi, ' ')
    .replace(/\bsliding\s+door\b/gi, ' ')
    // Feet and inches, such as 10'-0"x12'-0", and the x between them
    .replace(/\d+\s*['’′]\s*-?\s*\d*(?:\s*\d+\s*\/\s*\d+|[½¼¾])?\s*["”″]?/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:sq\.?\s*(?:m|ft)|sqm|sqft|m2|m²|ft²|mm|cm|m|ft)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\b/gi, ' ')
    .replace(/(?<=\s|^)[x×](?=\s|$)/gi, ' ')
    .replace(/[^\p{L}\p{N}\s&'/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "C E O" and "W C" are one word whose letters a PDF spaced apart. "Rm" is a room.
  text = text.replace(/\b(?:\p{L}\s)+\p{L}\b/gu, (m) => m.replace(/\s/g, ''));
  // Stray numbers from dimension lines after a name are noise. One number after it (Office 3) is part of it.
  text = text.replace(/(?<=\p{L})(?:\s+\d{1,2}){2,}$/u, '');
  // Stray numbers from dimension lines in front of a name are not part of it. A number after it (Office 3) is.
  text = text.replace(/^(?:\d+\s+)+(?=\p{L})/u, '');
  if ((text.match(/\p{L}/gu) ?? []).length < 2) return '';
  if (text === text.toUpperCase() && /\p{L}{3}/u.test(text)) text = text.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
  text = text.replace(/\bRm\b/gi, 'Room').replace(/^Wc$/, 'WC');
  return text.slice(0, 40);
}

// ---------------------------------------------------------------------------------------------
// Geometry

const union = (boxes: Frac[]): Frac => {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const contains = (b: Frac, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** The regions that may be what the picture shows of the building: not slivers, not strips, not junk. */
function plausible(regions: Region[], aspect: number, junk: Set<number>, overrides: Overrides) {
  return regions.filter((r) => {
    const side = Math.min(r.box.w, r.box.h * aspect);
    const long = Math.max(r.box.w, r.box.h * aspect);
    return side >= 0.012 && long / side <= 15 && r.fill >= 0.5 && !junk.has(r.id) && overrides[`r${r.id}`] !== 'skip';
  });
}

/** Regions that hold text about the drawing itself, such as the title block. */
function junkRegions(regions: Region[], words: Word[]) {
  const junk = new Set<number>();
  const letters = new Map<number, number>();
  for (const w of words) {
    let best: Region | null = null;
    for (const r of regions) if (contains(r.box, w.cx, w.cy) && (!best || r.box.w * r.box.h < best.box.w * best.box.h)) best = r;
    if (!best) continue;
    if (JUNK.test(w.text.toLowerCase())) junk.add(best.id);
    // A box with a lot of text in it is a note or a title block, not a room.
    letters.set(best.id, (letters.get(best.id) ?? 0) + (w.text.match(/\p{L}{3,}/gu) ?? []).length);
  }
  for (const [id, n] of letters) if (n >= 10) junk.add(id);

  // On a drawing sheet the drawing area sits inside the border, and the title block's cells sit beside it, inside the
  // same border. Anything beside the drawing area, inside the same border, belongs to the title block.
  const byId = new Map(regions.map((r) => [r.id, r]));
  const big = (r: Region, k: number) => r.box.w >= k && r.box.h >= k;
  for (const drawing of regions) {
    if (!big(drawing, 0.8) || drawing.parent === null) continue;
    const frame = byId.get(drawing.parent);
    if (!frame || !big(frame, 0.9)) continue;
    const d = drawing.box;
    const within = (b: Frac) => b.x >= d.x - 0.01 && b.y >= d.y - 0.01 && b.x + b.w <= d.x + d.w + 0.01 && b.y + b.h <= d.y + d.h + 0.01;
    for (const r of regions) if (r.parent === frame.id && r.id !== drawing.id && !within(r.box)) junk.add(r.id);
  }
  // With no text to recognise it, the title block is still the cells outside a drawing area that fills the sheet.
  for (const sheet of regions) {
    if (sheet.parent !== null || sheet.box.w < 0.8 || sheet.box.h < 0.6) continue;
    const s = sheet.box;
    for (const r of regions) {
      if (r.id === sheet.id || r.parent !== null) continue;
      const inside = r.box.x >= s.x - 0.01 && r.box.y >= s.y - 0.01 && r.box.x + r.box.w <= s.x + s.w + 0.01 && r.box.y + r.box.h <= s.y + s.h + 0.01;
      if (!inside) junk.add(r.id);
    }
  }
  return junk;
}

/**
 * The building's outline as far as the picture can tell: what the outermost real shapes cover. The drawing
 * sheet's own border, which surrounds the building with a margin, is not part of it.
 */
export function outlineOf(regions: Region[], words: Word[], aspect: number, overrides: Overrides = {}): Frac {
  const ok = plausible(regions, aspect, junkRegions(regions, words), overrides);

  // Clean rectangles that are not the whole picture are the rooms, and the rooms span the building. This holds even
  // when the building's own outline is not a closed shape, as on a plan with a diagonal wall.
  const rooms = ok.filter((r) => r.fill >= 0.85 && !(r.box.w >= 0.7 && r.box.h >= 0.7));
  if (rooms.length >= 2) return union(rooms.map((r) => r.box));

  const okIds = new Set(ok.map((r) => r.id));
  const byId = new Map(regions.map((r) => [r.id, r]));
  /** The nearest real shape around this one. */
  const outer = (r: Region) => {
    for (let p = r.parent; p !== null; p = byId.get(p)?.parent ?? null) if (okIds.has(p)) return p;
    return null;
  };
  const area = (r: Region) => r.box.w * r.box.h * aspect;
  const biggestInside = new Map<number, number>();
  for (const r of ok) {
    const o = outer(r);
    if (o !== null) biggestInside.set(o, Math.max(biggestInside.get(o) ?? 0, area(r)));
  }
  // A shape filling nearly the whole picture with something large inside it is the sheet, not the building.
  const sheet = new Set(ok.filter((r) => r.box.w >= 0.8 && r.box.h >= 0.8 && (biggestInside.get(r.id) ?? 0) >= 0.15 * area(r)).map((r) => r.id));
  const top = ok.filter((r) => {
    if (sheet.has(r.id)) return false;
    for (let o = outer(r); o !== null; o = outer(byId.get(o)!)) if (!sheet.has(o)) return false;
    return true;
  });
  return top.length ? union(top.map((r) => r.box)) : { x: 0, y: 0, w: 1, h: 1 };
}

// ---------------------------------------------------------------------------------------------
// Scale

interface Guess {
  widthMetres: number;
  basis: 'stated' | 'estimated';
  note: string;
}

/** Numbers on the plan that look like lengths, in metres. A PDF's own text often carries the overall dimension. */
function lengthsIn(words: Word[]): number[] {
  const out: number[] = [];
  for (const w of words) {
    const m = /^(\d{1,3}(?:[ ,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mm|cm|m|ft|')?$/i.exec(w.text.trim());
    if (!m) continue;
    const n = Number(m[1]!.replace(/[ ,](?=\d{3})/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    const unit = (m[2] ?? '').toLowerCase();
    const metres =
      unit === 'mm'
        ? n / 1000
        : unit === 'cm'
          ? n / 100
          : unit === 'm'
            ? n
            : unit === 'ft' || unit === "'"
              ? n * 0.3048
              : !unit && Number.isInteger(n) && n >= 3000
                ? n / 1000
                : NaN;
    if (metres >= 4 && metres <= 250) out.push(metres);
  }
  return out;
}

const FOOT = String.raw`\d+\s*['’′](?:\s*-?\s*\d+(?:\s*\d+\s*\/\s*\d+|\s*[½¼¾])?)?\s*["”″]?`;
const FEET_PAIR = new RegExp(`(${FOOT})\\s*[x×X]\\s*(${FOOT})`);
const METRIC_PAIR = /(\d+(?:[.,]\d+)?)\s*(mm|m)?\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*(mm|m)?/;

/** One length such as 13'-8½" or 10'-0", in metres. */
function feetOf(t: string): number | null {
  const m = /^(\d+)\s*['’′](?:\s*-?\s*(\d+)(?:\s*(\d+)\s*\/\s*(\d+)|\s*([½¼¾]))?)?/.exec(t.trim());
  if (!m) return null;
  const frac = m[3] && m[4] ? Number(m[3]) / Number(m[4]) : m[5] ? { '½': 0.5, '¼': 0.25, '¾': 0.75 }[m[5]]! : 0;
  return (Number(m[1]) * 12 + Number(m[2] ?? 0) + frac) * 0.0254;
}

/** A pair of lengths printed on a room, such as 10'-0"x12'-0" or 3.6 x 4.2 m or 3600x4200, in metres. */
export function dimsOf(text: string): [number, number] | null {
  const f = FEET_PAIR.exec(text);
  if (f) {
    const a = feetOf(f[1]!);
    const b = feetOf(f[2]!);
    return a && b && a > 0.5 && b > 0.5 && a < 60 && b < 60 ? [a, b] : null;
  }
  const m = METRIC_PAIR.exec(text);
  if (!m) return null;
  const num = (s: string) => Number(s.replace(',', '.'));
  const unit = m[4] ?? m[2];
  const scale = (n: number) => (unit === 'mm' || (!unit && n >= 100) ? n / 1000 : n);
  const a = scale(num(m[1]!));
  const b = scale(num(m[3]!));
  return a >= 0.5 && b >= 0.5 && a < 60 && b < 60 ? [a, b] : null;
}

// ---------------------------------------------------------------------------------------------
// Labels: a room's name with the size printed under it

/** One labelled space on the plan: its name, the size printed with it when there is one, and where the label sits. */
export interface Tag {
  label: string;
  meaning: Meaning | null;
  /** In metres, in the order printed. Plans print the across-the-page length first. */
  dims: [number, number] | null;
  /** The printed size as written, for explaining where a number came from. */
  printed: string;
  cx: number;
  cy: number;
}

/** Words about the drawing sheet, never the name of a space. */
const SHEET_TEXT = /\b(layout|plan|section|elevation|detail|partition|ceiling level|slab level|sliding door)\b/i;

/**
 * Pairs each printed size with the name above it ("EXECUTIVE" / "OFFICE" / "10'-6"x16'-9""), and keeps names that
 * have no size when they name an amenity, such as a reception area. `aspect` is the picture's height over its width.
 */
export function tagsOf(words: Word[], aspect: number): Tag[] {
  // A corridor's name ("PASSAGE 4'-0" WIDE") often sits right above a room's label, and is never part of it.
  const named = (w: Word) =>
    (w.text.match(/\p{L}/gu) ?? []).length >= 2 && !dimsOf(w.text) && !JUNK.test(w.text.toLowerCase()) && !SHEET_TEXT.test(w.text) && meaningOf(w.text) !== 'ignore';
  /** How far apart two words are, in picture widths, against the size of their lettering. */
  const near = (a: Word, b: Word) => {
    const h = Math.max(a.h, b.h) * aspect;
    const dx = Math.max(0, Math.abs(a.cx - b.cx) - (a.w + b.w) / 4);
    const dy = Math.abs(a.cy - b.cy) * aspect;
    return dx <= h * 1.2 && dy <= h * 2.6;
  };
  const used = new Set<Word>();
  const tags: Tag[] = [];
  for (const d of words) {
    const dims = dimsOf(d.text);
    if (!dims) continue;
    // A size can carry its own name ("OFFICE 3.6 x 4.2"), or the name sits on the line or two above it.
    const lines: Word[] = [];
    let below = d;
    for (let k = 0; k < 2; k++) {
      const up = words
        .filter((w) => w !== d && !used.has(w) && !lines.includes(w) && named(w) && w.cy <= below.cy + below.h * 0.3 && near(w, below))
        .sort((a, b) => Math.hypot(a.cx - below.cx, (a.cy - below.cy) * aspect) - Math.hypot(b.cx - below.cx, (b.cy - below.cy) * aspect))[0];
      if (!up) break;
      lines.unshift(up);
      below = up;
    }
    lines.forEach((w) => used.add(w));
    used.add(d);
    const label = labelOf([...lines, d], aspect);
    const all = [...lines, d];
    tags.push({
      label,
      meaning: label ? meaningOf(label) : null,
      dims,
      printed: d.text.replace(/\s+/g, ' ').trim(),
      cx: all.reduce((n, w) => n + w.cx, 0) / all.length,
      cy: all.reduce((n, w) => n + w.cy, 0) / all.length,
    });
  }
  for (const w of words) {
    if (used.has(w) || !named(w)) continue;
    const label = labelOf([w], aspect);
    const meaning = label ? meaningOf(label) : null;
    // Without a size, only amenities are worth placing from a name alone: a room needs its walls. Stairs marked UP
    // and DN, and other service spaces, are left to the walls around them.
    if (!meaning || meaning === 'ignore' || meaning === 'core' || meaning in ROOM_TYPES) continue;
    tags.push({ label, meaning, dims: null, printed: '', cx: w.cx, cy: w.cy });
  }
  return tags;
}

/** A partition between two rooms, in metres. Rooms side by side are one room's width plus this apart. */
const WALL = 0.1;

/**
 * Rooms of the same printed size side by side, such as a row of offices, are one room width apart, label to label.
 * That gives the scale however much furniture is drawn in them. Returns metres per picture width.
 */
function scaleFromRows(tags: Tag[], aspect: number): { metresPerWidth: number; count: number; example: string } | null {
  const sized = tags.filter((t): t is Tag & { dims: [number, number] } => !!t.dims);
  const same = (a: Tag & { dims: [number, number] }, b: Tag & { dims: [number, number] }) =>
    Math.abs(a.dims[0] - b.dims[0]) <= 0.03 * a.dims[0] && Math.abs(a.dims[1] - b.dims[1]) <= 0.03 * a.dims[1];
  const votes: { s: number; weight: number; example: string }[] = [];
  for (const t of sized) {
    // Only the nearest matching neighbour to the right and below, so a room is never measured across another.
    const right = sized
      .filter((o) => o !== t && same(o, t) && o.cx > t.cx && Math.abs(o.cy - t.cy) * aspect <= 0.25 * (o.cx - t.cx))
      .sort((a, b) => a.cx - b.cx)[0];
    const down = sized
      .filter((o) => o !== t && same(o, t) && o.cy > t.cy && Math.abs(o.cx - t.cx) <= 0.25 * (o.cy - t.cy) * aspect)
      .sort((a, b) => a.cy - b.cy)[0];
    if (right) {
      const gap = right.cx - t.cx;
      votes.push({ s: (t.dims[0] + WALL) / gap, weight: 1, example: t.printed });
      votes.push({ s: (t.dims[1] + WALL) / gap, weight: 0.4, example: t.printed });
    }
    if (down) {
      const gap = (down.cy - t.cy) * aspect;
      votes.push({ s: (t.dims[1] + WALL) / gap, weight: 1, example: t.printed });
      votes.push({ s: (t.dims[0] + WALL) / gap, weight: 0.4, example: t.printed });
    }
  }
  if (!votes.length) return null;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.06 * Math.max(a, b);
  let best: { s: number; weight: number } | null = null;
  for (const v of votes) {
    const weight = votes.filter((o) => near(o.s, v.s)).reduce((n, o) => n + o.weight, 0);
    if (!best || weight > best.weight) best = { s: v.s, weight };
  }
  // Two rooms agreeing is the least that is believed.
  if (!best || best.weight < 2) return null;
  const agree = votes.filter((v) => near(v.s, best!.s)).sort((a, b) => a.s - b.s);
  const mid = agree[Math.floor(agree.length / 2)]!;
  // The size quoted is the one most of the agreeing rooms share, such as a row of offices.
  const tally = new Map<string, number>();
  for (const v of agree) tally.set(v.example, (tally.get(v.example) ?? 0) + v.weight);
  const example = [...tally].sort((x, y) => y[1] - x[1])[0]![0];
  return { metresPerWidth: mid.s, count: agree.filter((v) => v.weight === 1).length + 1, example };
}

/**
 * Many plans print each room's size under its name ("OFFICE 10'-0"x12'-0""). Set against how big that room is
 * in the picture, it gives the scale directly, and far more reliably than a guess. Returns the metres that one
 * picture-width stands for, and an example of what it was worked out from.
 */
function scaleFromLabels(
  regions: Region[],
  words: Word[],
  aspect: number,
  junk: Set<number>,
  outlineWidth: number,
): { metresPerWidth: number; count: number; example: string } | null {
  const rooms = plausible(regions, aspect, junk, {}).filter((r) => r.fill >= 0.85);

  // A label's room is not always the smallest shape around it: furniture can cut a room into cells. So every shape
  // around a label offers a scale, and the scale most labels agree on wins.
  const labels: { text: string; options: number[] }[] = [];
  for (const w of words) {
    const dims = dimsOf(w.text);
    if (!dims) continue;
    const options: number[] = [];
    for (const r of rooms) {
      if (!contains(r.box, w.cx, w.cy)) continue;
      const width = r.box.w;
      const depth = r.box.h * aspect;
      // Which printed length is the room's width? Whichever way round makes the two scales agree.
      const straight = [dims[0] / width, dims[1] / depth] as const;
      const swapped = [dims[1] / width, dims[0] / depth] as const;
      const ratio = (p: readonly [number, number]) => Math.max(p[0] / p[1], p[1] / p[0]);
      const best = ratio(straight) <= ratio(swapped) ? straight : swapped;
      const s = Math.sqrt(best[0] * best[1]);
      // A scale that makes the building narrower than a room or wider than a campus is a wrong reading of a label.
      if (ratio(best) <= 1.3 && s * outlineWidth >= 8 && s * outlineWidth <= 100) options.push(s);
    }
    if (options.length) labels.push({ text: w.text, options });
  }
  if (!labels.length) return null;

  const near = (a: number, b: number) => Math.abs(a - b) <= 0.12 * Math.max(a, b);
  let best: { s: number; votes: number } | null = null;
  for (const l of labels) {
    for (const s of l.options) {
      const votes = labels.filter((o) => o.options.some((x) => near(x, s))).length;
      if (!best || votes > best.votes) best = { s, votes };
    }
  }
  const chosen = labels.flatMap((l) => {
    const x = l.options.find((o) => near(o, best!.s));
    return x ? [{ s: x, text: l.text }] : [];
  });
  chosen.sort((a, b) => a.s - b.s);
  const mid = chosen[Math.floor(chosen.length / 2)]!;
  return { metresPerWidth: mid.s, count: chosen.length, example: mid.text.replace(/\s+/g, ' ').trim() };
}

/** A first guess at how wide the building is, so the owner starts near the answer. */
export function guessWidth(regions: Region[], words: Word[], aspect: number, known?: Frac): Guess {
  const outline = known ?? outlineOf(regions, words, aspect);
  const alongWidth = outline.w >= outline.h * aspect;

  const rows = scaleFromRows(tagsOf(words, aspect), aspect);
  if (rows && outline.w * rows.metresPerWidth >= 6 && outline.w * rows.metresPerWidth <= 300) {
    return {
      widthMetres: Math.round(outline.w * rows.metresPerWidth * 10) / 10,
      basis: 'stated',
      note: `Worked out from rooms of the same printed size side by side (${rows.count} rooms, such as ${rows.example}).`,
    };
  }

  const printed = scaleFromLabels(regions, words, aspect, junkRegions(regions, words), outline.w);
  if (printed) {
    return {
      widthMetres: Math.round(outline.w * printed.metresPerWidth * 10) / 10,
      basis: 'stated',
      note: `Worked out from the room sizes printed on the plan (${printed.count} ${printed.count === 1 ? 'room' : 'rooms'}, such as ${printed.example}).`,
    };
  }

  const stated = lengthsIn(words);
  if (stated.length) {
    // The largest length on a plan is usually the overall dimension, and it runs along the building's long side.
    const overall = Math.max(...stated);
    const widthMetres = alongWidth ? overall : overall * (outline.w / (outline.h * aspect));
    return {
      widthMetres: Math.round(widthMetres * 10) / 10,
      basis: 'stated',
      note: `Taken from the measurement ${overall.toLocaleString('en', { maximumFractionDigits: 1 })} m printed on the plan.`,
    };
  }

  // Several same-sized small shapes are probably desks, and a desk is about 1.5 m long.
  const junk = junkRegions(regions, words);
  const small = plausible(regions, aspect, junk, {}).filter((r) => {
    const side = Math.min(r.box.w, r.box.h * aspect);
    const long = Math.max(r.box.w, r.box.h * aspect);
    return r.fill >= 0.85 && long / side <= 3.5 && long < 0.06;
  });
  const clusters: { long: number; side: number; n: number }[] = [];
  for (const r of small) {
    const side = Math.min(r.box.w, r.box.h * aspect);
    const long = Math.max(r.box.w, r.box.h * aspect);
    const c = clusters.find((k) => Math.abs(k.long - long) <= 0.15 * long && Math.abs(k.side - side) <= 0.15 * side);
    if (c) c.n++;
    else clusters.push({ long, side, n: 1 });
  }
  // The commonest size of small shape is most likely the desks. Chairs and tables come in smaller numbers, and a
  // guess that puts the building outside 8 to 80 metres is not believed.
  const sensible = (c: { long: number }) => {
    const w = outline.w * (1.5 / c.long);
    return w >= 8 && w <= 80;
  };
  const desks = clusters.filter((c) => c.n >= 4).sort((a, b) => b.n * (sensible(b) ? 1 : 0.1) - a.n * (sensible(a) ? 1 : 0.1))[0];
  if (desks && sensible(desks))
    return {
      widthMetres: Math.round(outline.w * (1.5 / desks.long) * 10) / 10,
      basis: 'estimated',
      note: 'A guess, assuming the repeated small shapes are desks about 1.5 m long.',
    };

  // Several rooms of the same size are most likely offices, and a small office is about 11 m² (10 by 12 ft).
  const modules: { w: number; d: number; n: number }[] = [];
  for (const r of plausible(regions, aspect, junk, {}).filter((x) => x.fill >= 0.85 && (x.ink ?? 1) >= 0.04)) {
    const w = r.box.w;
    const d = r.box.h * aspect;
    // Something much smaller than a room's share of the building is furniture, however many there are.
    if (Math.max(w, d) / Math.min(w, d) > 2.2 || w * d < 0.006 * outline.w * outline.h * aspect) continue;
    const m = modules.find((k) => Math.abs(k.w - w) <= 0.1 * w && Math.abs(k.d - d) <= 0.1 * d);
    if (m) m.n++;
    else modules.push({ w, d, n: 1 });
  }
  const rooms = modules.filter((m) => m.n >= 3).sort((a, b) => b.n - a.n || b.w * b.d - a.w * a.d)[0];
  if (rooms) {
    const widthMetres = outline.w * Math.sqrt(11 / (rooms.w * rooms.d));
    if (widthMetres >= 8 && widthMetres <= 120)
      return {
        widthMetres: Math.round(widthMetres * 2) / 2,
        basis: 'estimated',
        note: `A guess, assuming the ${rooms.n} matching rooms are offices of about 11 m².`,
      };
  }

  return { widthMetres: 24, basis: 'estimated', note: 'The size could not be worked out. Enter the real width of the building.' };
}

// ---------------------------------------------------------------------------------------------
// Rooms, desks and amenities

interface Measured extends Region {
  wm: number;
  dm: number;
  area: number;
  side: number;
  long: number;
}

/** Share of a room's inside that is furniture, above which it is an office. */
const FURNISHED = 0.06;
const BIG = { side: 1.8, area: 5 };
const ROOM = { side: 1, area: 1.2 };
const DESK = { sideMin: 0.45, sideMax: 2.3, longMin: 0.9, longMax: 3.2 };

const seatsFor = (type: RoomType, area: number) => {
  const per: Record<RoomType, number> = {
    meeting_room: 2.4,
    phone_booth: 99,
    huddle_room: 2,
    training_room: 1.6,
    boardroom: 2.2,
    training_hall: 1.3,
    private_office: 5,
    executive_office: 7,
  };
  return type === 'phone_booth' ? 1 : Math.min(200, Math.max(1, Math.round(area / per[type])));
};

export interface InterpretOptions {
  widthMetres: number;
  /** The picture's height divided by its width. */
  aspect: number;
  overrides?: Overrides;
  /** The building's outline when the owner has set it, instead of the one worked out from the picture. */
  outline?: Frac;
}

export function interpret(regions: Region[], words: Word[], opts: InterpretOptions): Interpretation {
  const { aspect, overrides = {} } = opts;
  const notes: string[] = [];
  const junk = junkRegions(regions, words);
  const outline = opts.outline ?? outlineOf(regions, words, aspect, overrides);
  const S = opts.widthMetres / Math.max(outline.w, 0.01);

  const all: Measured[] = regions.map((r) => {
    const wm = r.box.w * S;
    const dm = r.box.h * S * aspect;
    return { ...r, wm, dm, area: wm * dm, side: Math.min(wm, dm), long: Math.max(wm, dm) };
  });
  const byId = new Map(all.map((r) => [r.id, r]));
  const ignored = (r: Measured) => r.side < 0.4 || junk.has(r.id);
  /** The nearest region around this one that is a real shape, not a wall's thickness. */
  const around = (r: Measured): Measured | null => {
    for (let p = r.parent; p !== null;) {
      const up = byId.get(p)!;
      if (!ignored(up)) return up;
      p = up.parent;
    }
    return null;
  };
  /** Something small that floats in the middle of a bigger space, clear of its walls: a table, not a room. */
  const floating = (r: Measured) => {
    const up = around(r);
    if (!up || r.area > 16 || r.side > 2.6) return false;
    const gap = 0.25;
    return (
      (r.box.x - up.box.x) * S >= gap &&
      (up.box.x + up.box.w - r.box.x - r.box.w) * S >= gap &&
      (r.box.y - up.box.y) * S * aspect >= gap &&
      (up.box.y + up.box.h - r.box.y - r.box.h) * S * aspect >= gap
    );
  };
  const isBig = (r: Measured) => !ignored(r) && r.side >= BIG.side && r.area >= BIG.area && !floating(r);

  // A region with a proper room inside it is a container (the open floor, the paper margin), not a room.
  const container = new Set<number>();
  for (const r of all) {
    if (!isBig(r)) continue;
    for (let p = around(r); p; p = around(p)) container.add(p.id);
  }

  // Desks: small rectangles of the same size and close together.
  const deskLike = all.filter(
    (r) =>
      !ignored(r) &&
      !container.has(r.id) &&
      r.fill >= 0.7 &&
      r.side >= DESK.sideMin &&
      r.side <= DESK.sideMax &&
      r.long >= DESK.longMin &&
      r.long <= DESK.longMax &&
      r.long / r.side <= 3.5,
  );
  const deskLikeIds = new Set(deskLike.map((d) => d.id));
  const similar = (a: Measured, b: Measured) => Math.abs(a.side - b.side) <= 0.22 * Math.max(a.side, b.side) && Math.abs(a.long - b.long) <= 0.22 * Math.max(a.long, b.long);
  const kinds: Measured[][] = [];
  for (const d of deskLike) {
    const k = kinds.find((g) => similar(g[0]!, d));
    if (k) k.push(d);
    else kinds.push([d]);
  }
  const gapBetween = (a: Measured, b: Measured) => {
    const dx = Math.max(0, (a.box.x - b.box.x - b.box.w) * S, (b.box.x - a.box.x - a.box.w) * S);
    const dy = Math.max(0, (a.box.y - b.box.y - b.box.h) * S * aspect, (b.box.y - a.box.y - a.box.h) * S * aspect);
    return Math.hypot(dx, dy);
  };
  const groups: Measured[][] = [];
  for (const kind of kinds) {
    if (kind.length < 3) continue;
    const link = kind[0]!.long * 0.9;
    const root = kind.map((_, i) => i);
    const top = (i: number): number => (root[i] === i ? i : (root[i] = top(root[i]!)));
    for (let i = 0; i < kind.length; i++) for (let j = i + 1; j < kind.length; j++) if (gapBetween(kind[i]!, kind[j]!) <= link) root[top(i)] = top(j);
    const by = new Map<number, Measured[]>();
    kind.forEach((d, i) => by.set(top(i), [...(by.get(top(i)) ?? []), d]));
    for (const g of by.values()) if (g.length >= 3) groups.push(g);
  }
  const deskOf = new Map<number, Measured[]>();
  for (const g of groups) for (const d of g) deskOf.set(d.id, g);

  /** How many distinct rows or columns a set of positions falls into. */
  const lanes = (values: number[], tolerance: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    let n = 0;
    let last = -Infinity;
    for (const v of sorted) {
      if (v - last > tolerance) n++;
      last = v;
    }
    return n;
  };

  const textual = words.filter((w) => /\p{L}{3,}/u.test(w.text)).length >= 8;
  const items: Item[] = [];
  const claimed = new Set<number>();
  /** A table in a plain room. A small thing floating in an open floor, such as a lift, is a thing of its own. */
  const tableLike = (r: Measured) => {
    const up = around(r);
    return floating(r) && !!up && !container.has(up.id);
  };
  // Each word belongs to the smallest real space around it, so a room is named by its own text, not by the text
  // of the neighbours that happen to sit inside the box of an L-shaped corridor.
  const wordsOf = new Map<number, Word[]>();
  for (const word of words) {
    let home: Measured | null = null;
    for (const r of all) {
      if (ignored(r) || tableLike(r) || !contains(r.box, word.cx, word.cy)) continue;
      if (!home || r.box.w * r.box.h < home.box.w * home.box.h) home = r;
    }
    if (home) wordsOf.set(home.id, [...(wordsOf.get(home.id) ?? []), word]);
  }
  const labelIn = (r: Measured) => labelOf(wordsOf.get(r.id) ?? [], aspect);

  // Rooms and amenities
  const furniture = (r: Measured) => {
    const up = around(r);
    // Small things in the open floor around other rooms (a lift, a pod) are not furniture. Only a plain room has furniture.
    return !!up && !container.has(up.id) && ((up.side >= BIG.side && up.area >= BIG.area && !isBig(r)) || tableLike(r));
  };
  let irregular = 0;
  for (const r of all) {
    if (ignored(r) || container.has(r.id) || deskOf.has(r.id) || furniture(r)) continue;
    const label = labelIn(r);
    const meaning = label ? meaningOf(label) : null;
    if (meaning === 'ignore') continue;

    const isAmenity = meaning !== null && !(meaning in ROOM_TYPES);
    const roomSized = r.side >= ROOM.side && r.area >= ROOM.area;
    if (isAmenity) {
      if (r.side < 0.45 || r.fill < 0.5) continue;
      items.push({ id: `r${r.id}`, type: meaning as FloorObjectType, label, box: r.box, why: `named "${label}"` });
      claimed.add(r.id);
      continue;
    }
    if (!roomSized) continue;
    if (r.fill < 0.6) {
      // The open floor around everything else is not an odd room.
      if (r.box.w * r.box.h < 0.5 * outline.w * outline.h) irregular++;
      continue;
    }
    if (r.long / r.side > 7) continue;
    // A drawing that names its rooms does not leave real ones unnamed, and a long thin shape is a gap between lines.
    if (!label && (r.long / r.side > 3.2 || (textual && r.area < 8))) continue;

    const inside = all.filter((c) => c.id !== r.id && around(c) === r);
    // Two matching desks are enough to make a room an office, even though a block of desks takes three.
    const deskKids = inside.filter((c) => deskLikeIds.has(c.id));
    const desks = deskKids.some((a, i) => deskKids.slice(i + 1).some((b) => similar(a, b))) ? deskKids : [];
    // Desks filling a big space make it an open floor. Its desks are reported as blocks, not the space as a room.
    if (desks.length >= 3 && r.area >= 60) continue;
    const table = inside.filter((c) => !deskOf.has(c.id) && c.area >= 2 && c.area >= 0.08 * r.area).sort((a, b) => b.area - a.area)[0];

    let type: ItemType;
    let why: string;
    if (meaning) {
      type = meaning as RoomType;
      why = `named "${label}"`;
    } else if (desks.length >= 2) {
      type = r.area >= 32 ? 'executive_office' : 'private_office';
      why = `${desks.length} desks inside, ${Math.round(r.area)} m²`;
    } else if ((r.ink ?? 0) >= FURNISHED && r.area >= 6 && r.area < 40 && !table) {
      // Desks and chairs drawn in an enclosed room make it an office, even when they are not closed shapes of their own.
      type = r.area >= 24 ? 'executive_office' : 'private_office';
      why = `furnished like an office, ${Math.round(r.area)} m²`;
    } else if (r.area < 3.5) {
      type = 'phone_booth';
      why = `very small, ${r.area.toFixed(1)} m²`;
    } else if (table) {
      type = r.area < 9 ? 'huddle_room' : r.area >= 40 ? 'boardroom' : 'meeting_room';
      why = `a table inside, ${Math.round(r.area)} m²`;
    } else if (r.area < 9) {
      // A small closed box with nothing in it could be a lift, a store or a duct as easily as a huddle room.
      type = (r.ink ?? 0) >= 0.03 ? 'skip' : 'huddle_room';
      why = type === 'skip' ? `small, ${Math.round(r.area)} m², maybe a lift or store. Choose a type to add it` : `small, ${Math.round(r.area)} m²`;
    } else if (r.area >= 45 && (r.ink ?? 0) >= 0.04) {
      type = 'skip';
      why = `${Math.round(r.area)} m² full of drawing, perhaps stairs or an open area. Choose a type to add it`;
    } else if (r.area < 45) {
      type = 'meeting_room';
      why = `${Math.round(r.area)} m², nothing else to go on`;
    } else if (r.area < 110) {
      type = 'training_room';
      why = `large, ${Math.round(r.area)} m²`;
    } else {
      // A big empty space is most likely the open floor, where the desks go. Better left for the owner to say.
      type = 'skip';
      why = `${Math.round(r.area)} m², probably an open floor. Choose a type to add it`;
    }
    items.push({ id: `r${r.id}`, type, label, box: r.box, why });
    claimed.add(r.id);
  }

  // Blocks of desks, unless they are the furniture of a small room
  groups.forEach((g, k) => {
    const homes = g.map((d) => around(d)).filter((p): p is Measured => !!p);
    const home = homes[0];
    if (home && claimed.has(home.id) && home.area < 60) return;
    const cx = g.map((d) => d.box.x + d.box.w / 2);
    const cy = g.map((d) => d.box.y + d.box.h / 2);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const columns = lanes(cx, mean(g.map((d) => d.box.w)) * 0.55);
    const rows = lanes(cy, mean(g.map((d) => d.box.h)) * 0.55);
    items.push({
      id: `d${k}`,
      type: 'desks',
      label: '',
      box: union(g.map((d) => d.box)),
      rows: Math.max(1, rows),
      columns: Math.max(1, columns),
      rot: 0,
      why: `${g.length} matching desks`,
    });
  });

  // A plan that labels its rooms is read from its labels: each named space goes where its label is, at the size
  // printed with it, fitted to the walls when a shape of that size is there. Unnamed shapes on such a plan are mostly
  // furniture, so they are only offered, not added.
  const inside = (b: Frac, x: number, y: number, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
  const tags = tagsOf(words, aspect).filter((t) => t.meaning !== 'ignore' && inside(outline, t.cx, t.cy, 0.01));
  const fromTags: Item[] = [];
  const takenRegions = new Set<number>();
  tags.forEach((t, k) => {
    const type: ItemType | null = t.meaning === 'ignore' ? null : (t.meaning ?? (t.dims ? 'meeting_room' : null));
    if (!type) return;
    const around = all.filter((r) => !ignored(r) && !container.has(r.id) && !takenRegions.has(r.id) && contains(r.box, t.cx, t.cy) && r.fill >= 0.6);
    let box: Frac | null = null;
    let region: Measured | undefined;
    if (t.dims) {
      const [a, b] = t.dims;
      const misfit = (r: Measured) => Math.min(Math.max(Math.abs(r.wm - a) / a, Math.abs(r.dm - b) / b), Math.max(Math.abs(r.wm - b) / b, Math.abs(r.dm - a) / a));
      region = around.filter((r) => misfit(r) <= 0.25).sort((x, y) => misfit(x) - misfit(y))[0];
      // With no wall of the right size around the label (furniture cuts it up, or the wall is at an angle), the room is
      // drawn at its printed size around the label, across the page first as plans print it.
      box = region ? region.box : { x: t.cx - a / S / 2, y: t.cy - b / S / aspect / 2, w: a / S, h: b / S / aspect };
    } else {
      region = around.filter((r) => r.area >= 1.5 && r.area <= 80).sort((x, y) => x.area - y.area)[0];
      const size = OBJECTS[type as FloorObjectType];
      box = region ? region.box : size ? { x: t.cx - size.w / S / 2, y: t.cy - size.d / S / aspect / 2, w: size.w / S, h: size.d / S / aspect } : null;
    }
    if (!box) return;
    if (region) takenRegions.add(region.id);
    const size = t.dims ? `${t.dims[0].toFixed(1)} × ${t.dims[1].toFixed(1)} m printed on the plan` : '';
    const why = t.label ? `named "${t.label}"${size ? `, ${size}` : ''}` : `${size}, no name`;
    fromTags.push({ id: `t${k}`, type, label: t.label, box, why });
  });

  const labelled = fromTags.filter((i) => i.type in ROOM_TYPES).length >= 4;
  if (fromTags.length) {
    const centre = (b: Frac) => [b.x + b.w / 2, b.y + b.h / 2] as const;
    const overlap = (p: Frac, q: Frac) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
    const rooms = fromTags.filter((i) => i.type in ROOM_TYPES || i.type === 'kitchen');
    const kept = items.filter((it) => {
      const [x, y] = centre(it.box);
      // A block of desks inside a named room is that room's furniture.
      if (it.type === 'desks') return !rooms.some((r) => inside(r.box, x, y));
      // A shape that is mostly a named space is that space, already placed.
      return !fromTags.some((f) => inside(f.box, x, y) || overlap(f.box, it.box) >= 0.3 * Math.min(f.box.w * f.box.h, it.box.w * it.box.h));
    });
    if (labelled) {
      for (const it of kept) {
        if (it.type === 'desks' || it.label) continue;
        it.type = 'skip';
        it.why = 'not named on the plan, so probably furniture. Choose a type to add it';
      }
    }
    items.splice(0, items.length, ...fromTags, ...kept);
    if (labelled) notes.push(`Rooms were placed from the ${fromTags.length} names and sizes printed on the plan.`);
  }

  if (irregular && !labelled)
    notes.push(
      `${irregular} ${irregular === 1 ? 'area' : 'areas'} with an irregular outline ${irregular === 1 ? 'was' : 'were'} skipped. Place ${irregular === 1 ? 'it' : 'them'} by hand.`,
    );

  if (items.filter((i) => i.type === 'desks').length >= 12 && !labelled) {
    notes.push('A lot of small shapes were read as desks. If furniture is drawn across the rooms on this page, a version of the plan without furniture reads much better.');
  }

  items.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  for (const it of items) {
    const chosen = overrides[it.id];
    if (chosen) it.type = chosen;
  }
  return { items, outline, notes };
}

// ---------------------------------------------------------------------------------------------
// The reading the importer takes

const AREA_OF = (box: Frac, S: number, aspect: number) => box.w * S * box.h * S * aspect;

export function toReading(found: Interpretation, opts: InterpretOptions, basis: PlanReading['scaleBasis']): PlanReading {
  const S = opts.widthMetres / Math.max(found.outline.w, 0.01);
  const reading: PlanReading = { outline: found.outline, widthMetres: opts.widthMetres, scaleBasis: basis, rooms: [], deskBlocks: [], amenities: [], notes: [...found.notes] };
  for (const it of found.items) {
    if (it.type === 'skip') continue;
    if (it.type === 'desks') {
      const rows = it.rows ?? 1;
      const columns = it.columns ?? 1;
      // A block that is not a tidy grid is placed desk by desk, where each was found.
      const irregular = !!it.members && rows * columns > it.members.length * 1.15;
      reading.deskBlocks.push({ style: 'standard', rows, columns, rot: it.rot ?? 0, box: it.box, ...(irregular ? { members: it.members } : {}) });
    } else if (it.type in ROOM_TYPES) {
      const t = ROOM_TYPES[it.type as RoomType];
      reading.rooms.push({ kind: t.kind, style: t.style, label: it.label, seats: seatsFor(it.type as RoomType, AREA_OF(it.box, S, opts.aspect)), box: it.box });
    } else {
      reading.amenities.push({ type: it.type as FloorObjectType, label: it.label, box: it.box });
    }
  }
  return reading;
}
