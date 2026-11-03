import { describe, expect, it } from 'vitest';
import type { SpaceItem } from '../../lib/spaceState';
import { layoutFloors } from './layout';
import { findPath, gridOf, routeIn, spotFor } from './walk';

const desk = (id: string, x: number, z: number): SpaceItem => ({
  id,
  kind: 'hot_desk',
  style: '',
  name: id,
  floor: '',
  capacity: 1,
  amenities: '',
  plan: { x, z, rot: 0, w: null, d: null },
  tone: 'ok',
  status: '',
  bookable: true,
});

describe('walking', () => {
  const floor = layoutFloors([desk('a', 0, 0), desk('b', 6, 0), desk('c', 0, 6)])[0]!;

  it('seats a person on the chair side of a desk, facing it', () => {
    const p = floor.placed.find((x) => x.item.id === 'a')!;
    const s = spotFor(p);
    expect(s.sit).toBe(true);
    expect(s.at.z).toBeGreaterThan(p.z);
    // Facing the desk means facing -z for an unturned desk.
    expect(Math.cos(s.yaw)).toBeLessThan(-0.99);
  });

  it('walks from the door to every desk and ends on the seat', () => {
    const g = gridOf(floor);
    for (const p of floor.placed) {
      const spot = spotFor(p);
      const route = routeIn(floor, g, spot);
      expect(route.at(-1)).toEqual(spot.at);
      expect(route.length).toBeGreaterThan(1);
    }
  });

  it('goes round a desk instead of through it', () => {
    const g = gridOf(floor);
    const a = floor.placed.find((x) => x.item.id === 'a')!;
    const path = findPath(g, { x: a.x - 4, z: a.z }, { x: a.x + 4, z: a.z });
    expect(path.length).toBeGreaterThan(1);
  });
});
