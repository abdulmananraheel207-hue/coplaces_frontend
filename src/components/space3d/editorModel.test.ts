import { describe, expect, it } from 'vitest';
import { PALETTE, nextName, type PaletteEntry } from '../../lib/catalogue';
import type { FloorObject, Resource } from '../../types';
import { addFloor, alignThings, anyCollision, applyTemplate, boxOf, buildSave, duplicateThings, findSpot, fits, floorsOf, isResizable, limitsOf, moveThing, moveThings, placeGrid, placeThing, problems, removeThing, removeThings, resizeThing, rotateThing, startDraft, toTemplate, type Draft, type Thing } from './editorModel';
import { compareFloors, floorKey, floorLabel, floorMark, footprint, layoutFloors, overlaps, type Box } from './layout';
import type { SpaceItem } from '../../lib/spaceState';

let n = 0;
const res = (o: Partial<Resource> = {}): Resource => ({
  id: `r${++n}`,
  locationId: 'loc',
  kind: 'room',
  name: `Space ${n}`,
  floor: '1',
  capacity: 4,
  hourlyRateCents: 100,
  dailyRateCents: 0,
  amenities: '',
  status: 'available',
  notes: '',
  style: '',
  planX: null,
  planZ: null,
  planW: null,
  planD: null,
  planRot: 0,
  description: '',
  openTime: null,
  closeTime: null,
  closedWeekdays: null,
  offPeakRateCents: null,
  peakStart: null,
  peakEnd: null,
  halfDayRateCents: null,
  fullDayRateCents: null,
  noPlanRateCents: null,
  ...o,
});
const placed = (o: Partial<Resource>, x: number, z: number, rot = 0) => res({ ...o, planX: x, planZ: z, planRot: rot });
const object = (o: Partial<FloorObject> = {}): FloorObject => ({ id: `o${++n}`, locationId: 'loc', floor: '1', type: 'kitchen', label: '', x: 0, z: 0, w: null, d: null, rot: 0, variant: '', tint: '', ...o });
const entry = (id: string): PaletteEntry => PALETTE.flatMap((g) => g.entries).find((e) => e.id === id)!;

const anyOverlap = (boxes: Box[]) => boxes.some((a, i) => boxes.slice(i + 1).some((b) => overlaps(a, b)));

describe('layout', () => {
  it('turns footprints a quarter at a time', () => {
    const wide = { x: 0, z: 0, w: 4, d: 2, rot: 0 };
    expect(footprint(wide)).toMatchObject({ minX: -2, maxX: 2, minZ: -1, maxZ: 1 });
    expect(footprint({ ...wide, rot: 1 })).toMatchObject({ minX: -1, maxX: 1, minZ: -2, maxZ: 2 });
    expect(footprint({ ...wide, rot: 2 })).toMatchObject({ minX: -2, maxX: 2 });
  });

  it('lets things touch but not overlap', () => {
    const a = { x: 0, z: 0, w: 4, d: 2, rot: 0 };
    expect(overlaps(a, { x: 4, z: 0, w: 4, d: 2, rot: 0 })).toBe(false);
    expect(overlaps(a, { x: 3.9, z: 0, w: 4, d: 2, rot: 0 })).toBe(true);
    // Turned, the same box is taller than it is wide, so it now reaches the neighbour above.
    expect(overlaps({ ...a, rot: 1 }, { x: 0, z: 2.5, w: 2, d: 2, rot: 0 })).toBe(true);
  });

  it('never lays out two things on top of each other, planned or not', () => {
    const kinds = ['room', 'corporate_room', 'office', 'hot_desk', 'dedicated_desk'] as const;
    const mixed = Array.from({ length: 40 }, (_, i) => res({ kind: kinds[i % kinds.length]!, floor: String(i % 3), capacity: 1 + ((i * 7) % 30), name: `T${i}` }));
    for (const f of layoutFloors(mixed.map((r) => ({ id: r.id, kind: r.kind, style: '', name: r.name, floor: r.floor, capacity: r.capacity, amenities: '', plan: null, tone: 'ok', status: '', bookable: false }) as SpaceItem))) {
      expect(anyOverlap(f.placed)).toBe(false);
    }
    // A floor with some things placed and some not: the unplaced ones go beneath, clear of the placed ones.
    const items = [placed({ kind: 'room', name: 'A' }, 0, 0), placed({ kind: 'room', name: 'B' }, 10, 0), res({ kind: 'hot_desk', name: 'C' }), res({ kind: 'hot_desk', name: 'D' }), res({ kind: 'office', name: 'E' })].map(
      (r) => ({ id: r.id, kind: r.kind, style: '', name: r.name, floor: '1', capacity: r.capacity, amenities: '', plan: r.planX === null ? null : { x: r.planX, z: r.planZ!, rot: 0, w: null, d: null }, tone: 'ok', status: '', bookable: false }) as SpaceItem,
    );
    const [f] = layoutFloors(items, [object({ x: 20, z: 0 })]);
    expect(anyOverlap([...f!.placed, ...f!.objects])).toBe(false);
    const loose = f!.placed.filter((p) => ['C', 'D', 'E'].includes(p.item.name));
    const fixedBottom = Math.max(...f!.placed.filter((p) => ['A', 'B'].includes(p.item.name)).map((p) => footprint(p).maxZ));
    for (const p of loose) expect(footprint(p).minZ).toBeGreaterThanOrEqual(fixedBottom);
  });

  it('holds a floor still while editing instead of re-centring it', () => {
    const base = [placed({ name: 'A' }, 0, 0), placed({ name: 'B' }, 6, 0)];
    const asItems = (rs: Resource[]) => rs.map((r) => ({ id: r.id, kind: r.kind, style: '', name: r.name, floor: '1', capacity: 4, amenities: '', plan: { x: r.planX!, z: r.planZ!, rot: 0, w: null, d: null }, tone: 'ok', status: '', bookable: false }) as SpaceItem);
    const [before] = layoutFloors(asItems(base));
    const moved = [base[0]!, { ...base[1]!, planX: 40 }];
    const [free] = layoutFloors(asItems(moved));
    const [held] = layoutFloors(asItems(moved), [], { origins: { [floorKey('1')]: before!.origin } });
    const a = (f: typeof before) => f!.placed.find((p) => p.item.name === 'A')!;
    expect(a(held).x).toBe(a(before).x); // pinned
    expect(a(free).x).not.toBe(a(before).x); // re-centred
  });
});

describe('starting a draft', () => {
  it('gives every space a position, and keeps an automatic floor from losing its lift core', () => {
    const rs = [res({ name: 'Room', floor: '1' }), res({ kind: 'hot_desk', name: 'D1', floor: '1' }), res({ kind: 'hot_desk', name: 'D2', floor: '1' })];
    const { draft } = startDraft(rs, []);
    expect(draft.things.filter((t) => t.type === 'resource')).toHaveLength(3);
    expect(draft.things.some((t) => t.type === 'object' && t.object === 'core')).toBe(true);
    expect(anyOverlap(draft.things.map(boxOf))).toBe(false);
  });

  it('keeps stored positions exactly, and skips retired spaces', () => {
    const rs = [placed({ name: 'A' }, 12.5, 3), placed({ name: 'Gone', status: 'retired' }, 0, 0)];
    const ob = [object({ x: -4, z: 9, type: 'coffee_machine' })];
    const { draft } = startDraft(rs, ob);
    expect(draft.things.map((t) => (t.type === 'resource' ? t.name : t.object)).sort()).toEqual(['A', 'coffee_machine']);
    const a = draft.things.find((t) => t.type === 'resource')!;
    expect([a.x, a.z]).toEqual([12.5, 3]);
    const c = draft.things.find((t) => t.type === 'object')!;
    expect([c.x, c.z]).toEqual([-4, 9]);
  });
});

describe('saving', () => {
  const rs = () => [placed({ name: 'Boardroom', capacity: 8 }, 0, 0), placed({ name: 'Desk 1', kind: 'hot_desk', capacity: 1 }, 10, 0), placed({ name: 'Old', status: 'retired' }, 50, 50)];
  const ob = () => [object({ x: 20, z: 0 })];

  it('has nothing to send when nothing changed', () => {
    const r = rs();
    const o = ob();
    const { body, changes } = buildSave('loc', startDraft(r, o).draft, r, o);
    expect(body).toMatchObject({ update: [], create: [], retire: [], objects: { upsert: [], remove: [] } });
    expect(changes).toEqual({ added: 0, changed: 0, removed: 0 });
  });

  it('keeps floors named by the owner even when nothing is on them', () => {
    const r = rs();
    const { draft } = startDraft(r, [], ['Roof Deck']);
    expect(floorsOf(draft)).toContain('Roof Deck');
    expect(buildSave('loc', draft, r, []).body.floors).toEqual(['Roof Deck']);
    expect(buildSave('loc', startDraft(r, []).draft, r, []).body.floors).toBeUndefined();
  });

  it('labels numbered floors as such and named floors as named', () => {
    expect(floorLabel('4')).toBe('Floor 4');
    expect(floorLabel('Ground Floor')).toBe('Ground Floor');
    expect(floorMark('Ground Floor')).toBe('GF');
    expect(floorMark('2')).toBe('2');
    expect(['Floor 2', 'Ground Floor', 'Floor 10', 'Floor 1'].sort(compareFloors)).toEqual(['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 10']);
  });

  it('does not mistake float noise for an edit', () => {
    // Positions like 6.275 survive the trip through the draft untouched.
    const r = [placed({ name: 'Odd' }, 6.275, 7.925, 2), placed({ name: 'Odd 2' }, 1.85, 2.425)];
    const { body, changes } = buildSave('loc', startDraft(r, []).draft, r, []);
    expect(body.update).toEqual([]);
    expect(changes).toEqual({ added: 0, changed: 0, removed: 0 });
  });

  it('saves a position for spaces that were never placed even if nothing else changed', () => {
    const r = [res({ name: 'Loose' })];
    const { body, changes } = buildSave('loc', startDraft(r, []).draft, r, []);
    expect(body.update).toHaveLength(1);
    expect(body.update[0]!.plan).toMatchObject({ rot: 0 });
    expect(changes.changed).toBe(0); // it is being placed, not edited
    expect(body.objects.upsert.some((u) => u.type === 'core')).toBe(true);
  });

  it('describes moves, additions and removals', () => {
    const r = rs();
    const o = ob();
    let d = startDraft(r, o).draft;
    const [boardroom, desk] = d.things;
    d = moveThing(d, boardroom!.key, 4, 6);
    d = rotateThing(d, boardroom!.key);
    d = removeThing(d, desk!.key);
    d = removeThing(d, o[0]!.id);
    const added = placeThing(d, entry('corporate_room:boardroom'), '2', 3, 3, 0, ['Old'], 1);
    d = placeThing(added.draft, entry('object:coffee_machine'), '2', 9, 9, 1, [], 2).draft;

    const { body, changes } = buildSave('loc', d, r, o);
    expect(body.update).toEqual([{ id: r[0]!.id, plan: { x: 4, z: 6, rot: 1, w: null, d: null } }]);
    expect(body.retire).toEqual([r[1]!.id]); // the retired one is not touched
    expect(body.create).toHaveLength(1);
    expect(body.create[0]).toMatchObject({ kind: 'corporate_room', style: 'boardroom', floor: '2', capacity: 16, plan: { x: 3, z: 3, rot: 0 } });
    expect(body.objects.remove).toEqual([o[0]!.id]);
    expect(body.objects.upsert).toEqual([expect.objectContaining({ type: 'coffee_machine', floor: '2', rot: 1 })]);
    expect(changes).toEqual({ added: 2, changed: 1, removed: 2 });
  });

  it('sends only the details that changed', () => {
    const r = rs();
    const o = ob();
    let d = startDraft(r, o).draft;
    d = { ...d, things: d.things.map((t) => (t.type === 'resource' && t.name === 'Boardroom' ? { ...t, name: 'Council Room', hourlyRateCents: 500 } : t)) };
    const { body } = buildSave('loc', d, r, o);
    expect(body.update[0]!.props).toEqual({ name: 'Council Room', hourlyRateCents: 500 });
  });
});

describe('placing and fitting', () => {
  it('names new spaces after their style and never repeats a name, retired ones included', () => {
    expect(nextName('Huddle Room', ['Huddle Room 1', 'huddle room 2'])).toBe('Huddle Room 3');
    expect(nextName('Desk D', ['Desk D1', 'Desk D2'])).toBe('Desk D3');
    const empty: Draft = { things: [], floors: [] };
    const first = placeThing(empty, entry('room:huddle'), '1', 0, 0, 0, ['Huddle Room 1'], 1);
    const second = placeThing(first.draft, entry('room:huddle'), '1', 9, 0, 0, ['Huddle Room 1'], 2);
    expect(second.draft.things.map((t) => (t.type === 'resource' ? t.name : ''))).toEqual(['Huddle Room 2', 'Huddle Room 3']);
  });

  it('starts new things with their style defaults', () => {
    const empty: Draft = { things: [], floors: [] };
    const t = placeThing(empty, entry('hot_desk:standing'), '1', 0, 0, 0, [], 1).thing;
    expect(t).toMatchObject({ type: 'resource', kind: 'hot_desk', style: 'standing', capacity: 1, dailyRateCents: 170_000 });
    const hall = placeThing(empty, entry('corporate_room:training_hall'), '1', 0, 0, 0, [], 2).thing;
    expect(hall).toMatchObject({ capacity: 30, hourlyRateCents: 1_200_000 });
  });

  it('only fits things on their own floor, clear of others, and inside the allowed area', () => {
    const { draft } = placeThing({ things: [], floors: [] }, entry('room:meeting'), '1', 0, 0, 0, [], 1);
    const t = draft.things[0]!;
    const near: Box = { ...boxOf(t), x: 1 };
    expect(fits(draft, '1', near)).toBe(false);
    expect(fits(draft, '1', near, t.key)).toBe(true); // ignoring itself, as when it is being dragged
    expect(fits(draft, '2', near)).toBe(true);
    expect(fits(draft, '1', { ...near, x: 9999 })).toBe(false);
    const wider = resizeThing(draft, t.key, 12, 6);
    expect(fits(wider, '1', { x: 8, z: 0, w: 2, d: 2, rot: 0 })).toBe(true); // clear of a 12 m room that reaches x = 6
    expect(fits(wider, '1', { x: 6, z: 0, w: 2, d: 2, rot: 0 })).toBe(false);
  });

  it('lists floors that have been added but are still empty', () => {
    const d = addFloor({ things: [], floors: [] }, '4');
    expect(floorsOf(d)).toEqual(['4']);
    expect(addFloor(d, '4')).toBe(d);
  });
});

describe('problems', () => {
  const draftWith = (...names: string[]): Draft => ({
    floors: [],
    things: names.map((name, i) => ({ type: 'resource', key: `k${i}`, id: null, kind: 'room', style: 'meeting', name, floor: '1', capacity: 4, hourlyRateCents: 0, dailyRateCents: 0, amenities: '', x: i * 10, z: 0, rot: 0, w: null, d: null })),
  });

  it('asks for names, once each, that are not held by removed spaces', () => {
    expect(problems(draftWith('A', 'B'), [])).toEqual([]);
    expect(problems(draftWith('A', 'a'), [])).toEqual(['"A" is used more than once.']);
    expect(problems(draftWith('A', ' '), [])).toEqual(['Every room and desk needs a name.']);
    expect(problems(draftWith('Old'), [res({ name: 'Old', status: 'retired' })])[0]).toMatch(/removed earlier/);
  });
});

describe('walls, doors and zones', () => {
  const empty: Draft = { things: [], floors: [] };
  const wallAt = (d: Draft, x: number, serial: number) => placeThing(d, entry('object:wall'), '1', x, 0, 0, [], serial);

  it('sit over other things and never stop anything being placed beside or on them', () => {
    const room = placeThing(empty, entry('room:meeting'), '1', 0, 0, 0, [], 1).draft;
    const withWall = wallAt(room, 0, 2).draft; // a wall straight through the room
    const wall = withWall.things[1]!;
    expect(fits(withWall, '1', boxOf(wall), wall.key, true)).toBe(true);
    // a second room can still go where the wall is: the wall is not in its way
    expect(fits(withWall, '1', { x: 20, z: 0, w: 4, d: 4, rot: 0 })).toBe(true);
    expect(fits(withWall, '1', { x: 0, z: 0, w: 2, d: 2, rot: 0 })).toBe(false); // but the first room still is
    expect(anyCollision(withWall, '1')).toBe(false);
  });

  it('can be as thin as a wall and stretched to length', () => {
    const wall = wallAt(empty, 0, 1).thing;
    expect(limitsOf(wall).min.d).toBeLessThan(0.2);
    expect(limitsOf(wall).max.w).toBeGreaterThan(30);
    expect(isResizable(wall)).toBe(true);
    const long = resizeThing({ things: [wall], floors: [] }, wall.key, 18, 0.2).things[0]!;
    expect(boxOf(long)).toMatchObject({ w: 18, d: 0.2 });
  });

  it('keeps the variant and colour of a zone through saving', () => {
    const zone = placeThing(empty, entry('object:zone'), '1', 0, 0, 0, [], 1).thing;
    const patched: Draft = { things: [{ ...zone, variant: 'l', tint: 'blue', label: 'Quiet zone' } as Thing], floors: [] };
    const { body } = buildSave('loc', patched, [], []);
    expect(body.objects.upsert[0]).toMatchObject({ type: 'zone', variant: 'l', tint: 'blue', label: 'Quiet zone' });
    // once stored, an unchanged zone is not sent again, and changing only its colour is
    const stored = object({ type: 'zone', label: 'Quiet zone', variant: 'l', tint: 'blue', x: 0, z: 0 });
    const d = startDraft([], [stored]).draft;
    expect(buildSave('loc', d, [], [stored]).body.objects.upsert).toHaveLength(0);
    const recoloured: Draft = { ...d, things: d.things.map((t) => (t.type === 'object' ? { ...t, tint: 'rose' } : t)) as Thing[] };
    expect(buildSave('loc', recoloured, [], [stored]).body.objects.upsert[0]).toMatchObject({ id: stored.id, tint: 'rose' });
  });
});

describe('working with many things at once', () => {
  const empty: Draft = { things: [], floors: [] };
  let serial = 0;
  const next = () => ++serial;

  it('moves and removes several together', () => {
    let d = placeThing(empty, entry('hot_desk:standard'), '1', 0, 0, 0, [], next()).draft;
    d = placeThing(d, entry('hot_desk:standard'), '1', 5, 0, 0, [], next()).draft;
    const [a, b] = d.things;
    const moved = moveThings(d, [
      { key: a!.key, x: 10, z: 10 },
      { key: b!.key, x: 12, z: 10 },
    ]);
    expect(moved.things.map((t) => [t.x, t.z])).toEqual([
      [10, 10],
      [12, 10],
    ]);
    expect(removeThings(moved, [a!.key, b!.key]).things).toHaveLength(0);
  });

  it('duplicates a selection beside the original, clear of everything, with new names', () => {
    let d = placeThing(empty, entry('hot_desk:standard'), '1', 0, 0, 0, [], next()).draft;
    d = placeThing(d, entry('hot_desk:standard'), '1', 2, 0, 0, [], next()).draft;
    const dup = duplicateThings(d, d.things.map((t) => t.key), next)!;
    expect(dup.draft.things).toHaveLength(4);
    const names = dup.draft.things.map((t) => (t.type === 'resource' ? t.name : ''));
    expect(new Set(names).size).toBe(4);
    expect(dup.keys).toHaveLength(2);
    expect(anyCollision(dup.draft, '1')).toBe(false);
  });

  it('adds a block of the same thing in a grid, ten desks in a row for instance', () => {
    const r = placeGrid(empty, entry('hot_desk:standard'), '1', { cols: 10, rows: 1, gap: 0.1, rot: 0 }, { x: 0, z: 0 }, [], next)!;
    expect(r.keys).toHaveLength(10);
    const xs = r.draft.things.map((t) => t.x).sort((p, q) => p - q);
    expect(new Set(r.draft.things.map((t) => t.z)).size).toBe(1);
    expect(xs[1]! - xs[0]!).toBeGreaterThan(1.58);
    expect(anyCollision(r.draft, '1')).toBe(false);
    const names = r.draft.things.map((t) => (t.type === 'resource' ? t.name : ''));
    expect(names[0]).toBe('Hot Desk 1');
    expect(names[9]).toBe('Hot Desk 10');
  });

  it('adds a grid of lockers, and a pod of four desks with two facing each way', () => {
    const lockers = placeGrid(empty, entry('storage:locker'), '1', { cols: 6, rows: 2, gap: 0.05, rot: 0 }, { x: 0, z: 0 }, [], next)!;
    expect(lockers.keys).toHaveLength(12);
    expect(lockers.draft.things.every((t) => t.type === 'resource' && t.kind === 'storage')).toBe(true);
    const pod = placeGrid(empty, entry('hot_desk:standard'), '1', { cols: 1, rows: 1, gap: 0.1, rot: 0, pod: true }, { x: 0, z: 0 }, [], next)!;
    expect(pod.keys).toHaveLength(4);
    expect(pod.draft.things.map((t) => t.rot).sort()).toEqual([0, 0, 2, 2]);
    expect(anyCollision(pod.draft, '1')).toBe(false);
  });

  it('puts a block where there is room when the middle is taken, and refuses when there is none', () => {
    const blocker = placeThing(empty, entry('corporate_room:event_hall'), '1', 0, 0, 0, [], next()).draft;
    const spot = findSpot(blocker, '1', [{ box: { x: 0, z: 0, w: 2, d: 2, rot: 0 }, free: false }], { x: 0, z: 0 })!;
    expect(fits(blocker, '1', { x: spot.x, z: spot.z, w: 2, d: 2, rot: 0 })).toBe(true);
    expect(Math.hypot(spot.x, spot.z)).toBeGreaterThan(5);
    // a block whose own middle lies outside the allowed area can never be placed
    expect(findSpot(empty, '1', [{ box: { x: 1000, z: 0, w: 2, d: 2, rot: 0 }, free: false }], { x: 0, z: 0 })).toBeNull();
  });

  it('saves a selection as a template and drops it on another floor', () => {
    let d = placeThing(empty, entry('hot_desk:standard'), '1', 10, 10, 0, [], next()).draft;
    d = placeThing(d, entry('object:plant'), '1', 12, 10, 0, [], next()).draft;
    const tpl = toTemplate(d, d.things.map((t) => t.key));
    expect(tpl).toHaveLength(2);
    expect(tpl.every((t) => Math.abs(t.x) < 3 && Math.abs(t.z) < 3)).toBe(true); // relative to the group's middle
    const applied = applyTemplate({ things: [], floors: [] }, tpl, '2', { x: 0, z: 0 }, ['Hot Desk 1'], next)!;
    expect(applied.draft.things).toHaveLength(2);
    expect(applied.draft.things.every((t) => t.floor === '2' && t.id === null)).toBe(true);
    expect(applied.draft.things.find((t) => t.type === 'resource')).toMatchObject({ name: 'Hot Desk 2' });
  });

  it('lines things up on an edge or a centre, and spreads them evenly', () => {
    let d = placeThing(empty, entry('hot_desk:standard'), '1', 0, 0, 0, [], next()).draft;
    d = placeThing(d, entry('hot_desk:standard'), '1', 5, 4, 0, [], next()).draft;
    d = placeThing(d, entry('hot_desk:standard'), '1', 12, 9, 0, [], next()).draft;
    const keys = d.things.map((t) => t.key);
    expect(new Set(alignThings(d, keys, 'top').things.map((t) => t.z)).size).toBe(1);
    expect(new Set(alignThings(d, keys, 'left').things.map((t) => t.x - boxOf(t).w / 2)).size).toBe(1);
    expect(alignThings(d, keys, 'centre').things.map((t) => t.x)).toEqual([6, 6, 6]);
    const uneven = { ...d, things: d.things.map((t, i) => ({ ...t, x: [0, 2, 10][i]! })) };
    expect(alignThings(uneven, keys, 'spread-x').things.map((t) => t.x)).toEqual([0, 5, 10]);
    expect(alignThings(d, [keys[0]!], 'left')).toBe(d);
  });

  it('knows which kinds of space can be stretched', () => {
    const t = (entryId: string) => placeThing(empty, entry(entryId), '1', 0, 0, 0, [], next()).thing;
    expect(isResizable(t('room:studio'))).toBe(true);
    expect(isResizable(t('hot_desk:standard'))).toBe(false);
    expect(isResizable(t('hot_desk:day_office'))).toBe(true);
    expect(isResizable(t('storage:locker'))).toBe(false);
    expect(isResizable(t('storage:parking'))).toBe(true);
    expect(isResizable(t('object:coffee_machine'))).toBe(true);
  });
});

describe('the palette', () => {
  const all = PALETTE.flatMap((g) => g.entries);

  it('offers every new kind of space, facility and structure once', () => {
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['room:studio', 'room:interview', 'room:focus', 'room:video_call', 'corporate_room:event_hall', 'hot_desk:day_office', 'dedicated_desk:team_pod', 'storage:locker', 'storage:mailbox', 'storage:parking']) expect(ids).toContain(id);
    for (const id of ['washroom_men', 'washroom_women', 'washroom_accessible', 'prayer_room', 'pantry', 'water_dispenser', 'vending_machine', 'recreation', 'nap_pod', 'library', 'server_room', 'mail_room', 'generator_room', 'security_desk', 'fire_exit', 'extinguisher', 'first_aid', 'terrace', 'bike_rack', 'wall', 'glass_wall', 'door', 'window', 'column', 'zone', 'label'])
      expect(ids).toContain(`object:${id}`);
  });

  it('starts every new thing at a sensible size and price', () => {
    const empty: Draft = { things: [], floors: [] };
    for (const e of all) {
      const t = placeThing(empty, e, '1', 0, 0, 0, [], 1).thing;
      const size = boxOf(t);
      expect(size.w).toBeGreaterThan(0.05);
      expect(size.d).toBeGreaterThan(0.05);
      if (t.type === 'resource' && (t.kind === 'room' || t.kind === 'corporate_room')) expect(t.hourlyRateCents).toBeGreaterThan(0);
      if (t.type === 'resource' && t.kind === 'hot_desk') expect(t.dailyRateCents).toBeGreaterThan(0);
    }
  });
});
