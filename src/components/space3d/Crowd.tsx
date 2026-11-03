import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Presence } from '../../lib/live';
import type { FloorLayout } from './layout';
import { entranceOf, gridOf, routeIn, routeOut, spotFor, type Pt, type Spot } from './walk';

const SPEED = 1.3;
const SHIRTS = ['#2a55c7', '#0f7b5f', '#b8381a', '#7a4fc4', '#d0731b', '#1b8aa6', '#c2427a', '#5b6b7f'];
const SKINS = ['#f0c8a4', '#e0ac82', '#c68a5f', '#8d5a3b', '#f5d5b8'];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

interface Agent {
  id: string;
  name: string;
  resourceId: string | null;
  pos: Pt;
  yaw: number;
  route: Pt[];
  mode: 'in' | 'seated' | 'out' | 'gone';
  spot: Spot;
  /** 0 standing to 1 sitting. */
  sit: number;
  /** Walking cycle. */
  phase: number;
  moving: boolean;
  /** 0 not there yet to 1 fully there; used to pop in at the door and fade out again. */
  appear: number;
}

const turnTo = (from: number, to: number, k: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, k);
};

/** Where someone who came in at the door only stands: just inside it, a little apart from the others. */
function nearDoor(f: FloorLayout, k: number): Spot {
  const { door, outside } = entranceOf(f);
  const len = Math.hypot(door.x - outside.x, door.z - outside.z) || 1;
  const ux = (door.x - outside.x) / len;
  const uz = (door.z - outside.z) / len;
  const at = { x: door.x + ux * 1.8 - uz * (k % 4) * 0.7, z: door.z + uz * 1.8 + ux * (k % 4) * 0.7 };
  return { approach: at, at, yaw: Math.atan2(ux, uz), sit: false };
}

/**
 * The people checked in on one floor. Someone who is already here when the view opens is simply seated; someone who checks in
 * while it is open walks in through the door, around the furniture, to their space and sits. When they check out they stand and walk out.
 */
export function Crowd({ floor, people, selectedId, onPick }: { floor: FloorLayout; people: Presence[]; selectedId: string | null; onPick: (id: string) => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const agents = useRef(new Map<string, Agent>());
  const first = useRef(true);
  const [ids, setIds] = useState<string[]>([]);
  const grid = useMemo(() => gridOf(floor), [floor]);

  useEffect(() => {
    const map = agents.current;
    const initial = first.current;
    first.current = false;
    const here = new Set(people.map((p) => p.id));
    const { outside } = entranceOf(floor);
    for (const p of people) {
      if (map.has(p.id)) continue;
      const placed = p.resourceId ? floor.placed.find((x) => x.item.id === p.resourceId) : undefined;
      const sameSpot = [...map.values()].filter((a) => a.resourceId === p.resourceId && a.mode !== 'out').length;
      const spot = placed ? spotFor(placed, sameSpot) : nearDoor(floor, sameSpot);
      const arriving = !initial && Date.now() - Date.parse(p.checkInAt) < 90_000;
      map.set(p.id, {
        id: p.id,
        name: p.name,
        resourceId: p.resourceId,
        pos: arriving ? outside : spot.at,
        yaw: spot.yaw,
        route: arriving ? routeIn(floor, grid, spot) : [],
        mode: arriving ? 'in' : 'seated',
        spot,
        sit: arriving || !spot.sit ? 0 : 1,
        phase: 0,
        moving: false,
        appear: arriving ? 0 : 1,
      });
    }
    for (const a of map.values()) {
      if (here.has(a.id) || a.mode === 'out' || a.mode === 'gone') continue;
      const wasSeated = a.mode === 'seated';
      a.mode = 'out';
      a.route = [...(wasSeated ? [a.spot.approach] : []), ...routeOut(floor, grid, wasSeated ? a.spot.approach : a.pos)];
    }
    setIds([...map.keys()]);
    invalidate();
  }, [people, floor, grid, invalidate]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const map = agents.current;
    let busy = false;
    for (const a of map.values()) {
      a.moving = false;
      const standing = a.mode === 'out' && a.sit > 0;
      if (standing) {
        a.sit = Math.max(0, a.sit - dt * 2.5);
        busy = true;
      } else if (a.mode === 'in' || a.mode === 'out') {
        const goal = a.route[0];
        if (!goal) {
          a.mode = a.mode === 'in' ? 'seated' : 'gone';
        } else {
          const dx = goal.x - a.pos.x;
          const dz = goal.z - a.pos.z;
          const dist = Math.hypot(dx, dz);
          const step = SPEED * dt;
          if (dist <= step) {
            a.pos = goal;
            a.route.shift();
          } else {
            a.pos = { x: a.pos.x + (dx / dist) * step, z: a.pos.z + (dz / dist) * step };
            a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), dt * 10);
          }
          a.moving = true;
          a.phase += dt * SPEED * 6.5;
        }
        a.appear = a.mode === 'in' ? Math.min(1, a.appear + dt * 2.5) : a.appear;
        busy = true;
      }
      if (a.mode === 'seated') {
        const want = a.spot.sit ? 1 : 0;
        a.yaw = turnTo(a.yaw, a.spot.yaw, dt * 8);
        a.sit += Math.sign(want - a.sit) * Math.min(Math.abs(want - a.sit), dt * 2.2);
        if (a.sit !== want || Math.abs(a.yaw - a.spot.yaw) % (Math.PI * 2) > 0.02) busy = true;
      }
      if (a.mode === 'gone') {
        a.appear -= dt * 2.5;
        busy = true;
        if (a.appear <= 0) {
          map.delete(a.id);
          setIds([...map.keys()]);
        }
      }
    }
    if (busy) invalidate();
  });

  return (
    <>
      {ids.map((id) => {
        const agent = agents.current.get(id);
        return agent ? <Walker key={id} agent={agent} name={agent.name} selected={id === selectedId} onPick={onPick} /> : null;
      })}
    </>
  );
}

const ease = (t: number) => 1 - (1 - t) * (1 - t);

function Walker({ agent, name, selected, onPick }: { agent: Agent; name: string; selected: boolean; onPick: (id: string) => void }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const pill = useRef<THREE.Group>(null);
  const thigh = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const shin = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const arm = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const [hover, setHover] = useState(false);
  const h = hash(name || agent.id);
  const shirt = SHIRTS[h % SHIRTS.length]!;
  const skin = SKINS[(h >> 3) % SKINS.length]!;

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const a = agent;
    g.position.set(a.pos.x, 0, a.pos.z);
    g.rotation.y = a.yaw;
    g.scale.setScalar(Math.max(0.001, ease(Math.max(0, a.appear))));
    const s = a.sit;
    const swing = a.moving ? Math.sin(a.phase) * 0.7 : 0;
    if (body.current) body.current.position.y = -0.38 * s;
    if (pill.current) pill.current.position.y = 2.05 - 0.38 * s;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      if (thigh[i]!.current) thigh[i]!.current!.rotation.x = swing * sign * (1 - s) - (Math.PI / 2) * s;
      if (shin[i]!.current) shin[i]!.current!.rotation.x = (Math.PI / 2) * s + (a.moving ? Math.max(0, -swing * sign) * 0.8 : 0);
      if (arm[i]!.current) arm[i]!.current!.rotation.x = -swing * sign * (1 - s) * 0.9 - 1.05 * s;
    }
  });

  const legs = [-0.09, 0.09];
  return (
    <group ref={root} scale={0.001}>
      <group ref={body}>
        {legs.map((x, i) => (
          <group key={x} ref={thigh[i]} position={[x, 0.88, 0]}>
            <mesh position-y={-0.21} castShadow>
              <capsuleGeometry args={[0.07, 0.28, 4, 10]} />
              <meshStandardMaterial color="#1b2a41" roughness={0.8} />
            </mesh>
            <group ref={shin[i]} position-y={-0.42}>
              <mesh position-y={-0.21} castShadow>
                <capsuleGeometry args={[0.06, 0.28, 4, 10]} />
                <meshStandardMaterial color="#1b2a41" roughness={0.8} />
              </mesh>
            </group>
          </group>
        ))}
        <mesh position-y={1.21} castShadow>
          <capsuleGeometry args={[0.15, 0.4, 6, 14]} />
          <meshStandardMaterial color={shirt} roughness={0.7} />
        </mesh>
        <mesh position-y={1.7} castShadow>
          <sphereGeometry args={[0.12, 20, 14]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.76, -0.02]}>
          <sphereGeometry args={[0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color="#2a2018" roughness={0.9} />
        </mesh>
        {[-0.21, 0.21].map((x, i) => (
          <group key={x} ref={arm[i]} position={[x, 1.46, 0]}>
            <mesh position-y={-0.24} castShadow>
              <capsuleGeometry args={[0.05, 0.34, 4, 10]} />
              <meshStandardMaterial color={shirt} roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>

      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.035}>
          <ringGeometry args={[0.38, 0.5, 40]} />
          <meshBasicMaterial color="#f6c324" />
        </mesh>
      )}

      {/* The one thing the pointer tests. */}
      <mesh
        position-y={0.95}
        onClick={(e) => {
          e.stopPropagation();
          onPick(agent.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <cylinderGeometry args={[0.45, 0.45, 1.9, 10]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <group ref={pill} position-y={2.05}>
        <Html center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <span
            className={`display rounded-full px-2 py-0.5 text-[11px] leading-none font-bold whitespace-nowrap shadow ${selected ? 'bg-signal text-ink' : 'bg-ink/90 text-white'}`}
            style={{ boxShadow: `0 0 0 1.5px ${shirt}` }}
          >
            {selected || hover ? name : initialsOf(name)}
          </span>
        </Html>
      </group>
    </group>
  );
}
