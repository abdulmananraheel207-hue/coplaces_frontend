import { describe, expect, it } from 'vitest';
import { detectRegions } from './detect';
import { Sheet } from './sheet';
import type { Region } from './types';

const px = (r: Region, w: number, h: number) => ({ x: Math.round(r.box.x * w), y: Math.round(r.box.y * h), w: Math.round(r.box.w * w), h: Math.round(r.box.h * h) });
/** Whether a region's box is where it should be, within a few pixels. */
const at = (r: Region, w: number, h: number, want: { x: number; y: number; w: number; h: number }, tol = 4) => {
  const got = px(r, w, h);
  return (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(got[k] - want[k]) <= tol);
};
const find = (rs: Region[], w: number, h: number, want: { x: number; y: number; w: number; h: number }) => rs.find((r) => at(r, w, h, want));

describe('finding the shapes the walls make', () => {
  it('splits a building into its rooms and leaves the outside alone', () => {
    const s = new Sheet(1000, 800);
    s.frame(100, 100, 800, 600);
    s.down(100, 700, 500); // one partition down the middle
    s.across(100, 500, 400); // and the left side halved
    const { regions } = detectRegions(s.bitmap());
    expect(regions).toHaveLength(3);
    expect(find(regions, 1000, 800, { x: 100, y: 100, w: 400, h: 300 })).toBeTruthy();
    expect(find(regions, 1000, 800, { x: 100, y: 400, w: 400, h: 300 })).toBeTruthy();
    expect(find(regions, 1000, 800, { x: 500, y: 100, w: 400, h: 600 })).toBeTruthy();
  });

  it('is not put off by a doorway in a wall, inside or in the outer wall', () => {
    const s = new Sheet(1000, 800);
    s.across(100, 900, 100);
    s.across(100, 900, 700, 5, [[450, 520]]); // the front door
    s.down(100, 700, 100);
    s.down(100, 700, 900);
    s.down(100, 700, 500, 5, [[300, 360]]); // a door between the two rooms
    const { regions } = detectRegions(s.bitmap());
    expect(regions).toHaveLength(2);
    expect(find(regions, 1000, 800, { x: 100, y: 100, w: 400, h: 600 })).toBeTruthy();
    expect(find(regions, 1000, 800, { x: 500, y: 100, w: 400, h: 600 })).toBeTruthy();
  });

  it('keeps rooms apart when a short piece of wall sits between two doorways with nothing to hold it to the rest', () => {
    // Doors on both sides of a stub of corridor wall, and a door in the partition above it: the stub is an island.
    const s = new Sheet(1200, 800);
    s.frame(100, 100, 1000, 600);
    s.across(100, 1100, 300, 6, [
      [300, 340],
      [540, 580],
    ]);
    s.down(100, 300, 420, 6, [[180, 220]]);
    const { regions } = detectRegions(s.bitmap());
    const rooms = regions.filter((r) => r.box.w * 1200 > 150 && r.box.h * 800 > 150);
    expect(rooms).toHaveLength(3);
    expect(find(regions, 1200, 800, { x: 100, y: 100, w: 320, h: 200 })).toBeTruthy();
    expect(find(regions, 1200, 800, { x: 420, y: 100, w: 680, h: 200 })).toBeTruthy();
  });

  it('does not close the gaps between desks as if they were doorways', () => {
    const s = new Sheet(1200, 800);
    s.frame(100, 100, 1000, 600);
    // two rows of desks against the top wall, 20 px apart, touching the wall's neighbourhood
    for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) s.frame(150 + c * 90, 130 + r * 70, 70, 50, 3);
    const { regions } = detectRegions(s.bitmap());
    const floor = find(regions, 1200, 800, { x: 100, y: 100, w: 1000, h: 600 })!;
    expect(regions.filter((r) => r.parent === floor.id)).toHaveLength(16);
  });

  it('lets two rooms join when most of the wall between them is missing', () => {
    const s = new Sheet(1000, 800);
    s.frame(100, 100, 800, 600);
    s.down(100, 700, 500, 5, [[150, 600]]); // 450 of 600 pixels open: that is not a door
    const { regions } = detectRegions(s.bitmap());
    expect(regions).toHaveLength(1);
    expect(at(regions[0]!, 1000, 800, { x: 100, y: 100, w: 800, h: 600 })).toBe(true);
  });

  it('counts furniture inside a room as part of the room', () => {
    const s = new Sheet(1000, 800);
    s.frame(100, 100, 800, 600);
    s.frame(300, 300, 300, 120); // a table
    const { regions } = detectRegions(s.bitmap());
    const room = find(regions, 1000, 800, { x: 100, y: 100, w: 800, h: 600 })!;
    const table = find(regions, 1000, 800, { x: 300, y: 300, w: 300, h: 120 })!;
    expect(room).toBeTruthy();
    expect(room.fill).toBeGreaterThan(0.98);
    expect(table.parent).toBe(room.id);
    expect(room.parent).toBeNull();
  });

  it('finds every desk in a grid, each inside the open floor', () => {
    const s = new Sheet(1200, 800);
    s.frame(100, 100, 1000, 600);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) s.frame(300 + c * 90, 250 + r * 70, 70, 50, 3);
    const { regions } = detectRegions(s.bitmap());
    const floor = find(regions, 1200, 800, { x: 100, y: 100, w: 1000, h: 600 })!;
    expect(floor).toBeTruthy();
    const desks = regions.filter((r) => r.parent === floor.id);
    expect(desks).toHaveLength(18);
    expect(floor.fill).toBeGreaterThan(0.98);
  });

  it('works when the outer wall is drawn on the very edge of the picture', () => {
    const s = new Sheet(800, 600);
    s.frame(1, 1, 797, 597, 4);
    s.down(0, 600, 400);
    const { regions } = detectRegions(s.bitmap());
    expect(regions).toHaveLength(2);
  });

  it('treats a wall drawn as two lines as one wall, and finds the room between the faces', () => {
    const s = new Sheet(1000, 800);
    // 12 px thick walls drawn as two thin lines each
    const double = (x: number, y: number, w: number, h: number) => {
      s.frame(x - 6, y - 6, w + 12, h + 12, 2);
      s.frame(x + 6, y + 6, w - 12, h - 12, 2);
    };
    double(100, 100, 800, 600);
    const { regions } = detectRegions(s.bitmap());
    const room = regions.find((r) => r.box.w * 1000 > 700 && r.box.w * 1000 < 800);
    expect(room).toBeTruthy();
    expect(Math.abs(room!.box.w * 1000 - 788)).toBeLessThan(10);
  });

  it('reads a light-on-dark blueprint', () => {
    const s = new Sheet(1000, 800, 20, 235);
    s.frame(100, 100, 800, 600);
    s.down(100, 700, 500);
    const { regions } = detectRegions(s.bitmap());
    expect(regions).toHaveLength(2);
  });

  it('ignores text, hatching and door swings, which are not walls', () => {
    const s = new Sheet(1000, 800);
    s.frame(100, 100, 800, 600);
    for (let k = 0; k < 12; k++) s.scribble(150 + (k % 4) * 150, 150 + Math.floor(k / 4) * 100, 90);
    // a door swing drawn as short diagonal ticks
    for (let i = 0; i < 40; i++) s.fill(600 + i, 300 + i, 2, 2);
    const { regions } = detectRegions(s.bitmap());
    expect(regions).toHaveLength(1);
  });

  it('says so when there is nothing to find', () => {
    const blank = detectRegions(new Sheet(600, 400).bitmap());
    expect(blank.regions).toEqual([]);
    expect(blank.notes[0]).toBeTruthy();
    // walls with a missing side leak to the outside, so no room is closed
    const s = new Sheet(800, 600);
    s.across(100, 700, 100);
    s.down(100, 500, 100);
    s.down(100, 500, 700);
    expect(detectRegions(s.bitmap()).regions).toEqual([]);
  });

  it('does not take the margin of a framed drawing sheet for the building', () => {
    const s = new Sheet(1200, 900);
    s.frame(20, 20, 1160, 860, 3); // the sheet's border
    s.frame(200, 200, 700, 450); // the building
    s.down(200, 650, 550);
    const { regions } = detectRegions(s.bitmap());
    const sheet = find(regions, 1200, 900, { x: 20, y: 20, w: 1160, h: 860 })!;
    expect(sheet).toBeTruthy();
    const rooms = regions.filter((r) => r.parent === sheet.id);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
  });
});
