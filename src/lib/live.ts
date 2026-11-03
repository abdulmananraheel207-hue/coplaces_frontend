import { useEffect, useRef, useState } from 'react';
import type { AttendanceRow } from '../types';
import { isDeskKind } from './catalogue';
import type { SpaceItem } from './spaceState';

/** Extra facts the demo makes up, since a made-up member has no record to look them up in. */
export interface DemoInfo {
  email: string;
  phone: string;
  plan: string;
  booking: string;
  paid: boolean;
}

/** Someone in the building right now. */
export interface Presence {
  /** The check-in's id. */
  id: string;
  memberId: string;
  name: string;
  company: string;
  checkInAt: string;
  /** The space they checked in at; null when they came in at the door only. */
  resourceId: string | null;
  demo?: DemoInfo;
}

export const fromAttendance = (a: AttendanceRow): Presence => ({
  id: a.id,
  memberId: a.memberId,
  name: a.memberName,
  company: a.company,
  checkInAt: a.checkInAt,
  resourceId: a.resourceId,
});

const NAMES = ['Amara Okafor', 'Daniyal Shah', 'Sara Malik', 'Hamza Iqbal', 'Noor Fatima', 'Bilal Ahmed', 'Zainab Raza', 'Usman Tariq', 'Hira Anwar', 'Ali Hassan', 'Maryam Khan', 'Omar Farooq', 'Ayesha Siddiqui', 'Talha Mehmood', 'Iqra Nawaz', 'Farhan Butt', 'Sana Javed', 'Saad Qureshi', 'Mehwish Ali', 'Kamran Akbar'];
const COMPANIES = ['Orbit Labs', 'Lumen Studio', 'Pixel & Co', 'Northwind', 'Freelancer', 'Bluebird Digital', 'Kite Logistics', 'Freelancer'];
const PLANS = ['Hot desk monthly', 'Dedicated desk', 'Day pass', 'Team plan'];

/** The bookable places in a building: where a made-up member might sit. */
const places = (items: SpaceItem[]) => items.filter((i) => ['hot_desk', 'dedicated_desk', 'room', 'corporate_room', 'office'].includes(i.kind));

/**
 * Pretend members arriving, working and leaving, for showing a client how the live view behaves.
 * It is the real floor and the real animation; only the people are made up.
 */
export function useDemoPresence(items: SpaceItem[], running: boolean): Presence[] {
  const [people, setPeople] = useState<Presence[]>([]);
  const n = useRef(0);
  const leaves = useRef(new Map<string, number>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!running) {
      setPeople([]);
      leaves.current.clear();
      return;
    }
    const make = (taken: Set<string | null>, ago: number): Presence | null => {
      const all = places(itemsRef.current);
      // Mostly desks, now and then a room.
      const pool = all.filter((i) => !taken.has(i.id) && (Math.random() < 0.8 ? isDeskKind(i.kind) : !isDeskKind(i.kind)));
      const spot = pool[Math.floor(Math.random() * pool.length)] ?? all.find((i) => !taken.has(i.id));
      if (!spot) return null;
      const i = n.current++;
      const name = NAMES[i % NAMES.length]!;
      const id = `demo-${i}`;
      leaves.current.set(id, Date.now() + (25 + Math.random() * 55) * 1000 + ago);
      const hour = 9 + (i % 6);
      return {
        id,
        memberId: id,
        name,
        company: COMPANIES[i % COMPANIES.length]!,
        checkInAt: new Date(Date.now() - ago).toISOString(),
        resourceId: spot.id,
        demo: {
          email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
          phone: `0300 ${String(1000000 + ((i * 7919) % 8999999))}`,
          plan: PLANS[i % PLANS.length]!,
          booking: `${spot.name}, ${hour}:00 to ${hour + 4}:00`,
          paid: i % 5 !== 3,
        },
      };
    };

    // A few people already at work, so the floor is not empty when the demo starts.
    setPeople(() => {
      const taken = new Set<string | null>();
      const out: Presence[] = [];
      for (let k = 0; k < 4; k++) {
        const p = make(taken, (20 + k * 17) * 60_000);
        if (p) {
          taken.add(p.resourceId);
          out.push(p);
        }
      }
      return out;
    });

    const tick = setInterval(() => {
      setPeople((cur) => {
        const now = Date.now();
        const stay = cur.filter((p) => (leaves.current.get(p.id) ?? 0) > now);
        const want = Math.min(10, Math.max(4, Math.floor(places(itemsRef.current).length * 0.6)));
        if (stay.length < want && Math.random() < 0.7) {
          const p = make(new Set(stay.map((x) => x.resourceId)), 0);
          if (p) stay.push(p);
        }
        return stay.length === cur.length && stay.every((p, k) => p === cur[k]) ? cur : stay;
      });
    }, 2500);
    return () => clearInterval(tick);
  }, [running]);

  return people;
}
