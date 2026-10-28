import { describe, expect, it } from 'vitest';
import type { FloorObjectType, PlanReading } from '../../types';
import { LIMIT, boxOf, buildSave, isResource, problems, type Draft, type ResourceThing, type Thing } from './editorModel';
import { MAX_NEW_SPACES, importPlan, pictureSize, type ImportOptions } from './importLayout';
import { overlaps } from './layout';

const frac = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

const reading = (over: Partial<PlanReading> = {}): PlanReading => ({
  outline: frac(0.05, 0.05, 0.9, 0.9),
  widthMetres: 27,
  scaleBasis: 'stated',
  rooms: [],
  deskBlocks: [],
  amenities: [],
  notes: [],
  ...over,
});

const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({ floor: '1', widthMetres: 27, aspect: 0.75, deskKind: 'hot_desk', replace: true, ...over });
const empty: Draft = { things: [], floors: [] };
const counter = () => {
  let n = 0;
  return () => ++n;
};
const run = (r: PlanReading, o = opts(), draft = empty, taken: string[] = []) => importPlan(draft, r, o, taken, counter());

const room = (box: ReturnType<typeof frac>, label = '', style = 'meeting', kind: 'room' | 'corporate_room' | 'office' = 'room', seats: number | null = null) => ({ kind, style, label, seats, box });
const kitchen = (box: ReturnType<typeof frac>, type: FloorObjectType = 'kitchen', label = '') => ({ type, label, box });

const existing = (name: string, x: number, z: number, floor = '1'): ResourceThing => ({
  type: 'resource', key: name, id: name, kind: 'room', style: 'meeting', name, floor, capacity: 6, hourlyRateCents: 1, dailyRateCents: 0, amenities: '', x, z, rot: 0, w: 4, d: 3,
});

/** Nothing on a floor may overlap anything else, and all of it must be inside the editor's limits. */
function assertClear(things: Thing[]) {
  for (const a of things) {
    expect(Math.abs(a.x) <= LIMIT && Math.abs(a.z) <= LIMIT).toBe(true);
    for (const b of things) if (a !== b && a.floor === b.floor) expect(overlaps(boxOf(a), boxOf(b)), `${a.key} overlaps ${b.key}`).toBe(false);
  }
}

describe('importing a floor plan', () => {
  it('scales the picture by the width of the building', () => {
    // The outline covers 0.9 of the picture and is 27 m wide, so the whole picture is 30 m wide and 22.5 m deep.
    expect(pictureSize(reading(), 27, 0.75)).toEqual({ w: 30, d: 22.5 });
    const r = reading({ rooms: [room(frac(0.1, 0.1, 0.25, 0.2), 'Boardroom', 'boardroom', 'corporate_room', 14)] });

    const res = run(r);
    const t = res.draft.things[0] as ResourceThing;
    expect(t).toMatchObject({ kind: 'corporate_room', style: 'boardroom', name: 'Boardroom', capacity: 14, floor: '1', w: 7.5, d: 4.5, rot: 0 });
    expect(t.hourlyRateCents).toBeGreaterThan(0);
    expect(res.added).toEqual({ rooms: 1, desks: 0, amenities: 0 });

    // Telling it the building is twice as wide doubles everything.
    const big = run(r, opts({ widthMetres: 54 })).draft.things[0] as ResourceThing;
    expect(big.w).toBe(15);
    expect(big.d).toBe(9);
  });

  it('centres the plan on the floor, and the picture with it', () => {
    const res = run(reading({ rooms: [room(frac(0.05, 0.05, 0.9, 0.9), 'Whole floor')] }));
    const t = res.draft.things[0]!;
    expect(Math.abs(t.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(t.z)).toBeLessThanOrEqual(0.5);
    // The picture is placed so the plan lines up with it.
    expect(res.picture.w).toBe(30);
    expect(res.picture.x + 0.05 * 30).toBeCloseTo(t.x - 13.5, 0);
  });

  it('keeps neighbouring rooms from overlapping by trimming the one that spills over', () => {
    const r = reading({ rooms: [room(frac(0.1, 0.1, 0.25, 0.3), 'A'), room(frac(0.34, 0.1, 0.25, 0.3), 'B'), room(frac(0.1, 0.39, 0.5, 0.2), 'C')] });
    const res = run(r);
    expect(res.draft.things).toHaveLength(3);
    expect(res.skipped).toBe(0);
    assertClear(res.draft.things);
    // Rooms are laid on the half-metre grid.
    for (const t of res.draft.things) {
      const w = t.w ?? 0;
      expect(Math.abs(w * 2 - Math.round(w * 2))).toBeLessThan(1e-6);
    }
  });

  it('leaves out a room that has no space left, and says so', () => {
    const r = reading({ rooms: [room(frac(0.1, 0.1, 0.3, 0.3), 'First'), room(frac(0.1, 0.1, 0.3, 0.3), 'Second')] });
    const res = run(r);
    expect(res.draft.things.map((t) => (t as ResourceThing).name)).toEqual(['First']);
    expect(res.skipped).toBe(1);
    expect(res.notes[0]).toMatch(/1 thing in the plan had no room/);
  });

  it('lays a block of desks out as a grid at their real size', () => {
    const res = run(reading({ deskBlocks: [{ style: 'standard', rows: 2, columns: 3, rot: 0, box: frac(0.3, 0.3, 0.3, 0.2) }] }));
    const desks = res.draft.things as ResourceThing[];
    expect(desks).toHaveLength(6);
    expect(desks.map((d) => d.name)).toEqual(['Hot Desk 1', 'Hot Desk 2', 'Hot Desk 3', 'Hot Desk 4', 'Hot Desk 5', 'Hot Desk 6']);
    expect(desks.every((d) => d.kind === 'hot_desk' && d.w === null && d.capacity === 1 && d.dailyRateCents > 0)).toBe(true);
    // Reading order: along a row, then down.
    expect(desks[0]!.x).toBeLessThan(desks[1]!.x);
    expect(desks[0]!.z).toBe(desks[1]!.z);
    expect(desks[3]!.z).toBeGreaterThan(desks[0]!.z);
    assertClear(desks);
  });

  it('does not put more desks across a block than fit, however many the plan claims', () => {
    // 4 m by 3.2 m is room for two desks across and two down at the default size.
    const res = run(reading({ deskBlocks: [{ style: 'standard', rows: 9, columns: 9, rot: 0, box: frac(0.3, 0.3, 4 / 30, 3.2 / 22.5) }] }));
    expect(res.draft.things).toHaveLength(4);
    assertClear(res.draft.things);
    expect(res.skipped).toBe(81 - 4);
  });

  it('draws desks a little smaller when the plan packs them tighter than usual, rather than dropping a row', () => {
    // 6 by 3 desks in 9.5 m by 4.25 m: 1.58 m by 1.42 m each, a touch under the usual 1.58 by 1.49.
    const res = run(reading({ deskBlocks: [{ style: 'standard', rows: 3, columns: 6, rot: 0, box: frac(0.3, 0.3, 9.5 / 30, 4.25 / 22.5) }] }));
    const desks = res.draft.things as ResourceThing[];
    expect(desks).toHaveLength(18);
    expect(res.skipped).toBe(0);
    for (const d of desks) {
      expect(d.d).not.toBeNull();
      expect(d.d!).toBeGreaterThanOrEqual(1.49 * 0.85);
      expect(d.d!).toBeLessThan(1.49);
    }
    assertClear(desks);
    // Desks the plan draws at their usual size keep it.
    const roomy = run(reading({ deskBlocks: [{ style: 'standard', rows: 2, columns: 3, rot: 0, box: frac(0.3, 0.3, 0.3, 0.2) }] })).draft.things as ResourceThing[];
    expect(roomy.every((d) => d.w === null && d.d === null)).toBe(true);
    // Far too tight is still too tight: a third of the usual size is not a desk.
    const crushed = run(reading({ deskBlocks: [{ style: 'standard', rows: 1, columns: 12, rot: 0, box: frac(0.3, 0.3, 6 / 30, 1.6 / 22.5) }] }));
    expect(crushed.draft.things.length).toBe(4);
    assertClear(crushed.draft.things);
  });

  it('puts desks that are not in a neat grid where they were found, trying a little smaller before giving up', () => {
    // 30 m wide picture, so a desk of 1.58 m is 0.0527 wide. Three scattered desks, and a fourth almost on top of the first.
    const at = (x: number, y: number) => frac(x, y, 0.045, 0.045);
    const members = [at(0.2, 0.2), at(0.45, 0.25), at(0.3, 0.5), at(0.23, 0.2)];
    const res = run(reading({ deskBlocks: [{ style: 'standard', rows: 3, columns: 3, rot: 0, box: frac(0.2, 0.2, 0.3, 0.35), members }] }));
    const desks = res.draft.things as ResourceThing[];
    expect(desks.length).toBeGreaterThanOrEqual(3);
    expect(desks.length).toBeLessThanOrEqual(4);
    assertClear(desks);
    // not a 3 by 3 grid: nothing sits at a spot nobody drew a desk at
    const W = res.picture.w;
    for (const d of desks) expect(members.some((m) => Math.abs(d.x - ((m.x + m.w / 2) * W + res.picture.x)) < 0.02)).toBe(true);
    expect(res.skipped + desks.length).toBe(4);
  });

  it('turns desks to face the way the plan says, keeping them clear of each other', () => {
    for (const rot of [1, 2, 3]) {
      const res = run(reading({ deskBlocks: [{ style: 'corner', rows: 3, columns: 4, rot, box: frac(0.2, 0.2, 0.5, 0.4) }] }));
      expect(res.draft.things.length).toBeGreaterThan(4);
      expect(res.draft.things.every((t) => t.rot === rot)).toBe(true);
      assertClear(res.draft.things);
    }
  });

  it('can make the desks dedicated desks, in the style the plan shows', () => {
    const res = run(reading({ deskBlocks: [{ style: 'standing', rows: 1, columns: 2, rot: 0, box: frac(0.3, 0.3, 0.2, 0.1) }] }), opts({ deskKind: 'dedicated_desk' }));
    expect(res.draft.things.map((t) => isResource(t) && [t.kind, t.style, t.name])).toEqual([
      ['dedicated_desk', 'standing', 'Standing Desk D1'],
      ['dedicated_desk', 'standing', 'Standing Desk D2'],
    ]);
  });

  it('keeps small amenities at their own size and stretches the large ones to the plan', () => {
    const res = run(reading({ amenities: [kitchen(frac(0.1, 0.1, 0.2, 0.15), 'kitchen', 'Pantry'), kitchen(frac(0.5, 0.1, 0.1, 0.1), 'coffee_machine'), kitchen(frac(0.7, 0.1, 0.05, 0.05), 'plant', 'Fern')] }));
    const [pantry, coffee, plant] = res.draft.things;
    expect(pantry).toMatchObject({ object: 'kitchen', label: 'Pantry', w: 6 });
    expect(pantry!.d).toBeGreaterThanOrEqual(3); // 3.4 m in the plan, on the half-metre grid
    expect(pantry!.d).toBeLessThanOrEqual(3.5);
    expect(coffee).toMatchObject({ object: 'coffee_machine', w: null, d: null });
    expect(plant).toMatchObject({ object: 'plant', w: null });
    expect(res.added.amenities).toBe(3);
    assertClear(res.draft.things);
  });

  it('never reuses a name, including the names of spaces removed earlier', () => {
    const r = reading({
      rooms: [room(frac(0.1, 0.1, 0.2, 0.2), 'Boardroom'), room(frac(0.4, 0.1, 0.2, 0.2), 'Boardroom'), room(frac(0.1, 0.5, 0.2, 0.2), '', 'huddle'), room(frac(0.4, 0.5, 0.2, 0.2), '', 'huddle')],
      deskBlocks: [{ style: 'standard', rows: 1, columns: 2, rot: 0, box: frac(0.7, 0.5, 0.2, 0.1) }],
    });
    const res = run(r, opts(), empty, ['BOARDROOM', 'Huddle Room 1', 'Hot Desk 1']);
    const names = res.draft.things.filter(isResource).map((t) => t.name);
    expect(names).toEqual(['Boardroom 2', 'Boardroom 3', 'Huddle Room 2', 'Huddle Room 3', 'Hot Desk 2', 'Hot Desk 3']);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    expect(problems(res.draft, [])).toEqual([]);
  });

  it('counts on from a number in a label instead of tacking one on', () => {
    const r = reading({ rooms: [room(frac(0.1, 0.1, 0.2, 0.2), 'Meeting 1'), room(frac(0.4, 0.1, 0.2, 0.2), 'Meeting 1'), room(frac(0.1, 0.5, 0.2, 0.2), 'Pantry'), room(frac(0.4, 0.5, 0.2, 0.2), 'Pantry')] });
    const names = run(r, opts(), empty, ['Meeting 1', 'Meeting 2', 'Pantry']).draft.things.filter(isResource).map((t) => t.name);
    expect(names).toEqual(['Meeting 3', 'Meeting 4', 'Pantry 2', 'Pantry 3']);
  });

  it('replaces what is on the floor, but only on that floor', () => {
    const draft: Draft = { things: [existing('Old 1', 0, 0), existing('Old 2', 6, 0), existing('Upstairs', 0, 0, '2')], floors: ['1', '2'] };
    const res = run(reading({ rooms: [room(frac(0.1, 0.1, 0.3, 0.3), 'New')] }), opts({ replace: true }), draft);
    expect(res.removed).toBe(2);
    expect(res.draft.things.map((t) => (t as ResourceThing).name).sort()).toEqual(['New', 'Upstairs']);
  });

  it('can add beside what is there instead, clear of it', () => {
    const draft: Draft = { things: [existing('Old 1', 0, 0), existing('Old 2', 10, 4)], floors: ['1'] };
    const res = run(reading({ rooms: [room(frac(0.1, 0.1, 0.3, 0.3), 'New'), room(frac(0.5, 0.1, 0.3, 0.3), 'Newer')], deskBlocks: [{ style: 'standard', rows: 2, columns: 2, rot: 0, box: frac(0.1, 0.6, 0.2, 0.2) }] }), opts({ replace: false }), draft);
    expect(res.removed).toBe(0);
    expect(res.draft.things).toHaveLength(2 + 2 + 4);
    assertClear(res.draft.things);
    const oldRight = Math.max(...draft.things.map((t) => t.x + (t.w ?? 0) / 2));
    for (const t of res.draft.things.slice(2)) expect(t.x - (t.w ?? 1.5) / 2).toBeGreaterThan(oldRight);
  });

  it('adds a floor that did not exist, and builds a save the server will take', () => {
    const res = run(reading({ rooms: [room(frac(0.1, 0.1, 0.3, 0.3), 'Roof Lounge')], deskBlocks: [{ style: 'standard', rows: 1, columns: 2, rot: 0, box: frac(0.5, 0.5, 0.2, 0.1) }], amenities: [kitchen(frac(0.7, 0.1, 0.2, 0.15))] }), opts({ floor: '3' }));
    expect(res.draft.floors).toContain('3');
    const { body, changes } = buildSave('loc', res.draft, [], []);
    expect(changes.added).toBe(4);
    expect(body.create).toHaveLength(3);
    expect(body.objects.upsert).toHaveLength(1);
    for (const c of body.create) {
      expect(c.floor).toBe('3');
      expect(Math.abs(c.plan.x)).toBeLessThanOrEqual(300);
    }
  });

  it('stops at what one save can take', () => {
    const block = (y: number) => ({ style: 'standard', rows: 10, columns: 12, rot: 0, box: frac(0.05, y, 0.9, 0.2) });
    const res = run(reading({ outline: frac(0, 0, 1, 1), widthMetres: 120, deskBlocks: [block(0), block(0.25), block(0.5)] }), opts({ widthMetres: 120, aspect: 1 }));
    expect(res.draft.things.length).toBe(MAX_NEW_SPACES);
    expect(res.notes.join(' ')).toMatch(/can take 200 new rooms and desks/);
    assertClear(res.draft.things);
  });

  it('never overlaps anything, whatever the reading looks like', () => {
    // A small seeded generator, so a failure can be reproduced.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const some = () => frac(rnd() * 0.9, rnd() * 0.9, 0.02 + rnd() * 0.4, 0.02 + rnd() * 0.4);
    const types: FloorObjectType[] = ['kitchen', 'coffee_machine', 'lounge', 'print_station', 'reception', 'plant', 'core'];
    for (let n = 0; n < 40; n++) {
      const r = reading({
        outline: some(),
        rooms: Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => room(some(), rnd() < 0.5 ? 'Room' : '', ['meeting', 'phone_booth', 'huddle', 'training'][Math.floor(rnd() * 4)]!)),
        deskBlocks: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ style: ['standard', 'standing', 'corner'][Math.floor(rnd() * 3)]!, rows: 1 + Math.floor(rnd() * 8), columns: 1 + Math.floor(rnd() * 8), rot: Math.floor(rnd() * 4), box: some() })),
        amenities: Array.from({ length: Math.floor(rnd() * 8) }, () => kitchen(some(), types[Math.floor(rnd() * types.length)]!)),
      });
      const res = run(r, opts({ widthMetres: 5 + rnd() * 120, aspect: 0.4 + rnd() * 1.2, replace: rnd() < 0.5 }), { things: [existing('Existing', 1, 1)], floors: ['1'] });
      assertClear(res.draft.things);
      const names = res.draft.things.filter(isResource).map((t) => t.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
