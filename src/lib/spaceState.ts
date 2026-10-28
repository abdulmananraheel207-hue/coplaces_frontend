import type { Resource, ResourceKind, ResourceStatus, Schedule } from '../types';
import { isRoomKind } from './catalogue';
import { money } from './format';
import { fmtTime, fromMinutes, minutesOfDay, toMinutes } from './time';

export type Tone = 'ok' | 'busy' | 'hold' | 'mine' | 'idle';

/** What a space that is not available is doing, in words. */
export const STATUS_WORD: Record<ResourceStatus, string> = {
  available: 'Available',
  maintenance: 'Under maintenance',
  cleaning: 'Being cleaned',
  reserved: 'Reserved',
  retired: 'Retired',
};

/** Where a space sits in the floor plan once it has been placed. Sizes are null until stretched. */
export interface Plan {
  x: number;
  z: number;
  /** Quarter turns, 0 to 3. */
  rot: number;
  w: number | null;
  d: number | null;
}

/** One room, desk or office as the 3D view and the list view both describe it. */
export interface SpaceItem {
  id: string;
  kind: ResourceKind;
  /** Stored style; empty means the default for its kind. */
  style: string;
  name: string;
  floor: string;
  capacity: number;
  amenities: string;
  /** Null until the space has been placed in the floor plan. */
  plan: Plan | null;
  tone: Tone;
  /** Short status, for example "Free until 14:00". */
  status: string;
  /** Who, when known: "Amara Okafor". */
  detail?: string;
  /** The booking occupying a room or desk right now, when there is one. */
  bookingId?: string;
  /** Next free start time, for rooms that are in use now. */
  freeFrom?: string;
  bookable: boolean;
  /** What it costs, when it has a price of its own: "Rs 2,000 an hour". */
  rate?: string;
  /** What members read before booking. */
  description?: string;
  /** The photos of it, in order. */
  photoIds?: string[];
  /** Its own opening hours, when they differ from the location's, like "10:00 to 16:00". */
  hours?: string;
}

export interface SpaceState {
  tone: Tone;
  label: string;
  detail?: string;
  bookingId?: string;
}

export function roomState(room: Resource, schedule: Schedule, at: Date): SpaceState {
  const tz = schedule.timezone;
  if (room.status !== 'available') return { tone: 'hold', label: STATUS_WORD[room.status] };
  const atMin = minutesOfDay(at.toISOString(), tz);
  if (atMin < toMinutes(schedule.openTime)) return { tone: 'idle', label: `Opens at ${schedule.openTime}` };
  if (atMin >= toMinutes(schedule.closeTime)) return { tone: 'idle', label: 'Closed for the day' };
  const mine = schedule.bookings.filter((b) => b.resourceId === room.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const iso = at.toISOString();
  const current = mine.find((b) => b.startsAt <= iso && b.endsAt > iso);
  if (current) {
    return {
      tone: current.mine ? 'mine' : 'busy',
      label: `${current.mine ? 'Yours' : 'In use'} until ${fmtTime(current.endsAt, tz)}`,
      detail: current.memberName,
      bookingId: current.id,
    };
  }
  const next = mine.find((b) => b.startsAt > iso);
  return next ? { tone: 'ok', label: `Free until ${fmtTime(next.startsAt, tz)}` } : { tone: 'ok', label: 'Free all day' };
}

/** A hot desk at a moment of the day. A desk can be booked for part of a day, so it may be free now and booked later. */
export function deskState(desk: Resource, schedule: Schedule, at: Date): SpaceState {
  if (desk.status !== 'available') return { tone: 'hold', label: STATUS_WORD[desk.status] };
  const tz = schedule.timezone;
  const iso = at.toISOString();
  const mine = schedule.bookings.filter((x) => x.resourceId === desk.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current = mine.find((b) => b.startsAt <= iso && b.endsAt > iso);
  if (current) {
    const who = current.mine ? 'Booked by you' : 'Booked';
    return { tone: current.mine ? 'mine' : 'busy', label: current.allDay ? who : `${who} until ${fmtTime(current.endsAt, tz)}`, detail: current.memberName, bookingId: current.id };
  }
  const sitting = schedule.inUse?.find((x) => x.resourceId === desk.id);
  if (sitting) return { tone: sitting.mine ? 'mine' : 'busy', label: sitting.mine ? 'You are here' : 'In use', detail: sitting.memberName };
  const next = mine.find((b) => b.startsAt > iso);
  if (next) return { tone: 'ok', label: `Free until ${fmtTime(next.startsAt, tz)}` };
  return { tone: 'ok', label: mine.length ? 'Free for the rest of the day' : 'Free all day' };
}

export function assignedState(r: Resource): SpaceState {
  if (r.status !== 'available') return { tone: 'hold', label: STATUS_WORD[r.status] };
  if (!r.occupied) return { tone: 'ok', label: 'Vacant' };
  return { tone: 'busy', label: r.kind === 'office' ? 'Let' : 'Assigned', detail: r.occupant?.company || r.occupant?.name };
}

export function stateOf(r: Resource, schedule: Schedule | undefined, at: Date): SpaceState {
  if (r.kind === 'dedicated_desk' || r.kind === 'office' || r.kind === 'storage') return assignedState(r);
  if (!schedule) return { tone: 'idle', label: 'Loading' };
  return isRoomKind(r.kind) ? roomState(r, schedule, at) : deskState(r, schedule, at);
}

export interface BuildOptions {
  /** Adds a price to rooms and hot desks. */
  currency?: string;
  /** Retired spaces are hidden from the 3D view; the list used for managing spaces still needs them. */
  includeRetired?: boolean;
}

function rateOf(r: Resource, currency: string | undefined) {
  if (!currency) return undefined;
  if (isRoomKind(r.kind)) return `${money(r.hourlyRateCents, currency)} an hour`;
  if (r.kind === 'hot_desk') return `${money(r.dailyRateCents, currency)} a day`;
  return undefined;
}

export function buildSpaceItems(resources: Resource[], schedule: Schedule | undefined, at: Date, options: BuildOptions = {}): SpaceItem[] {
  return resources
    .filter((r) => options.includeRetired || r.status !== 'retired')
    .map((r) => {
      const s = stateOf(r, schedule, at);
      return {
        id: r.id,
        kind: r.kind,
        style: r.style,
        name: r.name,
        floor: r.floor,
        capacity: r.capacity,
        amenities: r.amenities,
        plan: r.planX === null || r.planZ === null ? null : { x: r.planX, z: r.planZ, rot: r.planRot, w: r.planW, d: r.planD },
        tone: s.tone,
        status: s.label,
        detail: s.detail,
        bookingId: s.bookingId,
        bookable: (isRoomKind(r.kind) || r.kind === 'hot_desk') && r.status === 'available',
        rate: rateOf(r, options.currency),
        description: r.description,
        photoIds: r.photoIds,
        hours: r.openTime && r.closeTime ? `${r.openTime} to ${r.closeTime}` : undefined,
      };
    });
}

export const TONE_COLOR: Record<Tone, string> = {
  ok: '#0f7b5f',
  busy: '#b8381a',
  hold: '#e0ae0f',
  mine: '#2a55c7',
  idle: '#8a99ab',
};

/** The next half hour that is still inside opening hours, for prefilling a booking. */
export function nextSlot(schedule: Schedule | undefined, at: Date): string | undefined {
  if (!schedule) return undefined;
  const open = toMinutes(schedule.openTime);
  const close = toMinutes(schedule.closeTime);
  let m = Math.ceil(minutesOfDay(at.toISOString(), schedule.timezone) / 30) * 30;
  if (m < open || m > close - 30) m = open;
  return fromMinutes(m);
}
