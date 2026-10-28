import type { FloorObjectType, ObjectTint, ObjectVariant, ResourceKind } from '../types';

/**
 * Every kind of room, desk and amenity that can go on a floor plan: what it is called, how big it starts,
 * what a new one costs. The keys of `STYLES` match the server's, which validates them.
 */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface StyleDef {
  /** Stored on the resource. The first style of a kind is its default. */
  key: string;
  label: string;
  blurb: string;
  /** What a new one is called until the owner renames it: "Huddle Room 3". */
  prefix: string;
  capacity: number;
  /** Starting price in minor units, for rooms billed by the hour and desks billed by the day. */
  hourly?: number;
  daily?: number;
  /** Footprint in metres for a given number of seats. */
  size: (capacity: number) => { w: number; d: number };
}

const desk = (w: number, d: number) => () => ({ w, d });

export const STYLES: Record<ResourceKind, StyleDef[]> = {
  room: [
    { key: 'meeting', label: 'Meeting room', blurb: 'Glass room with a table', prefix: 'Meeting Room', capacity: 6, hourly: 200_000, size: (c) => ({ w: clamp(2.4 + c * 0.5, 2.9, 8.4), d: clamp(2.4 + c * 0.28, 2.9, 5.6) }) },
    { key: 'phone_booth', label: 'Phone booth', blurb: 'One-person soundproof pod', prefix: 'Phone Booth', capacity: 1, hourly: 80_000, size: desk(2.9, 2.9) },
    { key: 'huddle', label: 'Huddle room', blurb: 'Soft seating and a screen', prefix: 'Huddle Room', capacity: 4, hourly: 150_000, size: (c) => ({ w: clamp(3.2 + c * 0.4, 3.6, 6), d: clamp(2.6 + c * 0.25, 3, 4.6) }) },
    { key: 'training', label: 'Training room', blurb: 'Rows of seats facing a screen', prefix: 'Training Room', capacity: 12, hourly: 350_000, size: (c) => ({ w: clamp(4 + c * 0.35, 5.4, 10), d: clamp(3.5 + c * 0.25, 4.6, 8) }) },
    { key: 'studio', label: 'Podcast studio', blurb: 'Soundproofed, with mics and a mixing desk', prefix: 'Studio', capacity: 4, hourly: 250_000, size: (c) => ({ w: clamp(3 + c * 0.3, 3.6, 6), d: clamp(2.8 + c * 0.2, 3.4, 5) }) },
    { key: 'interview', label: 'Interview room', blurb: 'Small private room for hiring and calls', prefix: 'Interview Room', capacity: 3, hourly: 100_000, size: (c) => ({ w: clamp(2.6 + c * 0.3, 3, 4.4), d: 2.9 }) },
    { key: 'focus', label: 'Quiet focus room', blurb: 'One desk, silence and a door', prefix: 'Focus Room', capacity: 1, hourly: 90_000, size: desk(2.9, 2.9) },
    { key: 'video_call', label: 'Video-call room', blurb: 'Camera, screen and good light', prefix: 'Call Room', capacity: 4, hourly: 180_000, size: (c) => ({ w: clamp(3 + c * 0.35, 3.4, 5.6), d: clamp(2.6 + c * 0.2, 3, 4.2) }) },
  ],
  corporate_room: [
    { key: 'boardroom', label: 'Corporate boardroom', blurb: 'Long table for company meetings', prefix: 'Corporate Boardroom', capacity: 16, hourly: 900_000, size: (c) => ({ w: clamp(4 + c * 0.45, 7, 12), d: clamp(3 + c * 0.25, 5, 8) }) },
    { key: 'training_hall', label: 'Corporate training hall', blurb: 'Hall for events and training days', prefix: 'Corporate Hall', capacity: 30, hourly: 1_200_000, size: (c) => ({ w: clamp(5 + c * 0.2, 8, 14), d: clamp(4 + c * 0.15, 6, 10) }) },
    { key: 'event_hall', label: 'Event hall', blurb: 'Stage, screen and rows of seats', prefix: 'Event Hall', capacity: 80, hourly: 2_000_000, size: (c) => ({ w: clamp(7 + c * 0.1, 10, 18), d: clamp(5.5 + c * 0.07, 8, 12) }) },
  ],
  hot_desk: [
    { key: 'standard', label: 'Hot desk', blurb: 'Bookable desk with a monitor', prefix: 'Hot Desk', capacity: 1, daily: 150_000, size: desk(1.58, 1.49) },
    { key: 'standing', label: 'Standing hot desk', blurb: 'Height-adjustable, no chair', prefix: 'Standing Desk', capacity: 1, daily: 170_000, size: desk(1.58, 1.3) },
    { key: 'corner', label: 'Corner hot desk', blurb: 'L-shaped desk with more space', prefix: 'Corner Desk', capacity: 1, daily: 180_000, size: desk(1.95, 1.65) },
    { key: 'day_office', label: 'Day office', blurb: 'A private room booked for the day', prefix: 'Day Office', capacity: 3, daily: 450_000, size: (c) => ({ w: clamp(2.8 + c * 0.4, 3.4, 5.6), d: 3.2 }) },
  ],
  dedicated_desk: [
    { key: 'standard', label: 'Dedicated desk', blurb: 'Assigned to one member', prefix: 'Desk D', capacity: 1, size: desk(1.58, 1.49) },
    { key: 'standing', label: 'Standing dedicated desk', blurb: 'Assigned, height-adjustable', prefix: 'Standing Desk D', capacity: 1, size: desk(1.58, 1.3) },
    { key: 'corner', label: 'Corner dedicated desk', blurb: 'Assigned L-shaped desk', prefix: 'Corner Desk D', capacity: 1, size: desk(1.95, 1.65) },
    { key: 'team_pod', label: 'Team pod', blurb: 'Four desks together, rented as one', prefix: 'Team Pod', capacity: 4, size: desk(3.4, 3.2) },
  ],
  office: [
    { key: 'standard', label: 'Private office', blurb: 'Lockable room for a team', prefix: 'Office', capacity: 4, size: (c) => ({ w: clamp(3.4 + c * 0.5, 4.4, 8.4), d: clamp(3 + c * 0.25, 4.4, 6) }) },
    { key: 'executive', label: 'Executive office', blurb: 'Larger, with a sofa', prefix: 'Executive Office', capacity: 6, size: (c) => ({ w: clamp(4.4 + c * 0.5, 5.4, 9.4), d: clamp(4 + c * 0.25, 5.4, 7) }) },
  ],
  storage: [
    { key: 'locker', label: 'Locker', blurb: 'A lockable locker, rented monthly', prefix: 'Locker', capacity: 1, size: desk(0.9, 0.9) },
    { key: 'mailbox', label: 'Mailbox', blurb: 'A numbered mailbox for post', prefix: 'Mailbox', capacity: 1, size: desk(0.9, 0.9) },
    { key: 'parking', label: 'Parking spot', blurb: 'A marked bay for one car', prefix: 'Parking Bay', capacity: 1, size: desk(2.6, 5) },
  ],
};

export const isRoomKind = (kind: ResourceKind) => kind === 'room' || kind === 'corporate_room';
export const isDeskKind = (kind: ResourceKind) => kind === 'hot_desk' || kind === 'dedicated_desk';
export const isAssignedKind = (kind: ResourceKind) => kind === 'dedicated_desk' || kind === 'office' || kind === 'storage';

export const styleDef = (kind: ResourceKind, style: string): StyleDef => STYLES[kind].find((s) => s.key === style) ?? STYLES[kind][0]!;
/** The stored style, with the default spelled out. */
export const styleKey = (kind: ResourceKind, style: string) => styleDef(kind, style).key;
export const resourceLabel = (kind: ResourceKind, style: string) => styleDef(kind, style).label;
export const defaultSize = (kind: ResourceKind, style: string, capacity: number) => styleDef(kind, style).size(capacity);

export interface ObjectDef {
  label: string;
  blurb: string;
  /** The footprint it starts with. For a wall, a door or a window, the width is its length. */
  w: number;
  d: number;
  /** Whether the owner can stretch it. */
  resizable: boolean;
  /** The smallest and largest either side may be, when that differs from the editor's usual limits. */
  min?: { w: number; d: number };
  max?: { w: number; d: number };
  /** What the sides are called in the editor, when they are not width and depth. */
  sides?: { w: string; d: string };
  /** Shown on the 3D plan beside it, for wayfinding, until the owner types their own. */
  tag?: string;
  /** A plan import keeps it at its own size instead of stretching it to the shape drawn. */
  keepSize?: boolean;
  /** It hangs on a wall or is a flat marking, so it may sit over other things instead of beside them. */
  overlaps?: boolean;
}

const LONG = { w: 'Length', d: 'Thickness' };
const SLIM = { w: 0.1, d: 0.1 };

export const OBJECTS: Record<FloorObjectType, ObjectDef> = {
  kitchen: { label: 'Kitchen', blurb: 'Counter, sink and fridge', w: 4, d: 2.4, resizable: true },
  coffee_machine: { label: 'Coffee machine', blurb: 'Barista bar', w: 1.2, d: 0.8, resizable: true, keepSize: true },
  lounge: { label: 'Lounge', blurb: 'Sofas and a coffee table', w: 3.2, d: 2.4, resizable: true },
  print_station: { label: 'Print station', blurb: 'Printer and copier', w: 1.2, d: 0.8, resizable: true, keepSize: true },
  reception: { label: 'Reception desk', blurb: 'Front desk', w: 3, d: 1, resizable: true },
  plant: { label: 'Plant', blurb: 'Greenery', w: 0.8, d: 0.8, resizable: true, keepSize: true },
  core: { label: 'Lift and stairs', blurb: 'Service core', w: 3.4, d: 3, resizable: true },

  pantry: { label: 'Pantry', blurb: 'Tea point, kettle and sink', w: 3, d: 1.8, resizable: true },
  water_dispenser: { label: 'Water dispenser', blurb: 'Cooler with cups', w: 0.5, d: 0.5, resizable: true, min: { w: 0.4, d: 0.4 } },
  vending_machine: { label: 'Vending machine', blurb: 'Snacks and drinks', w: 1, d: 0.8, resizable: true, min: { w: 0.6, d: 0.6 } },
  recreation: { label: 'Recreation area', blurb: 'Table tennis or foosball', w: 3, d: 1.8, resizable: true },
  nap_pod: { label: 'Nap or wellness pod', blurb: 'A place to rest', w: 1.3, d: 2.4, resizable: true },
  phone_corner: { label: 'Phone-call corner', blurb: 'Standing nook for quick calls', w: 1.2, d: 1.2, resizable: true },
  library: { label: 'Library', blurb: 'Shelves and a reading chair', w: 2.6, d: 1, resizable: true },

  washroom_men: { label: 'Washroom (men)', blurb: 'Cubicles and basins', w: 2.8, d: 2.4, resizable: true, tag: 'Men' },
  washroom_women: { label: 'Washroom (women)', blurb: 'Cubicles and basins', w: 2.8, d: 2.4, resizable: true, tag: 'Women' },
  washroom_accessible: { label: 'Accessible washroom', blurb: 'Step-free, with grab rails', w: 2.2, d: 2.2, resizable: true, tag: 'Accessible' },
  prayer_room: { label: 'Prayer room', blurb: 'Quiet room with prayer mats', w: 3.2, d: 2.8, resizable: true, tag: 'Prayer room' },
  server_room: { label: 'Server or IT room', blurb: 'Racks, switches and the router', w: 2.4, d: 2, resizable: true, tag: 'IT room' },
  storage_room: { label: 'Storage room', blurb: 'Shelves and boxes', w: 2.4, d: 2, resizable: true, tag: 'Storage' },
  mail_room: { label: 'Mail and parcel room', blurb: 'Pigeonholes and a parcel shelf', w: 2.4, d: 1.8, resizable: true, tag: 'Parcels' },
  generator_room: { label: 'Generator or UPS room', blurb: 'Backup power', w: 2.8, d: 2.2, resizable: true, tag: 'Power' },
  security_desk: { label: 'Security desk', blurb: 'Guard post at the entrance', w: 1.8, d: 0.8, resizable: true, tag: 'Security' },

  fire_exit: { label: 'Fire exit', blurb: 'Exit door with its sign', w: 1.1, d: 0.3, resizable: true, min: { w: 0.8, d: 0.2 }, overlaps: true, tag: 'Fire exit' },
  extinguisher: { label: 'Fire extinguisher', blurb: 'Wall-mounted', w: 0.4, d: 0.4, resizable: false, overlaps: true },
  first_aid: { label: 'First aid', blurb: 'First-aid box', w: 0.6, d: 0.3, resizable: false, overlaps: true, tag: 'First aid' },

  terrace: { label: 'Terrace or balcony', blurb: 'Outdoor seating', w: 5, d: 3, resizable: true, tag: 'Terrace' },
  bike_rack: { label: 'Bike rack', blurb: 'Places to lock bicycles', w: 2, d: 0.7, resizable: true },

  wall: { label: 'Wall', blurb: 'A solid wall. Stretch it to length.', w: 4, d: 0.2, resizable: true, min: { w: 0.5, d: 0.1 }, max: { w: 60, d: 0.6 }, sides: LONG, overlaps: true },
  glass_wall: { label: 'Glass partition', blurb: 'A glass wall that lets light through', w: 4, d: 0.1, resizable: true, min: { w: 0.5, d: 0.1 }, max: { w: 60, d: 0.3 }, sides: LONG, overlaps: true },
  door: { label: 'Door', blurb: 'Place it in a wall', w: 1, d: 0.24, resizable: true, min: { w: 0.7, d: 0.1 }, max: { w: 3, d: 0.4 }, sides: { w: 'Width', d: 'Thickness' }, overlaps: true },
  window: { label: 'Window', blurb: 'Place it in a wall', w: 1.4, d: 0.24, resizable: true, min: { w: 0.5, d: 0.1 }, max: { w: 6, d: 0.4 }, sides: { w: 'Width', d: 'Thickness' }, overlaps: true },
  column: { label: 'Column', blurb: 'A structural pillar', w: 0.5, d: 0.5, resizable: true, min: SLIM, max: { w: 2, d: 2 }, overlaps: true },
  zone: { label: 'Zone', blurb: 'A coloured area, such as a quiet zone. Can be L-shaped.', w: 6, d: 5, resizable: true, min: { w: 1, d: 1 }, max: { w: 60, d: 60 }, overlaps: true },
  label: { label: 'Text label', blurb: 'A name on the plan', w: 1.6, d: 0.6, resizable: false, overlaps: true },
};

export const OBJECT_TYPES = Object.keys(OBJECTS) as FloorObjectType[];

/** The things that make up a building's shell, drawn on every floor and never booked. */
export const STRUCTURE_TYPES: FloorObjectType[] = ['wall', 'glass_wall', 'door', 'window', 'column', 'zone', 'label'];

/** Whether a thing may sit over other things (a door in a wall, a zone under rooms) instead of beside them. */
export const mayOverlap = (type: FloorObjectType) => !!OBJECTS[type].overlaps;

/** The words on the 3D plan beside an object: what the owner typed, or the default for its kind. */
export const tagOf = (type: FloorObjectType, label: string) => label.trim() || OBJECTS[type].tag || '';

/** The ways a door or a zone can be made, for the editor's choice. */
export const VARIANTS: Partial<Record<FloorObjectType, { value: ObjectVariant; label: string }[]>> = {
  door: [
    { value: '', label: 'Single door' },
    { value: 'double', label: 'Double door' },
    { value: 'sliding', label: 'Sliding door' },
  ],
  zone: [
    { value: '', label: 'Rectangle' },
    { value: 'l', label: 'L-shape' },
  ],
};

/** The colour washes of a zone, and the colour each draws in. Soft, so rooms drawn over them still read. */
export const TINTS: { value: ObjectTint; label: string; color: string }[] = [
  { value: '', label: 'Grey blue', color: '#d7e0ea' },
  { value: 'blue', label: 'Blue', color: '#c5d8f2' },
  { value: 'green', label: 'Green', color: '#cde7d9' },
  { value: 'yellow', label: 'Yellow', color: '#f4e7b0' },
  { value: 'rose', label: 'Rose', color: '#f0cfd0' },
  { value: 'slate', label: 'Slate', color: '#c6ccd6' },
];

export type PaletteEntry =
  | { id: string; type: 'resource'; kind: ResourceKind; style: string; label: string; blurb: string }
  | { id: string; type: 'object'; object: FloorObjectType; label: string; blurb: string };

const fromStyles = (kind: ResourceKind): PaletteEntry[] => STYLES[kind].map((s) => ({ id: `${kind}:${s.key}`, type: 'resource', kind, style: s.key, label: s.label, blurb: s.blurb }));
const fromObjects = (...types: FloorObjectType[]): PaletteEntry[] => types.map((o) => ({ id: `object:${o}`, type: 'object' as const, object: o, label: OBJECTS[o].label, blurb: OBJECTS[o].blurb }));

/** What the editor offers, in groups. */
export const PALETTE: { title: string; entries: PaletteEntry[] }[] = [
  { title: 'Meeting rooms', entries: fromStyles('room') },
  { title: 'Corporate rooms', entries: fromStyles('corporate_room') },
  { title: 'Offices', entries: fromStyles('office') },
  { title: 'Hot desks and day offices', entries: fromStyles('hot_desk') },
  { title: 'Dedicated desks and pods', entries: fromStyles('dedicated_desk') },
  { title: 'Lockers, mailboxes and parking', entries: fromStyles('storage') },
  { title: 'Amenities', entries: fromObjects('kitchen', 'pantry', 'coffee_machine', 'water_dispenser', 'vending_machine', 'lounge', 'recreation', 'library', 'nap_pod', 'phone_corner', 'print_station', 'reception', 'plant') },
  { title: 'Facilities', entries: fromObjects('washroom_men', 'washroom_women', 'washroom_accessible', 'prayer_room', 'server_room', 'storage_room', 'mail_room', 'generator_room', 'security_desk', 'core') },
  { title: 'Safety', entries: fromObjects('fire_exit', 'extinguisher', 'first_aid') },
  { title: 'Outdoors', entries: fromObjects('terrace', 'bike_rack') },
  { title: 'Walls, doors and zones', entries: fromObjects('wall', 'glass_wall', 'door', 'window', 'column', 'zone', 'label') },
];

/** The next free name like "Huddle Room 3", given every name already used at the location. */
export function nextName(prefix: string, taken: Iterable<string>) {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  for (let i = 1; ; i++) {
    const name = `${prefix}${prefix.endsWith('D') ? '' : ' '}${i}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}

/** What a space can offer, to tick instead of typing. The stored value is the labels joined with commas. */
export const AMENITY_OPTIONS = [
  'Projector',
  'Whiteboard',
  'TV screen',
  'Video-call kit',
  'Speakerphone',
  'Wi-Fi',
  'Power sockets',
  'Air conditioning',
  'Natural light',
  'Soundproof',
  'Standing desk',
  'Monitor',
  'Printer access',
  'Tea and coffee',
  'Wheelchair accessible',
] as const;

/** A comma-separated amenity string as a list. */
export const amenityList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
/** A list as the stored string, without repeats. */
export const joinAmenities = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].join(', ');
