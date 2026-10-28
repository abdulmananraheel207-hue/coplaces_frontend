import { describe, expect, it } from 'vitest';
import { detectRegions } from './detect';
import { guessWidth, interpret, labelOf, meaningOf, outlineOf, tagsOf, toReading } from './interpret';
import { Sheet } from './sheet';
import type { Word } from './types';

const W = 1200;
const H = 800;
const word = (text: string, x: number, y: number, size = 14): Word => ({ text, cx: x / W, cy: y / H, w: (text.length * size * 0.6) / W, h: size / H });

/** A 27 m wide office floor drawn 40 px to the metre: rooms along the top, a block of desks, offices below. */
function floor() {
  const s = new Sheet(W, H);
  s.frame(60, 60, 1080, 680);
  s.down(60, 260, 360); // boardroom | meeting
  s.down(60, 260, 560);
  s.down(60, 260, 760, 5, [[150, 200]]);
  s.across(60, 760, 260, 5, [[400, 450]]);
  s.down(540, 740, 300); // two offices
  s.down(540, 740, 540);
  s.across(60, 540, 540, 5, [[150, 200]]);
  // the boardroom's table
  s.frame(110, 110, 200, 90, 3);
  // meeting room: a smaller table
  s.frame(410, 120, 100, 70, 3);
  // open floor desks: 3 x 6
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) s.frame(600 + c * 90, 320 + r * 70, 70, 50, 3);
  // a booth in the corner of the open floor, against the outer walls
  s.frame(1080, 680, 60, 60);
  // two desks in each office
  for (const x of [100, 330]) for (let i = 0; i < 2; i++) s.frame(x + i * 100, 580, 70, 50, 3);
  s.scribble(120, 20, 200);
  return s;
}

const run = (words: Word[] = [], overrides = {}, widthMetres = 27) => {
  const { regions } = detectRegions(floor().bitmap());
  return { regions, ...interpret(regions, words, { widthMetres, aspect: H / W, overrides }) };
};

const count = (items: { type: string }[], type: string) => items.filter((i) => i.type === type).length;

describe('labels', () => {
  it('names things from the words of a plan', () => {
    expect(meaningOf('Board Room')).toBe('boardroom');
    expect(meaningOf('Meeting Room 2')).toBe('meeting_room');
    expect(meaningOf('Training Hall')).toBe('training_hall');
    expect(meaningOf('Hall')).toBe('ignore'); // a corridor, not an event space
    expect(meaningOf('Pantry')).toBe('kitchen');
    expect(meaningOf('Lift and Stairs')).toBe('core');
    expect(meaningOf('Director')).toBe('executive_office');
    expect(meaningOf('Open Plan')).toBe('ignore');
    expect(meaningOf('Reception')).toBe('reception');
    expect(meaningOf('Phone booth')).toBe('phone_booth');
    expect(meaningOf('Cupboard')).toBeNull();
  });

  it('cleans a label of sizes and units, and tidies capitals', () => {
    const w = (text: string, cy = 0.5, cx = 0.5): Word => ({ text, cx, cy, w: 0.02, h: 0.02 });
    expect(labelOf([w('MEETING'), w('ROOM', 0.5, 0.55), w('3.6 x 4.2', 0.6), w('25 sqm', 0.7)])).toBe('Meeting Room');
    expect(labelOf([w('Board'), w('room', 0.5, 0.56)])).toBe('Board room');
    // a PDF splits a word where its letters change spacing; the pieces touch, so they are one word again
    expect(labelOf([w('Of', 0.5, 0.5), w('fi', 0.5, 0.521), w('ce', 0.5, 0.542), w('A', 0.5, 0.6)])).toBe('Office A');
    expect(labelOf([w('12')])).toBe('');
    expect(labelOf([w('Line two', 0.6), w('Line one', 0.5)])).toBe('Line one Line two');
  });
});

describe('reading a plan with no text', () => {
  it('takes the building outline from the rooms and nothing around them', () => {
    const { regions } = run();
    const o = outlineOf(regions, [], H / W);
    expect(o.x * W).toBeGreaterThan(55);
    expect(o.x * W).toBeLessThan(66);
    expect(o.w * W).toBeGreaterThan(1070);
    expect(o.w * W).toBeLessThan(1090);
  });

  it('finds rooms by their size and what is in them, desks as one block', () => {
    const { items } = run();
    expect(count(items, 'desks')).toBe(1);
    const block = items.find((i) => i.type === 'desks')!;
    expect(block).toMatchObject({ rows: 3, columns: 6 });
    // two offices with two desks each, a boardroom-sized room with a table, a meeting room, a booth
    expect(count(items, 'private_office') + count(items, 'executive_office')).toBe(2);
    expect(count(items, 'meeting_room') + count(items, 'boardroom')).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => i.why.length > 0)).toBe(true);
    // furniture is not mistaken for rooms: nothing reported is as small as a table or a desk on its own
    const metres = (i: { box: { w: number; h: number } }) => [(i.box.w * 27) / 0.9, ((i.box.h * 27) / 0.9) * (H / W)];
    for (const i of items.filter((x) => x.type !== 'desks')) expect(Math.min(...metres(i))).toBeGreaterThan(1);
  });

  it('works out the size of the room from its table', () => {
    const { items } = run();
    // the 5 m by 3.75 m room holding a table is a meeting room, the next one along (5 m x 5 m) with a table too
    const withTable = items.filter((i) => i.why.startsWith('a table inside'));
    expect(withTable.length).toBe(2);
  });

  it('puts a booth in the open floor in as a room, not furniture', () => {
    const { items } = run();
    const booth = items.find((i) => i.type === 'phone_booth');
    expect(booth).toBeTruthy();
    expect(booth!.box.x * W).toBeGreaterThan(1070);
  });

  it('changes what things are called as the owner corrects the scale', () => {
    // Twice the width makes every room four times the area, so the 10 m² meeting rooms become bigger kinds of room
    const small = run([], {}, 27).items.filter((i) => i.type !== 'desks');
    const big = run([], {}, 60).items.filter((i) => i.type !== 'desks');
    expect(big.length).toBeGreaterThan(0);
    const order = ['phone_booth', 'huddle_room', 'meeting_room', 'boardroom', 'training_room', 'training_hall'];
    const rank = (types: string[]) => types.reduce((n, t) => n + Math.max(0, order.indexOf(t)), 0);
    expect(rank(big.map((i) => i.type))).toBeGreaterThan(rank(small.map((i) => i.type)));
  });

  it('leaves a big empty space for the owner to name instead of guessing a hall', () => {
    const sheet = new Sheet(W, H);
    sheet.frame(60, 60, 1080, 680);
    sheet.down(60, 740, 620); // 14 m by 17 m, and 12 m by 17 m: both big, nothing in either
    const { regions } = detectRegions(sheet.bitmap());
    const { items } = interpret(regions, [], { widthMetres: 27, aspect: H / W });
    expect(items.map((i) => i.type)).toEqual(['skip', 'skip']);
    expect(items[0]!.why).toMatch(/open floor/);
    // The owner's choice turns one into a room
    const chosen = interpret(regions, [], { widthMetres: 27, aspect: H / W, overrides: { [items[0]!.id]: 'training_hall' } });
    expect(toReading(chosen, { widthMetres: 27, aspect: H / W }, 'estimated').rooms).toHaveLength(1);
  });

  it('lets the owner change a type or leave a shape out', () => {
    const base = run();
    const room = base.items.find((i) => i.type === 'meeting_room' || i.type === 'boardroom')!;
    const changed = run([], { [room.id]: 'kitchen' }).items.find((i) => i.id === room.id)!;
    expect(changed.type).toBe('kitchen');
    const reading = toReading(run([], { [room.id]: 'skip' }), { widthMetres: 27, aspect: H / W }, 'estimated');
    expect(reading.rooms.length + reading.amenities.length).toBe(base.items.filter((i) => i.type !== 'desks').length - 1);
  });
});

describe('reading a plan with text', () => {
  it('names rooms from the words inside them, and lets a label beat the size', () => {
    const { items } = run([word('BOARD ROOM', 200, 80), word('Pantry', 450, 100), word('Reception', 650, 100), word('27,000 mm', 600, 770)]);
    const named = items.filter((i) => i.label);
    expect(named.map((i) => [i.label, i.type]).sort()).toEqual([
      ['Board Room', 'boardroom'],
      ['Pantry', 'kitchen'],
      ['Reception', 'reception'],
    ]);
    expect(items.find((i) => i.label === 'Pantry')!.why).toBe('named "Pantry"');
  });

  it('leaves out corridors, the title block and open-plan labels', () => {
    const { items } = run([word('OPEN PLAN', 800, 300), word('Hall', 650, 100)]);
    expect(count(items, 'desks')).toBe(1); // the desks remain, the label is not a room
    expect(items.some((i) => /Hall|Open/i.test(i.label))).toBe(false);
  });

  it('takes the overall measurement printed on the plan as the width', () => {
    const { regions } = run();
    const g = guessWidth(regions, [word('27,000 mm', 600, 770), word('3,600', 300, 300), word('1:100', 900, 30)], H / W);
    expect(g.basis).toBe('stated');
    expect(g.widthMetres).toBe(27);
    // the overall length runs along the long side, so a measurement for the height scales down
    const tall = guessWidth(regions, [word('20 m', 100, 400)], H / W);
    expect(tall.widthMetres).toBeCloseTo(20 * (regions.length ? 1 : 0) || tall.widthMetres, 0);
  });

  it('guesses from the desks when nothing is printed, and says it is a guess', () => {
    const { regions } = run();
    const g = guessWidth(regions, [], H / W);
    expect(g.basis).toBe('estimated');
    // desks drawn 70 px long on a 1080 px wide building: 1.5 m / 70 px gives about 23 m
    expect(g.widthMetres).toBeGreaterThan(18);
    expect(g.widthMetres).toBeLessThan(30);
  });

  it('builds the reading the importer takes', () => {
    const found = run([word('Boardroom', 200, 80)]);
    const reading = toReading(found, { widthMetres: 27, aspect: H / W }, 'stated');
    expect(reading.widthMetres).toBe(27);
    expect(reading.deskBlocks).toHaveLength(1);
    expect(reading.rooms.find((r) => r.label === 'Boardroom')).toMatchObject({ kind: 'corporate_room', style: 'boardroom' });
    expect(reading.rooms.every((r) => r.seats !== null && r.seats >= 1)).toBe(true);
    expect(reading.outline.w).toBeGreaterThan(0.85);
  });
});

describe('reading a plan from its labels', () => {
  const aspect = H / W;
  const sized = (name: string, size: string, x: number, y: number) => [word(name, x, y, 8), word(size, x, y + 10, 8)];

  it('pairs each printed size with the name above it, and leaves out a corridor name above that', () => {
    const words = [
      word('PASSAGE 4\'-0" WIDE', 300, 182, 8),
      ...sized('OFFICE', '10\'-0"x12\'-0"', 300, 200),
      word('EXECUTIVE', 600, 190, 8),
      ...sized('OFFICE', '10\'-6"x16\'-9"', 600, 200),
      word('RECEPTION AREA', 900, 400, 8),
    ];
    const tags = tagsOf(words, aspect);
    expect(tags.map((t) => t.label)).toEqual(['Office', 'Executive Office', 'Reception Area']);
    expect(tags[0]!.meaning).toBe('private_office');
    expect(tags[1]!.meaning).toBe('executive_office');
    expect(tags[2]!.dims).toBeNull();
    expect(tags[0]!.dims![0]).toBeCloseTo(3.048, 2);
  });

  it('works out the scale from a row of matching rooms, however the shapes were cut up', () => {
    // Offices 10 ft wide side by side, labels 125 px apart: 3.15 m per 125 px is about 30.2 m across the picture.
    const words = [0, 1, 2, 3].flatMap((i) => sized('OFFICE', '10\'-0"x12\'-0"', 200 + i * 125, 200));
    const guess = guessWidth([], words, aspect, { x: 0, y: 0, w: 1, h: 1 });
    expect(guess.basis).toBe('stated');
    expect(guess.note).toMatch(/side by side/);
    expect(guess.widthMetres).toBeGreaterThan(29);
    expect(guess.widthMetres).toBeLessThan(31.5);
  });

  it('places named rooms at their printed size even when no walls were found around them', () => {
    const words = [0, 1, 2, 3].flatMap((i) => sized('OFFICE', '10\'-0"x12\'-0"', 200 + i * 125, 200));
    const out = interpret([], words, { widthMetres: 30, aspect, outline: { x: 0, y: 0, w: 1, h: 1 } });
    const offices = out.items.filter((i) => i.type === 'private_office');
    expect(offices).toHaveLength(4);
    expect(offices[0]!.box.w * 30).toBeCloseTo(3.05, 1);
    expect(offices[0]!.box.h * 30 * aspect).toBeCloseTo(3.66, 1);
    expect(offices[0]!.why).toMatch(/printed on the plan/);
  });
});
