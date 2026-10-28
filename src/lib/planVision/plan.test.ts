import { describe, expect, it } from 'vitest';
import { detectRegions } from './detect';
import { guessWidth, interpret } from './interpret';
import { Sheet } from './sheet';

const W = 1200;
const H = 800;
const whole = { x: 0, y: 0, w: 1, h: 1 };

/** A scatter of chair-sized squares, too small to be desks, filling a room's inside with drawing. */
function furnish(s: Sheet, x: number, y: number, w: number, h: number) {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) s.frame(x + 14 + c * Math.floor((w - 40) / 6), y + 14 + r * Math.floor((h - 40) / 6), 14, 14, 3);
}

/** A few desk-sized pieces, too long to be taken for chairs and desks of the size guess, so only the rooms are left to go on. */
function pieces(s: Sheet, x: number, y: number) {
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) s.frame(x + 20 + c * 85, y + 20 + r * 55, 76, 40, 3);
}

describe('reading a picture of a plan', () => {
  it('joins the strip a door frame cuts off the end of a room to the room beside it', () => {
    const s = new Sheet(W, H);
    s.frame(100, 100, 600, 200);
    for (const x of [200, 300, 400, 500, 600]) s.down(100, 300, x);
    s.down(160, 300, 130); // a door frame 30 px inside the first room, most of its depth
    const { regions } = detectRegions(s.bitmap());
    const row = regions.filter((r) => Math.abs(r.box.y * H - 100) < 6 && Math.abs(r.box.h * H - 200) < 6);
    expect(row).toHaveLength(6);
    expect(Math.round(row[0]!.box.w * W)).toBeGreaterThan(90);
  });

  it('finds the building without the sheet it is drawn on', () => {
    const s = new Sheet(W, H);
    s.frame(20, 20, 1160, 760); // the drawing sheet's border
    s.frame(200, 150, 700, 450); // the building
    s.down(150, 600, 550);
    const { extent } = detectRegions(s.bitmap());
    expect(extent).toBeTruthy();
    expect(Math.abs(extent!.x * W - 200)).toBeLessThan(8);
    expect(Math.abs(extent!.w * W - 700)).toBeLessThan(12);
    expect(Math.abs(extent!.h * H - 450)).toBeLessThan(12);
  });

  it('calls an enclosed room full of furniture an office, even when the furniture is not closed shapes', () => {
    const s = new Sheet(W, H);
    s.frame(100, 100, 320, 200);
    s.down(100, 300, 260);
    furnish(s, 100, 100, 160, 200);
    const { regions } = detectRegions(s.bitmap());
    const out = interpret(regions, [], { widthMetres: 30, aspect: H / W, outline: whole });
    const furnished = out.items.find((i) => Math.abs(i.box.x * W - 100) < 6 && Math.abs(i.box.y * H - 100) < 6);
    expect(furnished?.type).toBe('private_office');
    expect(furnished?.why).toMatch(/furnished/);
    // The empty room beside it is not given a type it cannot back up.
    const empty = out.items.find((i) => Math.abs(i.box.x * W - 260) < 6);
    expect(empty?.why ?? '').not.toMatch(/furnished/);
  });

  it('works out a size from several matching rooms when nothing is printed, and says it is a guess', () => {
    const s = new Sheet(W, H);
    s.frame(100, 100, 800, 150);
    for (const x of [300, 500, 700]) s.down(100, 250, x);
    for (let i = 0; i < 4; i++) pieces(s, 100 + i * 200, 100);
    const { regions } = detectRegions(s.bitmap());
    const guess = guessWidth(regions, [], H / W, whole);
    // 4 rooms of 200 x 150 px at 11 m² each is about 52 px to the metre, so 1200 px is about 23 m.
    expect(guess.basis).toBe('estimated');
    expect(guess.note).toMatch(/offices of about 11/);
    expect(guess.widthMetres).toBeGreaterThan(20);
    expect(guess.widthMetres).toBeLessThan(26);
  });

  it('leaves a small boxed space with drawing in it for the owner to name, rather than calling it a huddle room', () => {
    const s = new Sheet(W, H);
    s.frame(100, 100, 400, 300);
    s.frame(150, 150, 70, 80, 5); // a shaft, thick walls
    s.frame(158, 158, 54, 64, 4);
    const { regions } = detectRegions(s.bitmap());
    const out = interpret(regions, [], { widthMetres: 30, aspect: H / W, outline: whole });
    expect(out.items.some((i) => i.type === 'huddle_room')).toBe(false);
  });
});
