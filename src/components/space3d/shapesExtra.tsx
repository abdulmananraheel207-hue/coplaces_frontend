import { useMemo } from 'react';
import * as THREE from 'three';
import { styleKey, TINTS } from '../../lib/catalogue';
import type { SpaceItem, Tone } from '../../lib/spaceState';
import type { FloorObjectType } from '../../types';
import { wallHeight, type Placed, type PlacedObject } from './layout';
import { Chair, DeskShape, Inlay, ObjectShape, Panes, Part, Plant, Rows, RoomShape, Sofa, Stool, Table } from './shapes';
import { M, cube, cyl, fill, lampMat, mk, rbox, ring, ringMat, sphere } from './three-kit';

/**
 * Everything added after the first models: the newer kinds of room and desk, lockers and parking, the facilities, the safety
 * markings, and the walls, doors and zones that make up a building's shell. The earlier models in shapes.tsx are untouched;
 * the scene asks `ResourceBody` and `ObjectBody` which model to draw, and they hand the old kinds straight back to them.
 */

type V3 = [number, number, number];

// A handful of materials on top of the shared ones. Colours come from the portal's palette: ink, signal, and the status colours.
const X = {
  red: mk('#b8381a', { roughness: 0.5 }),
  green: mk('#0f7b5f', { roughness: 0.55 }),
  exit: new THREE.MeshBasicMaterial({ color: '#25b583' }),
  onAir: new THREE.MeshBasicMaterial({ color: '#ff5a3c' }),
  felt: mk('#1f5f84', { roughness: 0.9 }),
  mat: mk('#3d7a68', { roughness: 1 }),
  deck: mk('#c3cad3', { roughness: 0.95 }),
  wall: mk('#f3f6f9', { roughness: 0.9 }),
  skirt: mk('#c9d1db', { roughness: 0.8 }),
  blue: mk('#2a55c7', { roughness: 0.5 }),
  led: new THREE.MeshBasicMaterial({ color: '#7dffb0' }),
  line: mk('#f4f6f8', { roughness: 0.8 }),
  asphalt: mk('#9aa6b4', { roughness: 1 }),
};
const BOOKS = [mk('#14263f'), mk('#2a55c7'), mk('#f6c324'), mk('#b8381a'), mk('#0f7b5f'), mk('#dfe5eb')];

const tonePaint = (t: Tone) => (t === 'busy' ? X.red : t === 'mine' ? X.blue : t === 'hold' ? M.signal : t === 'ok' ? X.green : M.steel);

// ---------------------------------------------------------------------------------------------
// Which model draws what

const EXTRA_ROOMS = new Set(['room:studio', 'room:interview', 'room:focus', 'room:video_call', 'corporate_room:event_hall', 'hot_desk:day_office']);

/** Whether a space is drawn by a model in this file rather than by the original room and desk models. */
export const isExtraResource = (i: Pick<SpaceItem, 'kind' | 'style'>) => i.kind === 'storage' || (i.kind === 'dedicated_desk' && styleKey(i.kind, i.style) === 'team_pod') || EXTRA_ROOMS.has(`${i.kind}:${styleKey(i.kind, i.style)}`);

/** How tall a space stands, for its click box and its tag. Null for the original kinds. */
export function extraHeight(i: Pick<SpaceItem, 'kind' | 'style'>): number | null {
  const style = styleKey(i.kind, i.style);
  if (i.kind === 'storage') return style === 'parking' ? 0.7 : style === 'mailbox' ? 1.3 : 1.85;
  if (i.kind === 'hot_desk' && style === 'day_office') return 2.05;
  if (i.kind === 'dedicated_desk' && style === 'team_pod') return 1.45;
  return null;
}

const OBJECT_HEIGHT: Record<FloorObjectType, number> = {
  kitchen: 1.9, coffee_machine: 1.5, lounge: 1.0, print_station: 1.3, reception: 1.4, plant: 1.5, core: 2.2,
  pantry: 1.5, water_dispenser: 1.1, vending_machine: 1.9, recreation: 0.9, nap_pod: 1.2, phone_corner: 1.6, library: 1.9,
  washroom_men: 1.9, washroom_women: 1.9, washroom_accessible: 1.9, prayer_room: 1.9, server_room: 1.9, storage_room: 1.9, mail_room: 1.9, generator_room: 1.9, security_desk: 1.3,
  fire_exit: 2.2, extinguisher: 0.8, first_aid: 1.4,
  terrace: 1.3, bike_rack: 1.0,
  wall: 2.15, glass_wall: 1.95, door: 2.1, window: 1.9, column: 2.2, zone: 0.3, label: 0.3,
};
export const objectHeight = (t: FloorObjectType) => OBJECT_HEIGHT[t];

// ---------------------------------------------------------------------------------------------
// Rooms and desks

function Shell({ p, h, frosted, door }: { p: Placed; h: number; frosted: boolean; door: number }) {
  const { w, d, item } = p;
  return (
    <>
      <Inlay w={w - 0.08} d={d - 0.08} tone={item.tone} />
      <Panes w={w} d={d} h={h} door={door} frosted={frosted} />
      <Part geometry={rbox(door * 0.8, 0.07, 0.05, 0.02)} material={lampMat(item.tone)} position={[0, h - 0.13, d / 2 - 0.03]} castShadow={false} />
      <Part geometry={cube(door, 0.02, 0.1)} material={M.signal} position={[0, 0.03, d / 2 - 0.05]} castShadow={false} />
    </>
  );
}

const lit = (t: Tone) => t === 'busy' || t === 'mine';

function Screen({ w, h, y, z, on }: { w: number; h: number; y: number; z: number; on: boolean }) {
  return (
    <>
      <Part geometry={rbox(w + 0.06, h + 0.06, 0.05, 0.02)} material={M.ink} position={[0, y, z]} />
      <Part geometry={cube(w, h, 0.004)} material={on ? M.screenOn : M.screenOff} position={[0, y, z + 0.027]} castShadow={false} />
    </>
  );
}

function Studio({ p }: { p: Placed }) {
  const { w, d, item } = p;
  const on = lit(item.tone);
  const n = Math.min(item.capacity, 4);
  const tw = Math.min(2.2, w * 0.55);
  return (
    <>
      <Shell p={p} h={wallHeight('room')} frosted door={Math.min(1.1, w * 0.3)} />
      {/* Acoustic panels on the three closed walls */}
      {[-1, 0, 1].map((k) => (
        <Part key={`b${k}`} geometry={rbox(0.9, 0.9, 0.07, 0.03)} material={M.fabric} position={[k * 1.05, 1.0, -d / 2 + 0.1]} />
      ))}
      {[-1, 1].map((s) =>
        [-0.5, 0.5].map((k) => <Part key={`s${s}${k}`} geometry={rbox(0.07, 0.9, 0.9, 0.03)} material={M.fabric} position={[s * (w / 2 - 0.1), 1.0, k * 1.05]} />),
      )}
      {/* Table with a mic on an arm at every seat */}
      <Table w={tw} d={0.95} position={[0, 0, -0.1]} />
      {Array.from({ length: n }).map((_, i) => {
        const x = n === 1 ? 0 : -tw / 2 + 0.45 + (i * (tw - 0.9)) / (n - 1);
        return (
          <group key={i}>
            <Part geometry={cyl(0.012, 0.012, 0.42)} material={M.steel} position={[x, 0.98, -0.34]} />
            <Part geometry={cyl(0.03, 0.03, 0.1)} material={M.ink} position={[x, 1.24, -0.34]} />
            <Part geometry={sphere(0.04)} material={M.steel} position={[x, 1.31, -0.34]} />
            <Chair position={[x, 0, i % 2 ? 0.62 : 0.62]} />
          </group>
        );
      })}
      {/* Mixing desk and monitors */}
      <Part geometry={rbox(Math.min(1.7, w * 0.45), 0.8, 0.5, 0.03)} material={M.ink} position={[w / 2 - 1.15, 0.4, d / 2 - 0.85]} />
      <Part geometry={rbox(Math.min(1.5, w * 0.4), 0.05, 0.55, 0.02)} material={M.white} position={[w / 2 - 1.15, 0.82, d / 2 - 0.85]} />
      {[-0.4, -0.13, 0.13, 0.4].map((k) => (
        <Part key={k} geometry={cube(0.03, 0.02, 0.14)} material={M.signal} position={[w / 2 - 1.15 + k, 0.86, d / 2 - 0.8]} castShadow={false} />
      ))}
      <Screen w={0.7} h={0.38} y={1.2} z={-d / 2 + 0.3} on={on} />
      {/* On-air light */}
      <Part geometry={rbox(0.5, 0.14, 0.05, 0.02)} material={on ? X.onAir : M.ink} position={[0, wallHeight('room') - 0.3, d / 2 - 0.08]} castShadow={false} />
    </>
  );
}

function Interview({ p }: { p: Placed }) {
  const { w, d, item } = p;
  return (
    <>
      <Shell p={p} h={wallHeight('room')} frosted={false} door={Math.min(1.1, w * 0.34)} />
      <Table w={Math.min(1.5, w * 0.5)} d={0.8} position={[0, 0, -0.1]} />
      <Chair position={[-0.4, 0, -0.62]} rotation={Math.PI} />
      <Chair position={[0.4, 0, 0.5]} />
      <Chair position={[-w / 2 + 0.55, 0, 0.5]} rotation={Math.PI / 2} />
      <Plant position={[w / 2 - 0.4, 0, -d / 2 + 0.4]} scale={0.8} />
      <Part geometry={rbox(0.5, 0.01, 0.34, 0.005)} material={M.mist} position={[0.4, 0.8, 0.0]} />
      {lit(item.tone) && <Part geometry={sphere(0.05)} material={M.signal} position={[-0.4, 0.84, -0.1]} castShadow={false} />}
    </>
  );
}

function Focus({ p }: { p: Placed }) {
  const { w, d, item } = p;
  return (
    <>
      <Shell p={p} h={wallHeight('room')} frosted door={Math.min(1.05, w * 0.34)} />
      <group position={[0, 0, -d / 2 + 0.6]}>
        <Part geometry={rbox(1.5, 0.05, 0.7, 0.02)} material={M.white} position-y={0.75} />
        <Part geometry={cube(0.05, 0.73, 0.64)} material={M.ink} position={[-0.7, 0.37, 0]} />
        <Part geometry={cube(0.05, 0.73, 0.64)} material={M.ink} position={[0.7, 0.37, 0]} />
        <Part geometry={rbox(0.5, 0.3, 0.025, 0.012)} material={M.ink} position={[0, 1.06, -0.2]} />
        <Part geometry={cube(0.44, 0.24, 0.004)} material={lit(item.tone) ? M.screenOn : M.screenOff} position={[0, 1.06, -0.1865]} castShadow={false} />
        <Part geometry={cyl(0.012, 0.012, 0.4)} material={M.steel} position={[0.55, 0.98, -0.1]} />
        <Part geometry={sphere(0.07)} material={M.signal} position={[0.55, 1.2, -0.1]} castShadow={false} />
        <Chair position={[0, 0, 0.55]} />
      </group>
    </>
  );
}

function VideoCall({ p }: { p: Placed }) {
  const { w, d, item } = p;
  const on = lit(item.tone);
  const n = Math.min(item.capacity, 6);
  return (
    <>
      <Shell p={p} h={wallHeight('room')} frosted={false} door={Math.min(1.2, w * 0.32)} />
      <Screen w={Math.min(2, w * 0.55)} h={0.95} y={1.2} z={-d / 2 + 0.12} on={on} />
      {/* Camera and a ring light under the screen */}
      <Part geometry={rbox(0.3, 0.07, 0.08, 0.02)} material={M.ink} position={[0, 0.68 + 0.38, -d / 2 + 0.2]} />
      <Part material={M.signal} position={[0, 1.15, -d / 2 + 0.22]} rotation-x={0} castShadow={false}>
        <torusGeometry args={[0.1, 0.012, 8, 24]} />
      </Part>
      <Table w={Math.min(2.2, w * 0.6)} d={0.9} position={[0, 0, 0.35]} />
      {Array.from({ length: n }).map((_, i) => (
        <Chair key={i} position={[(i % 3 === 0 ? -0.6 : i % 3 === 1 ? 0 : 0.6) * (n > 3 ? 1 : 0.8), 0, 0.35 + (i < 3 ? 0.62 : -0.62)]} rotation={i < 3 ? 0 : Math.PI} />
      ))}
    </>
  );
}

function EventHall({ p }: { p: Placed }) {
  const { w, d, item } = p;
  const on = lit(item.tone);
  const n = Math.min(item.capacity, 140);
  const dx = 0.62;
  const cols = Math.max(6, Math.min(24, Math.floor((w - 1.6) / dx)));
  const rows = Math.ceil(n / cols);
  const x0 = -((cols - 1) * dx) / 2;
  return (
    <>
      <Shell p={p} h={wallHeight('corporate_room')} frosted door={Math.min(2.4, w * 0.2)} />
      <Part geometry={rbox(w * 0.78, 0.4, 2.2, 0.05)} material={M.mist} position={[0, 0.2, -d / 2 + 1.35]} />
      <Part geometry={cube(w * 0.78, 0.03, 0.06)} material={M.signal} position={[0, 0.41, -d / 2 + 2.4]} castShadow={false} />
      <Screen w={w * 0.5} h={1.7} y={1.5} z={-d / 2 + 0.18} on={on} />
      <Part geometry={rbox(0.5, 1.1, 0.4, 0.03)} material={M.ink} position={[w * 0.22, 0.95, -d / 2 + 1.7]} />
      <Part geometry={sphere(0.05)} material={M.steel} position={[w * 0.22, 1.55, -d / 2 + 1.7]} />
      <Rows cols={cols} rows={rows} x0={x0} z0={-d / 2 + 3.5} dx={dx} dz={0.72} count={n} scale={0.78} />
    </>
  );
}

function DayOffice({ p }: { p: Placed }) {
  const { w, d, item } = p;
  const desks = Math.min(3, Math.max(1, item.capacity));
  return (
    <>
      <Shell p={p} h={2.05} frosted door={Math.min(1.2, w * 0.3)} />
      {Array.from({ length: desks }).map((_, i) => {
        const x = desks === 1 ? 0 : -w / 2 + 1 + (i * (w - 2)) / (desks - 1);
        return (
          <group key={i} position={[x, 0, -d / 2 + 0.95]}>
            <Part geometry={rbox(1.15, 0.05, 0.62, 0.025)} material={M.white} position-y={0.74} />
            <Part geometry={cube(0.05, 0.72, 0.56)} material={M.ink} position={[-0.52, 0.36, 0]} />
            <Part geometry={cube(0.05, 0.72, 0.56)} material={M.ink} position={[0.52, 0.36, 0]} />
            <Part geometry={rbox(0.44, 0.27, 0.025, 0.012)} material={M.ink} position={[0, 1.04, -0.2]} />
            <Part geometry={cube(0.4, 0.22, 0.004)} material={lit(item.tone) ? M.screenOn : M.screenOff} position={[0, 1.04, -0.186]} castShadow={false} />
            <Chair position={[0, 0, 0.5]} />
          </group>
        );
      })}
      <Plant position={[w / 2 - 0.4, 0, d / 2 - 0.9]} scale={0.8} />
      <Part geometry={rbox(0.9, 0.7, 0.4, 0.03)} material={M.ink} position={[w / 2 - 0.6, 0.35, -d / 2 + 0.3]} />
    </>
  );
}

/** Four desks backed together, the way the open floor lays them out, rented as one. */
function TeamPod({ p }: { p: Placed }) {
  const slot = { w: 1.58, d: 1.49 };
  const one = (k: number) => ({ ...p, w: slot.w, d: slot.d, item: { ...p.item, id: `${p.item.id}/${k}` } });
  return (
    <group>
      {[0, 1, 2, 3].map((k) => {
        const back = k < 2;
        const x = (k % 2 === 0 ? -1 : 1) * (slot.w / 2 + 0.02);
        const z = back ? -(slot.d / 2 + 0.02) : slot.d / 2 + 0.02;
        return (
          <group key={k} position={[x, 0, z]} rotation-y={back ? Math.PI : 0}>
            <DeskShape p={one(k)} />
          </group>
        );
      })}
      <Part geometry={rbox(0.05, 0.3, 2.9, 0.02)} material={M.glass} position={[0, 0.9, 0]} castShadow={false} renderOrder={2} />
    </group>
  );
}

function Locker({ p }: { p: Placed }) {
  const { item } = p;
  return (
    <group>
      <Inlay w={0.8} d={0.8} tone={item.tone} />
      <Part geometry={rbox(0.62, 1.75, 0.5, 0.03)} material={M.core} position-y={0.9} />
      {[0.43, 1.33].map((y, i) => (
        <group key={i}>
          <Part geometry={rbox(0.54, 0.8, 0.03, 0.015)} material={M.steel} position={[0, y + 0.05, 0.26]} />
          <Part geometry={cube(0.3, 0.03, 0.01)} material={M.ink} position={[0, y + 0.3, 0.28]} castShadow={false} />
          <Part geometry={cube(0.03, 0.14, 0.03)} material={M.ink} position={[0.2, y + 0.05, 0.29]} />
        </group>
      ))}
      <Part geometry={rbox(0.2, 0.09, 0.02, 0.01)} material={tonePaint(item.tone)} position={[0, 1.7, 0.27]} castShadow={false} />
    </group>
  );
}

function Mailbox({ p }: { p: Placed }) {
  const { item } = p;
  return (
    <group>
      <Inlay w={0.8} d={0.8} tone={item.tone} />
      <Part geometry={cyl(0.03, 0.03, 0.9)} material={M.steel} position-y={0.45} />
      <Part geometry={rbox(0.5, 0.36, 0.34, 0.05)} material={M.ink} position-y={1.05} />
      <Part geometry={cube(0.3, 0.025, 0.02)} material={M.mist} position={[0, 1.08, 0.175]} castShadow={false} />
      <Part geometry={cube(0.02, 0.18, 0.03)} material={tonePaint(item.tone)} position={[0.27, 1.14, 0]} />
      <Part geometry={rbox(0.14, 0.07, 0.01, 0.005)} material={M.signal} position={[0, 0.98, 0.175]} castShadow={false} />
    </group>
  );
}

function Parking({ p }: { p: Placed }) {
  const { w, d, item } = p;
  const taken = item.tone === 'busy' || item.tone === 'mine';
  return (
    <group>
      <Part geometry={fill(w - 0.05, d - 0.05, 0.1, 0.02)} material={X.asphalt} castShadow={false} />
      {[-1, 1].map((s) => (
        <Part key={s} geometry={cube(0.08, 0.012, d - 0.2)} material={X.line} position={[s * (w / 2 - 0.12), 0.026, 0]} castShadow={false} />
      ))}
      <Part geometry={rbox(w - 0.7, 0.1, 0.16, 0.03)} material={M.signal} position={[0, 0.06, -d / 2 + 0.5]} />
      {taken ? (
        <group position-y={0.02}>
          <Part geometry={rbox(w - 0.8, 0.5, d - 1.1, 0.12)} material={tonePaint(item.tone)} position-y={0.4} />
          <Part geometry={rbox(w - 1.0, 0.4, d * 0.42, 0.1)} material={M.glass} position={[0, 0.82, -0.1]} castShadow={false} renderOrder={2} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Part key={`${sx}${sz}`} geometry={cyl(0.16, 0.16, 0.12)} material={M.ink} rotation-z={Math.PI / 2} position={[sx * (w / 2 - 0.34), 0.2, sz * (d * 0.28)]} />))}
        </group>
      ) : (
        <Part geometry={cube(0.08, 0.012, 0.6)} material={M.signal} position={[0, 0.026, 0.2]} castShadow={false} />
      )}
    </group>
  );
}

const STYLES_BY: Record<string, (p: { p: Placed }) => React.JSX.Element> = {
  'room:studio': Studio,
  'room:interview': Interview,
  'room:focus': Focus,
  'room:video_call': VideoCall,
  'corporate_room:event_hall': EventHall,
  'hot_desk:day_office': DayOffice,
  'dedicated_desk:team_pod': TeamPod,
  'storage:locker': Locker,
  'storage:mailbox': Mailbox,
  'storage:parking': Parking,
};

/** Draws a room, desk, office or storage space, with the new models for the new styles and the original ones for the rest. */
export function ResourceBody({ p }: { p: Placed }) {
  const Extra = STYLES_BY[`${p.item.kind}:${styleKey(p.item.kind, p.item.style)}`];
  if (Extra) return <Extra p={p} />;
  return p.item.kind === 'hot_desk' || p.item.kind === 'dedicated_desk' ? <DeskShape p={p} /> : <RoomShape p={p} />;
}

// ---------------------------------------------------------------------------------------------
// Things that are not booked

const Floor = ({ w, d, material, h = 0.02, r = 0.1 }: { w: number; d: number; material: THREE.Material; h?: number; r?: number }) => <Part geometry={fill(w, d, r, h)} material={material} castShadow={false} />;

/** Walls round three sides of a facility, with the front left open for the door. */
function Closet({ w, d, door = 0.9, glass = false }: { w: number; d: number; door?: number; glass?: boolean }) {
  const h = 1.9;
  const side = (w - door) / 2;
  const mat = glass ? M.frost : X.wall;
  return (
    <group>
      <Part geometry={cube(w, h, 0.07)} material={mat} position={[0, h / 2, -d / 2 + 0.035]} />
      <Part geometry={cube(0.07, h, d)} material={mat} position={[-w / 2 + 0.035, h / 2, 0]} />
      <Part geometry={cube(0.07, h, d)} material={mat} position={[w / 2 - 0.035, h / 2, 0]} />
      {side > 0.1 && (
        <>
          <Part geometry={cube(side, h, 0.07)} material={mat} position={[-(door + side) / 2, h / 2, d / 2 - 0.035]} />
          <Part geometry={cube(side, h, 0.07)} material={mat} position={[(door + side) / 2, h / 2, d / 2 - 0.035]} />
        </>
      )}
      <Part geometry={cube(w, 0.04, 0.09)} material={M.ink} position={[0, h, -d / 2 + 0.04]} />
      <Part geometry={cube(0.09, 0.04, d)} material={M.ink} position={[-w / 2 + 0.04, h, 0]} />
      <Part geometry={cube(0.09, 0.04, d)} material={M.ink} position={[w / 2 - 0.04, h, 0]} />
      <Part geometry={cube(door, 0.02, 0.1)} material={M.signal} position={[0, 0.03, d / 2 - 0.05]} castShadow={false} />
    </group>
  );
}

function Pictogram({ kind, position }: { kind: 'men' | 'women' | 'accessible' | 'prayer'; position: V3 }) {
  return (
    <group position={position}>
      <Part geometry={rbox(0.36, 0.36, 0.03, 0.03)} material={kind === 'accessible' ? X.blue : M.ink} />
      <Part geometry={sphere(0.04)} material={M.white} position={[0, 0.11, 0.022]} castShadow={false} />
      {kind === 'women' ? (
        <Part material={M.white} position={[0, -0.04, 0.022]} castShadow={false}>
          <coneGeometry args={[0.09, 0.2, 12]} />
        </Part>
      ) : kind === 'accessible' ? (
        <>
          <Part geometry={cube(0.04, 0.16, 0.01)} material={M.white} position={[0, 0.0, 0.022]} castShadow={false} />
          <Part geometry={cube(0.12, 0.035, 0.01)} material={M.white} position={[0.05, -0.08, 0.022]} castShadow={false} />
          <Part material={M.white} position={[0.01, -0.08, 0.022]} castShadow={false}>
            <torusGeometry args={[0.07, 0.014, 6, 16]} />
          </Part>
        </>
      ) : (
        <Part geometry={cube(0.1, 0.18, 0.01)} material={M.white} position={[0, -0.03, 0.022]} castShadow={false} />
      )}
    </group>
  );
}

function Washroom({ w, d, kind }: { w: number; d: number; kind: 'men' | 'women' | 'accessible' }) {
  const stalls = kind === 'accessible' ? 1 : Math.max(2, Math.min(4, Math.floor((w - 0.5) / 0.9)));
  const sw = kind === 'accessible' ? Math.min(w - 0.5, 1.6) : (w - 0.3) / stalls;
  const x0 = -w / 2 + 0.15 + sw / 2;
  return (
    <group>
      <Floor w={w - 0.1} d={d - 0.1} material={M.mist} />
      <Closet w={w} d={d} door={kind === 'accessible' ? 1.1 : 0.9} />
      <Pictogram kind={kind} position={[0, 2.15, d / 2 - 0.02]} />
      {Array.from({ length: stalls }).map((_, i) => {
        const x = kind === 'accessible' ? 0 : x0 + i * sw;
        return (
          <group key={i} position={[x, 0, -d / 2 + 0.6]}>
            <Part geometry={rbox(0.4, 0.4, 0.55, 0.08)} material={M.white} position-y={0.22} />
            <Part geometry={rbox(0.42, 0.5, 0.18, 0.06)} material={M.white} position={[0, 0.5, -0.2]} />
            {kind !== 'accessible' && <Part geometry={cube(sw - 0.06, 1.55, 0.03)} material={M.mist} position={[0, 0.85, 0.55]} />}
            {kind === 'accessible' && (
              <>
                <Part geometry={cube(0.04, 0.04, 0.8)} material={M.steel} position={[-0.5, 0.8, 0.1]} />
                <Part geometry={cube(0.04, 0.04, 0.8)} material={M.steel} position={[0.5, 0.8, 0.1]} />
              </>
            )}
          </group>
        );
      })}
      {/* Basins along the side wall */}
      {[0, 1].map((i) => (
        <group key={i} position={[w / 2 - 0.4, 0, d / 2 - 0.9 - i * 0.6]}>
          <Part geometry={rbox(0.5, 0.1, 0.45, 0.04)} material={M.white} position-y={0.82} />
          <Part geometry={cyl(0.05, 0.05, 0.8)} material={M.steel} position-y={0.4} />
          <Part geometry={cyl(0.012, 0.012, 0.16)} material={M.steel} position={[0, 0.95, -0.14]} />
        </group>
      ))}
    </group>
  );
}

function PrayerRoom({ w, d }: { w: number; d: number }) {
  const rows = Math.max(2, Math.floor((d - 1.2) / 0.85));
  const cols = Math.max(2, Math.floor((w - 0.8) / 0.75));
  return (
    <group>
      <Floor w={w - 0.1} d={d - 0.1} material={M.rug} />
      <Closet w={w} d={d} door={1} glass />
      <Pictogram kind="prayer" position={[0, 2.15, d / 2 - 0.02]} />
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((__, c) => (
          <Part key={`${r}/${c}`} geometry={rbox(0.5, 0.012, 0.8, 0.01)} material={(r + c) % 2 ? X.mat : M.fabric} position={[-((cols - 1) * 0.75) / 2 + c * 0.75, 0.03, -d / 2 + 1.0 + r * 0.85]} castShadow={false} />
        )),
      )}
      {/* A shoe rack by the door */}
      <Part geometry={rbox(Math.min(1.2, w * 0.4), 0.4, 0.3, 0.02)} material={M.ink} position={[w / 2 - 0.9, 0.2, d / 2 - 0.3]} />
      <Part geometry={rbox(0.6, 0.12, 0.3, 0.02)} material={M.mist} position={[-w / 2 + 0.45, 0.06, d / 2 - 0.3]} />
    </group>
  );
}

function ServerRoom({ w, d }: { w: number; d: number }) {
  const racks = Math.max(1, Math.min(4, Math.floor((w - 0.6) / 0.75)));
  return (
    <group>
      <Floor w={w - 0.1} d={d - 0.1} material={M.mist} />
      <Closet w={w} d={d} door={0.9} />
      {Array.from({ length: racks }).map((_, i) => {
        const x = racks === 1 ? 0 : -w / 2 + 0.55 + (i * (w - 1.1)) / (racks - 1);
        return (
          <group key={i} position={[x, 0, -d / 2 + 0.55]}>
            <Part geometry={rbox(0.62, 1.8, 0.8, 0.03)} material={M.ink} position-y={0.9} />
            {[0.4, 0.75, 1.1, 1.45].map((y) => (
              <group key={y}>
                <Part geometry={cube(0.5, 0.2, 0.02)} material={M.core} position={[0, y, 0.41]} />
                <Part geometry={cube(0.03, 0.03, 0.01)} material={X.led} position={[0.18, y + 0.04, 0.425]} castShadow={false} />
                <Part geometry={cube(0.03, 0.03, 0.01)} material={M.signal} position={[0.12, y + 0.04, 0.425]} castShadow={false} />
              </group>
            ))}
          </group>
        );
      })}
      <Part geometry={rbox(0.8, 0.3, 0.3, 0.03)} material={M.white} position={[w / 2 - 0.5, 1.6, d / 2 - 0.3]} />
    </group>
  );
}

function StorageRoom({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Floor w={w - 0.1} d={d - 0.1} material={M.mist} />
      <Closet w={w} d={d} door={0.9} />
      {[0.35, 0.8, 1.25, 1.7].map((y) => (
        <Part key={y} geometry={cube(w - 0.5, 0.03, 0.4)} material={M.steel} position={[0, y, -d / 2 + 0.3]} />
      ))}
      {Array.from({ length: Math.max(2, Math.floor((w - 0.8) / 0.5)) }).map((_, i) => (
        <Part key={i} geometry={rbox(0.38, 0.32 + (i % 3) * 0.08, 0.32, 0.02)} material={i % 2 ? M.mist : M.fabric} position={[-w / 2 + 0.55 + i * 0.5, 0.52 + (i % 3) * 0.04 + (i % 2 ? 0.45 : 0), -d / 2 + 0.3]} />
      ))}
      {[0, 1].map((i) => (
        <Part key={i} geometry={rbox(0.5, 0.4, 0.5, 0.03)} material={M.mist} position={[w / 2 - 0.5, 0.2 + i * 0.4, d / 2 - 0.6]} />
      ))}
    </group>
  );
}

function MailRoom({ w, d }: { w: number; d: number }) {
  const cols = Math.max(3, Math.floor((w - 0.5) / 0.28));
  return (
    <group>
      <Floor w={w - 0.1} d={d - 0.1} material={M.mist} />
      <Closet w={w} d={d} door={0.9} />
      {Array.from({ length: 5 }).flatMap((_, r) =>
        Array.from({ length: cols }).map((__, c) => (
          <Part key={`${r}/${c}`} geometry={cube(0.24, 0.17, 0.06)} material={(r + c) % 5 === 0 ? M.signal : M.ink} position={[-((cols - 1) * 0.28) / 2 + c * 0.28, 0.75 + r * 0.2, -d / 2 + 0.12]} />
        )),
      )}
      <Part geometry={rbox(w - 0.8, 0.8, 0.5, 0.03)} material={M.ink} position={[0, 0.4, d / 2 - 0.6]} />
      <Part geometry={rbox(w - 0.7, 0.05, 0.6, 0.02)} material={M.white} position={[0, 0.82, d / 2 - 0.6]} />
      <Part geometry={rbox(0.35, 0.25, 0.3, 0.02)} material={M.mist} position={[-0.3, 0.97, d / 2 - 0.6]} />
    </group>
  );
}

function GeneratorRoom({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Floor w={w - 0.1} d={d - 0.1} material={M.mist} />
      <Part geometry={fill(w - 0.5, d - 0.5, 0.05, 0.03)} material={X.asphalt} position-y={0.0} castShadow={false} />
      <Closet w={w} d={d} door={1.1} />
      <Part geometry={rbox(w * 0.6, 1.1, d * 0.5, 0.05)} material={M.core} position={[0, 0.65, -d * 0.12]} />
      <Part geometry={rbox(w * 0.38, 0.9, d * 0.46, 0.04)} material={M.steel} position={[-w * 0.18, 1.7, -d * 0.12]} />
      <Part geometry={cyl(0.07, 0.07, 1.1)} material={M.ink} position={[w * 0.28, 1.5, -d * 0.3]} />
      <Part geometry={rbox(0.5, 0.35, 0.05, 0.02)} material={M.signal} position={[0, 0.7, d * 0.13 + 0.03]} castShadow={false} />
      {/* Hazard markings round the plant */}
      <Part geometry={fill(w - 0.3, 0.14, 0.02, 0.012)} material={M.signal} position={[0, 0.0, d / 2 - 0.55]} castShadow={false} />
    </group>
  );
}

function SecurityDesk({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={rbox(w, 1.0, d, 0.04)} material={M.ink} position-y={0.5} />
      <Part geometry={rbox(w + 0.1, 0.05, d + 0.1, 0.02)} material={M.white} position-y={1.03} />
      <Part geometry={cube(w * 0.5, 0.05, 0.02)} material={M.signal} position={[0, 0.7, d / 2 + 0.012]} castShadow={false} />
      <Part geometry={rbox(0.5, 0.3, 0.03, 0.014)} material={M.ink} position={[-w * 0.2, 1.25, -d * 0.1]} />
      <Part geometry={cube(0.45, 0.24, 0.004)} material={M.screenOn} position={[-w * 0.2, 1.25, -d * 0.1 + 0.017]} castShadow={false} />
      <Part geometry={rbox(0.3, 0.2, 0.2, 0.02)} material={M.mist} position={[w * 0.25, 1.16, 0]} />
      <Chair position={[0, 0, -d / 2 - 0.45]} rotation={Math.PI} />
    </group>
  );
}

function Pantry({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={fill(w, d, 0.12, 0.02)} material={M.mist} castShadow={false} />
      <Part geometry={rbox(w - 0.4, 0.86, 0.6, 0.02)} material={M.ink} position={[0, 0.43, -d / 2 + 0.34]} />
      <Part geometry={rbox(w - 0.36, 0.05, 0.64, 0.02)} material={M.white} position={[0, 0.9, -d / 2 + 0.34]} />
      <Part geometry={rbox(0.45, 0.012, 0.34, 0.006)} material={M.steel} position={[-w * 0.25, 0.93, -d / 2 + 0.36]} />
      <Part geometry={cyl(0.12, 0.1, 0.22)} material={M.steel} position={[w * 0.2, 1.04, -d / 2 + 0.3]} />
      <Part geometry={rbox(0.3, 0.28, 0.3, 0.03)} material={M.white} position={[w * 0.32, 1.06, -d / 2 + 0.3]} />
      <Part geometry={rbox(w - 0.6, 0.3, 0.3, 0.02)} material={M.core} position={[0, 1.7, -d / 2 + 0.2]} />
      <Table w={1.0} d={0.6} position={[0, 0, d / 2 - 0.5]} h={0.74} />
      <Stool position={[-0.35, 0, d / 2 - 0.1]} height={0.66} />
      <Stool position={[0.35, 0, d / 2 - 0.1]} height={0.66} />
    </group>
  );
}

function WaterDispenser({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={rbox(w, 0.95, d, 0.04)} material={M.white} position-y={0.48} />
      <Part geometry={cyl(Math.min(w, d) * 0.4, Math.min(w, d) * 0.4, 0.4)} material={M.glass} position-y={1.2} castShadow={false} renderOrder={2} />
      <Part geometry={cube(0.12, 0.03, 0.02)} material={X.blue} position={[-0.06, 0.8, d / 2 + 0.012]} castShadow={false} />
      <Part geometry={cube(0.12, 0.03, 0.02)} material={X.red} position={[0.06, 0.8, d / 2 + 0.012]} castShadow={false} />
    </group>
  );
}

function VendingMachine({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={rbox(w, 1.85, d, 0.04)} material={M.ink} position-y={0.93} />
      <Part geometry={cube(w * 0.72, 1.3, 0.02)} material={M.glass} position={[-w * 0.08, 1.15, d / 2 + 0.012]} castShadow={false} renderOrder={2} />
      {[0, 1, 2, 3].flatMap((r) =>
        [0, 1, 2].map((c) => <Part key={`${r}/${c}`} geometry={cube(0.12, 0.1, 0.05)} material={BOOKS[(r + c) % BOOKS.length]!} position={[-w * 0.08 + (c - 1) * 0.2, 1.55 - r * 0.3, d / 2 - 0.05]} castShadow={false} />),
      )}
      <Part geometry={cube(0.12, 0.3, 0.02)} material={M.signal} position={[w / 2 - 0.12, 1.4, d / 2 + 0.012]} castShadow={false} />
      <Part geometry={cube(w * 0.6, 0.18, 0.02)} material={M.mist} position={[0, 0.32, d / 2 + 0.012]} castShadow={false} />
    </group>
  );
}

function Recreation({ w, d }: { w: number; d: number }) {
  const tw = Math.min(w - 0.4, 2.7);
  const td = Math.min(d - 0.3, 1.5);
  return (
    <group>
      <Floor w={w} d={d} material={M.rug} h={0.02} />
      <Part geometry={rbox(tw, 0.06, td, 0.02)} material={X.felt} position-y={0.76} />
      <Part geometry={cube(0.02, 0.03, td)} material={M.white} position-y={0.8} castShadow={false} />
      <Part geometry={cube(0.03, 0.15, td + 0.1)} material={M.white} position-y={0.87} castShadow={false} renderOrder={2} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Part key={`${sx}${sz}`} geometry={cube(0.07, 0.74, 0.07)} material={M.ink} position={[sx * (tw / 2 - 0.15), 0.37, sz * (td / 2 - 0.12)]} />))}
      <Part geometry={sphere(0.02)} material={M.signal} position={[0.3, 0.82, 0.1]} castShadow={false} />
    </group>
  );
}

function NapPod({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={rbox(w, 0.5, d, 0.2)} material={M.white} position-y={0.25} />
      <Part geometry={rbox(w - 0.2, 0.18, d - 0.3, 0.08)} material={M.fabric} position={[0, 0.58, 0.05]} />
      <Part geometry={rbox(w - 0.1, 0.9, 0.7, 0.3)} material={M.white} position={[0, 0.95, -d / 2 + 0.4]} />
      <Part geometry={rbox(w * 0.5, 0.2, 0.4, 0.08)} material={M.mist} position={[0, 0.78, d / 2 - 0.55]} />
      <Part geometry={cube(w * 0.6, 0.02, 0.02)} material={M.signal} position={[0, 1.3, -d / 2 + 0.78]} castShadow={false} />
    </group>
  );
}

function PhoneCorner({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Floor w={w} d={d} material={M.rug} h={0.02} />
      <Part geometry={rbox(w, 1.6, 0.08, 0.03)} material={M.fabric} position={[0, 0.8, -d / 2 + 0.05]} />
      <Part geometry={rbox(0.08, 1.6, d, 0.03)} material={M.fabric} position={[-w / 2 + 0.05, 0.8, 0]} />
      <Part geometry={rbox(0.08, 1.6, d, 0.03)} material={M.fabric} position={[w / 2 - 0.05, 0.8, 0]} />
      <Part geometry={rbox(w * 0.6, 0.04, 0.3, 0.015)} material={M.white} position={[0, 1.05, -d / 2 + 0.3]} />
      <Stool position={[0, 0, 0.05]} height={0.7} />
    </group>
  );
}

function Library({ w, d }: { w: number; d: number }) {
  const cols = Math.max(4, Math.floor((w - 0.2) / 0.16));
  return (
    <group>
      <Part geometry={rbox(w, 1.9, 0.35, 0.02)} material={M.ink} position={[0, 0.95, -d / 2 + 0.2]} />
      {[0.45, 0.85, 1.25, 1.65].flatMap((y, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <Part key={`${r}/${c}`} geometry={cube(0.11, 0.28 + ((c * 7 + r * 3) % 4) * 0.025, 0.2)} material={BOOKS[(c + r * 2) % BOOKS.length]!} position={[-w / 2 + 0.2 + c * ((w - 0.4) / Math.max(1, cols - 1)), y, -d / 2 + 0.32]} castShadow={false} />
        )),
      )}
      <Sofa position={[0, 0, d / 2 - 0.35]} width={Math.min(1.4, w * 0.5)} />
      <Part geometry={cyl(0.012, 0.012, 1.4)} material={M.steel} position={[w / 2 - 0.2, 0.7, d / 2 - 0.3]} />
      <Part geometry={sphere(0.1)} material={M.signal} position={[w / 2 - 0.2, 1.45, d / 2 - 0.3]} castShadow={false} />
    </group>
  );
}

function FireExit({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={rbox(w, 2.05, d, 0.02)} material={X.green} position-y={1.02} />
      <Part geometry={cube(w - 0.16, 1.95, d + 0.02)} material={M.mist} position-y={1.0} />
      <Part geometry={cube(0.04, 0.18, d + 0.06)} material={M.steel} position={[w / 2 - 0.15, 1.0, 0]} />
      <Part geometry={rbox(0.5, 0.2, 0.06, 0.02)} material={X.exit} position-y={2.35} castShadow={false} />
      <Part geometry={cube(0.1, 0.1, 0.01)} material={M.white} position={[0, 2.35, 0.04]} castShadow={false} />
    </group>
  );
}

function Extinguisher() {
  return (
    <group>
      <Part geometry={cyl(0.085, 0.085, 0.45)} material={X.red} position-y={0.4} />
      <Part geometry={sphere(0.085)} material={X.red} position-y={0.63} />
      <Part geometry={cyl(0.02, 0.02, 0.08)} material={M.ink} position-y={0.74} />
      <Part geometry={cube(0.12, 0.012, 0.02)} material={M.ink} position={[0.03, 0.78, 0]} />
      <Part geometry={cube(0.12, 0.12, 0.012)} material={M.white} position={[0, 0.42, 0.086]} castShadow={false} />
      <Part geometry={cyl(0.03, 0.03, 0.12)} material={M.ink} position-y={0.1} />
    </group>
  );
}

function FirstAid({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={cyl(0.025, 0.025, 1.0)} material={M.steel} position-y={0.5} />
      <Part geometry={rbox(Math.max(w, 0.45), 0.34, Math.max(d, 0.14), 0.03)} material={M.white} position-y={1.2} />
      <Part geometry={cube(0.2, 0.06, 0.012)} material={X.green} position={[0, 1.2, Math.max(d, 0.14) / 2 + 0.008]} castShadow={false} />
      <Part geometry={cube(0.06, 0.2, 0.012)} material={X.green} position={[0, 1.2, Math.max(d, 0.14) / 2 + 0.008]} castShadow={false} />
    </group>
  );
}

function Terrace({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={fill(w, d, 0.08, 0.05)} material={X.deck} castShadow={false} />
      {Array.from({ length: Math.max(3, Math.floor(d / 0.4)) }).map((_, i) => (
        <Part key={i} geometry={cube(w - 0.1, 0.006, 0.012)} material={M.steel} position={[0, 0.053, -d / 2 + 0.25 + i * 0.4]} castShadow={false} />
      ))}
      <Part geometry={cube(w, 0.05, 0.05)} material={M.steel} position={[0, 1.0, -d / 2 + 0.03]} />
      {Array.from({ length: Math.max(3, Math.floor(w / 1.2)) }).map((_, i, a) => (
        <Part key={i} geometry={cyl(0.02, 0.02, 1.0)} material={M.steel} position={[-w / 2 + 0.1 + (i * (w - 0.2)) / (a.length - 1), 0.5, -d / 2 + 0.03]} />
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * Math.min(1.2, w * 0.25), 0.05, 0.3]}>
          <Part geometry={cyl(0.4, 0.4, 0.04)} material={M.white} position-y={0.72} />
          <Part geometry={cyl(0.04, 0.04, 0.72)} material={M.ink} position-y={0.36} />
          <Stool position={[0.65, 0, 0]} height={0.5} />
          <Stool position={[-0.65, 0, 0]} height={0.5} />
        </group>
      ))}
      <Plant position={[w / 2 - 0.4, 0.05, -d / 2 + 0.45]} scale={0.9} />
      <Plant position={[-w / 2 + 0.4, 0.05, -d / 2 + 0.45]} scale={0.9} />
    </group>
  );
}

function BikeRack({ w, d }: { w: number; d: number }) {
  const n = Math.max(2, Math.floor(w / 0.5));
  return (
    <group>
      <Part geometry={fill(w, d, 0.05, 0.02)} material={X.asphalt} castShadow={false} />
      {Array.from({ length: n }).map((_, i) => (
        <Part key={i} material={M.steel} position={[-w / 2 + 0.25 + i * ((w - 0.5) / Math.max(1, n - 1)), 0.32, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.28, 0.02, 8, 20, Math.PI]} />
        </Part>
      ))}
    </group>
  );
}

// ---- structure

const WALL_H = 2.15;
const DOOR_H = 2.0;
const SILL = 0.85;
const HEAD = 1.75;

interface Opening {
  at: number;
  width: number;
  kind: 'door' | 'window';
}

/** The doors and windows that sit in a wall: those lying along it, within its thickness, and not past its ends. */
export function openingsFor(wall: PlacedObject, all: PlacedObject[]): Opening[] {
  if (wall.type !== 'wall' && wall.type !== 'glass_wall') return [];
  const a = (wall.rot * Math.PI) / 2;
  const cos = Math.round(Math.cos(a));
  const sin = Math.round(Math.sin(a));
  const out: Opening[] = [];
  for (const o of all) {
    if (o.type !== 'door' && o.type !== 'window') continue;
    if ((o.rot - wall.rot) % 2 !== 0) continue;
    const dx = o.x - wall.x;
    const dz = o.z - wall.z;
    const lx = cos * dx - sin * dz;
    const lz = sin * dx + cos * dz;
    if (Math.abs(lz) > (wall.d + o.d) / 2 + 0.05) continue;
    if (Math.abs(lx) > wall.w / 2 + o.w / 2 - 0.05) continue;
    out.push({ at: lx, width: o.w, kind: o.type });
  }
  return out.sort((p, q) => p.at - q.at);
}

/** A wall in solid pieces, with a gap cut for every door and window and a lintel or sill filled in around it. */
function WallBody({ o, openings }: { o: PlacedObject; openings: Opening[] }) {
  const glass = o.type === 'glass_wall';
  const H = glass ? 1.95 : WALL_H;
  const { w, d } = o;
  const mat = glass ? M.glass : X.wall;
  const pieces: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let cursor = -w / 2;
  for (const op of openings) {
    const x0 = Math.max(-w / 2, op.at - op.width / 2);
    const x1 = Math.min(w / 2, op.at + op.width / 2);
    if (x0 > cursor) pieces.push({ x0: cursor, x1: x0, y0: 0, y1: H });
    const top = op.kind === 'door' ? DOOR_H : HEAD;
    if (H > top) pieces.push({ x0, x1, y0: top, y1: H });
    if (op.kind === 'window') pieces.push({ x0, x1, y0: 0, y1: SILL });
    cursor = Math.max(cursor, x1);
  }
  if (cursor < w / 2) pieces.push({ x0: cursor, x1: w / 2, y0: 0, y1: H });
  return (
    <group>
      {pieces.map((s, i) => (
        <Part key={i} geometry={cube(s.x1 - s.x0, s.y1 - s.y0, d)} material={mat} position={[(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, 0]} castShadow={!glass} renderOrder={glass ? 2 : 0} />
      ))}
      {!glass && <Part geometry={cube(w, 0.1, d + 0.03)} material={X.skirt} position-y={0.05} />}
      <Part geometry={cube(w, 0.04, d + 0.02)} material={M.ink} position-y={H + 0.02} />
      {glass && (
        <>
          <Part geometry={cube(w, 0.05, d + 0.04)} material={M.ink} position-y={0.025} />
          {Array.from({ length: Math.floor(w / 2) + 1 }).map((_, i) => (
            <Part key={i} geometry={cube(0.06, H, d + 0.04)} material={M.ink} position={[-w / 2 + 0.03 + i * 2, H / 2, 0]} />
          ))}
          <Part geometry={cube(0.06, H, d + 0.04)} material={M.ink} position={[w / 2 - 0.03, H / 2, 0]} />
        </>
      )}
    </group>
  );
}

function DoorBody({ o }: { o: PlacedObject }) {
  const { w, d } = o;
  const t = d + 0.04;
  const leaf = (x: number, lw: number) => (
    <group position={[x, 0, 0]}>
      <Part geometry={rbox(lw, DOOR_H - 0.06, 0.05, 0.015)} material={o.variant === 'sliding' ? M.glass : M.mist} position={[0, (DOOR_H - 0.06) / 2 + 0.03, 0]} renderOrder={o.variant === 'sliding' ? 2 : 0} />
      <Part geometry={cube(0.03, 0.2, 0.09)} material={M.signal} position={[lw / 2 - 0.1, 1.0, 0]} castShadow={false} />
    </group>
  );
  return (
    <group>
      {/* frame */}
      <Part geometry={cube(0.06, DOOR_H, t)} material={M.ink} position={[-w / 2 + 0.03, DOOR_H / 2, 0]} />
      <Part geometry={cube(0.06, DOOR_H, t)} material={M.ink} position={[w / 2 - 0.03, DOOR_H / 2, 0]} />
      <Part geometry={cube(w, 0.07, t)} material={M.ink} position={[0, DOOR_H - 0.03, 0]} />
      {o.variant === 'double' ? (
        <>
          {leaf(-w / 4, w / 2 - 0.07)}
          <group scale={[-1, 1, 1]}>{leaf(-w / 4, w / 2 - 0.07)}</group>
        </>
      ) : o.variant === 'sliding' ? (
        <>
          {leaf(-w / 4, w / 2 - 0.04)}
          <Part geometry={cube(w, 0.04, 0.05)} material={M.steel} position={[0, DOOR_H - 0.07, 0.04]} />
        </>
      ) : (
        leaf(0, w - 0.14)
      )}
      <Part geometry={cube(w - 0.1, 0.02, t + 0.04)} material={M.signal} position-y={0.012} castShadow={false} />
    </group>
  );
}

function WindowBody({ o }: { o: PlacedObject }) {
  const { w, d } = o;
  const t = d + 0.04;
  const h = HEAD - SILL;
  return (
    <group>
      <Part geometry={cube(w, 0.05, t)} material={M.ink} position-y={SILL + 0.025} />
      <Part geometry={cube(w, 0.05, t)} material={M.ink} position-y={HEAD - 0.025} />
      <Part geometry={cube(0.05, h, t)} material={M.ink} position={[-w / 2 + 0.025, SILL + h / 2, 0]} />
      <Part geometry={cube(0.05, h, t)} material={M.ink} position={[w / 2 - 0.025, SILL + h / 2, 0]} />
      <Part geometry={cube(w - 0.1, h - 0.1, 0.02)} material={M.glass} position-y={SILL + h / 2} castShadow={false} renderOrder={2} />
      {w > 1.6 && <Part geometry={cube(0.03, h - 0.1, t - 0.02)} material={M.ink} position-y={SILL + h / 2} />}
      <Part geometry={cube(w + 0.08, 0.03, t + 0.1)} material={M.white} position-y={SILL - 0.01} />
    </group>
  );
}

function Column({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={rbox(w, 2.15, d, 0.02)} material={X.wall} position-y={1.075} />
      <Part geometry={cube(w + 0.04, 0.1, d + 0.04)} material={X.skirt} position-y={0.05} />
      <Part geometry={cube(w + 0.04, 0.05, d + 0.04)} material={M.ink} position-y={2.175} />
    </group>
  );
}

const lShape = (w: number, d: number) => {
  const nx = w * 0.45;
  const nz = d * 0.5;
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x, y);
  s.lineTo(x + w - nx, y);
  s.lineTo(x + w - nx, y + nz);
  s.lineTo(x + w, y + nz);
  s.lineTo(x + w, y + d);
  s.lineTo(x, y + d);
  s.closePath();
  return s;
};

const zoneGeos = new Map<string, THREE.BufferGeometry>();
function zoneGeometry(w: number, d: number, variant: string) {
  const key = `${variant}/${w.toFixed(2)}/${d.toFixed(2)}`;
  let g = zoneGeos.get(key);
  if (!g) {
    g = variant === 'l' ? new THREE.ExtrudeGeometry(lShape(w, d), { depth: 0.014, bevelEnabled: false }) : fill(w, d, 0.1, 0.014);
    if (variant === 'l') g.rotateX(-Math.PI / 2);
    zoneGeos.set(key, g);
  }
  return g;
}

const zoneMats = new Map<string, THREE.Material>();
const zoneMat = (tint: string) => {
  let m = zoneMats.get(tint);
  if (!m) {
    m = mk((TINTS.find((t) => t.value === tint) ?? TINTS[0]!).color, { roughness: 0.95 });
    zoneMats.set(tint, m);
  }
  return m;
};

function Zone({ o }: { o: PlacedObject }) {
  const geometry = useMemo(() => zoneGeometry(o.w, o.d, o.variant), [o.w, o.d, o.variant]);
  return (
    <group>
      <Part geometry={geometry} material={zoneMat(o.tint)} position-y={0.012} castShadow={false} />
      {o.variant !== 'l' && <Part geometry={ring(o.w, o.d, 0.05, 0.1, 0.01)} material={ringMat('idle')} position-y={0.03} castShadow={false} />}
    </group>
  );
}

function LabelTile({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Part geometry={rbox(w, 0.03, d, 0.05)} material={M.signal} position-y={0.02} castShadow={false} />
      <Part geometry={cube(w - 0.2, 0.012, 0.04)} material={M.ink} position-y={0.04} castShadow={false} />
    </group>
  );
}

/** Draws a floor object: the new models here, and the original seven from shapes.tsx. `siblings` is every object on the floor, so a wall can find its doors. */
export function ObjectBody({ o, siblings }: { o: PlacedObject; siblings: PlacedObject[] }) {
  switch (o.type) {
    case 'pantry': return <Pantry w={o.w} d={o.d} />;
    case 'water_dispenser': return <WaterDispenser w={o.w} d={o.d} />;
    case 'vending_machine': return <VendingMachine w={o.w} d={o.d} />;
    case 'recreation': return <Recreation w={o.w} d={o.d} />;
    case 'nap_pod': return <NapPod w={o.w} d={o.d} />;
    case 'phone_corner': return <PhoneCorner w={o.w} d={o.d} />;
    case 'library': return <Library w={o.w} d={o.d} />;
    case 'washroom_men': return <Washroom w={o.w} d={o.d} kind="men" />;
    case 'washroom_women': return <Washroom w={o.w} d={o.d} kind="women" />;
    case 'washroom_accessible': return <Washroom w={o.w} d={o.d} kind="accessible" />;
    case 'prayer_room': return <PrayerRoom w={o.w} d={o.d} />;
    case 'server_room': return <ServerRoom w={o.w} d={o.d} />;
    case 'storage_room': return <StorageRoom w={o.w} d={o.d} />;
    case 'mail_room': return <MailRoom w={o.w} d={o.d} />;
    case 'generator_room': return <GeneratorRoom w={o.w} d={o.d} />;
    case 'security_desk': return <SecurityDesk w={o.w} d={o.d} />;
    case 'fire_exit': return <FireExit w={o.w} d={o.d} />;
    case 'extinguisher': return <Extinguisher />;
    case 'first_aid': return <FirstAid w={o.w} d={o.d} />;
    case 'terrace': return <Terrace w={o.w} d={o.d} />;
    case 'bike_rack': return <BikeRack w={o.w} d={o.d} />;
    case 'wall':
    case 'glass_wall': return <WallBody o={o} openings={openingsFor(o, siblings)} />;
    case 'door': return <DoorBody o={o} />;
    case 'window': return <WindowBody o={o} />;
    case 'column': return <Column w={o.w} d={o.d} />;
    case 'zone': return <Zone o={o} />;
    case 'label': return <LabelTile w={o.w} d={o.d} />;
    default: return <ObjectShape o={o} />;
  }
}

export { Floor as FlatFloor };
