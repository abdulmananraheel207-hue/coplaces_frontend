import type { FloorObjectType, Frac, ResourceKind } from '../../types';

/**
 * Reading a floor plan without sending it anywhere. A picture is turned into regions (the closed shapes the
 * walls make) in `detect.ts`, then `interpret.ts` decides, given the building's real size, which are rooms,
 * which are desks and which are amenities. Everything is measured in fractions of the picture until a scale
 * is known, so changing the scale never means looking at the pixels again.
 */

/** Pixels in the order a canvas gives them: red, green, blue, alpha. */
export interface Bitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** A piece of text found on the plan, with its middle and size as fractions of the picture. */
export interface Word {
  text: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** A closed shape the walls make: a room, a desk, a table, a corridor or the wall itself. */
export interface Region {
  id: number;
  /** Between the middle lines of the walls around it. */
  box: Frac;
  /** How much of its box it fills once anything inside it (tables, desks) is counted: 1 is a clean rectangle. */
  fill: number;
  /** How much of its inside is drawing (furniture, fittings), 0 to 1. An empty room is near 0, a furnished office well above. */
  ink?: number;
  /** The smallest region that surrounds this one, if any. */
  parent: number | null;
}

export interface Detection {
  regions: Region[];
  /** What the building's own walls cover, without the sheet's border and title block. Absent when it could not be told. */
  extent?: Frac;
  notes: string[];
}

export const ROOM_TYPES = {
  meeting_room: { kind: 'room', style: 'meeting' },
  phone_booth: { kind: 'room', style: 'phone_booth' },
  huddle_room: { kind: 'room', style: 'huddle' },
  training_room: { kind: 'room', style: 'training' },
  boardroom: { kind: 'corporate_room', style: 'boardroom' },
  training_hall: { kind: 'corporate_room', style: 'training_hall' },
  private_office: { kind: 'office', style: 'standard' },
  executive_office: { kind: 'office', style: 'executive' },
} as const satisfies Record<string, { kind: ResourceKind; style: string }>;

export type RoomType = keyof typeof ROOM_TYPES;
export const ROOM_TYPE_KEYS = Object.keys(ROOM_TYPES) as RoomType[];

export const AMENITY_TYPES: FloorObjectType[] = ['kitchen', 'coffee_machine', 'lounge', 'print_station', 'reception', 'plant', 'core'];

/** What a found shape can be called. "desks" is a block of desks, and "skip" leaves it out. */
export type ItemType = RoomType | FloorObjectType | 'desks' | 'skip';

export interface Item {
  id: string;
  type: ItemType;
  /** Text read from the plan, or empty. */
  label: string;
  box: Frac;
  /** Blocks of desks only. */
  rows?: number;
  columns?: number;
  /** Where each desk of the block was found. */
  members?: Frac[];
  /** Quarter turns, like the plan's: 0 puts the chair at the bottom of the picture. */
  rot?: number;
  /** Why it was called that, in a few words. */
  why: string;
}
