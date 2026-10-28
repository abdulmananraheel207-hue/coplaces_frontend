import type { ThreeElements } from '@react-three/fiber';
import { styleKey } from '../../lib/catalogue';
import type { Tone } from '../../lib/spaceState';
import { CORE_HEIGHT, wallHeight, type Core, type Placed, type PlacedObject, type Zone } from './layout';
import { M, bodyMat, capsule, cube, cyl, fill, fillMat, lampMat, rbox, ring, ringMat, sphere } from './three-kit';

const noRay = () => undefined;

/** A purely visual mesh. It opts out of picking so the pointer only ever tests the one hit box per unit. */
export function Part(props: ThreeElements['mesh']) {
  return <mesh raycast={noRay} castShadow receiveShadow {...props} />;
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// Small pieces

export function Inlay({ w, d, tone, y = 0 }: { w: number; d: number; tone: Tone; y?: number }) {
  return (
    <group position-y={y}>
      <Part geometry={fill(w, d)} material={fillMat(tone)} castShadow={false} />
      {tone !== 'busy' && tone !== 'mine' && <Part geometry={ring(w, d)} material={ringMat(tone)} position-y={0.03} castShadow={false} />}
    </group>
  );
}

export function Chair({ position, rotation = 0, scale = 1 }: { position: V3; rotation?: number; scale?: number }) {
  return (
    <group position={position} rotation-y={rotation} scale={scale}>
      <Part geometry={rbox(0.46, 0.08, 0.44, 0.035)} material={M.ink} position-y={0.46} />
      <Part geometry={rbox(0.44, 0.36, 0.06, 0.03)} material={M.ink} position={[0, 0.7, 0.2]} />
      <Part geometry={cyl(0.03, 0.03, 0.4)} material={M.mist} position-y={0.24} />
      <Part geometry={cyl(0.2, 0.2, 0.03)} material={M.mist} position-y={0.02} />
    </group>
  );
}

export function Stool({ position, height = 0.62 }: { position: V3; height?: number }) {
  return (
    <group position={position}>
      <Part geometry={cyl(0.19, 0.19, 0.05)} material={M.ink} position-y={height} />
      <Part geometry={cyl(0.025, 0.025, height)} material={M.steel} position-y={height / 2} />
      <Part geometry={cyl(0.17, 0.17, 0.02)} material={M.steel} position-y={0.01} />
    </group>
  );
}

export function Person({ tone, position, standing = false }: { tone: Tone; position: V3; standing?: boolean }) {
  return (
    <group position={position}>
      {standing ? (
        <>
          <Part geometry={capsule(0.17, 0.85)} material={bodyMat(tone)} position-y={0.78} />
          <Part geometry={sphere(0.13)} material={bodyMat(tone)} position-y={1.52} />
        </>
      ) : (
        <>
          <Part geometry={capsule(0.15, 0.24)} material={bodyMat(tone)} position-y={0.32} />
          <Part geometry={sphere(0.12)} material={bodyMat(tone)} position-y={0.7} />
        </>
      )}
    </group>
  );
}

export function Plant({ position, scale = 1 }: { position: V3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <Part geometry={cyl(0.24, 0.19, 0.5)} material={M.ink} position-y={0.25} />
      <Part geometry={sphere(0.3)} material={M.foliage} position={[0, 0.85, 0]} />
      <Part geometry={sphere(0.22)} material={M.foliage} position={[0.14, 1.12, 0.06]} />
      <Part geometry={sphere(0.2)} material={M.foliage} position={[-0.15, 1.05, -0.08]} />
    </group>
  );
}

export function Sofa({ position, width = 2.2, rotation = 0 }: { position: V3; width?: number; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Part geometry={rbox(width, 0.4, 0.85, 0.08)} material={M.fabric} position-y={0.26} />
      <Part geometry={rbox(width, 0.52, 0.2, 0.08)} material={M.fabric} position={[0, 0.62, -0.33]} />
      <Part geometry={rbox(0.2, 0.34, 0.85, 0.07)} material={M.fabric} position={[-width / 2 + 0.1, 0.5, 0]} />
      <Part geometry={rbox(0.2, 0.34, 0.85, 0.07)} material={M.fabric} position={[width / 2 - 0.1, 0.5, 0]} />
    </group>
  );
}

export function Table({ w, d, position, h = 0.76 }: { w: number; d: number; position: V3; h?: number }) {
  return (
    <group position={position}>
      <Part geometry={rbox(w, 0.06, d, 0.03)} material={M.white} position-y={h} />
      <Part geometry={cyl(0.07, 0.07, h - 0.04)} material={M.ink} position={[-w / 4, h / 2, 0]} />
      <Part geometry={cyl(0.07, 0.07, h - 0.04)} material={M.ink} position={[w / 4, h / 2, 0]} />
      <Part geometry={rbox(w * 0.34, 0.03, 0.4, 0.015)} material={M.ink} position={[-w / 4, 0.02, 0]} />
      <Part geometry={rbox(w * 0.34, 0.03, 0.4, 0.015)} material={M.ink} position={[w / 4, 0.02, 0]} />
    </group>
  );
}

/** A row of chairs, all facing the same way. */
export function Rows({ cols, rows, x0, z0, dx, dz, count, scale = 1 }: { cols: number; rows: number; x0: number; z0: number; dx: number; dz: number; count: number; scale?: number }) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r * cols + c < count) out.push(<Chair key={`${r}/${c}`} position={[x0 + c * dx, 0, z0 + r * dz]} scale={scale} />);
  return <>{out}</>;
}

// ---------------------------------------------------------------------------------------------
// Rooms

export function Panes({ w, d, h, door, frosted }: { w: number; d: number; h: number; door: number; frosted: boolean }) {
  const side = (w - door) / 2;
  const t = 0.04;
  const rail = (len: number, x: number, z: number, along: 'x' | 'z') => (
    <Part key={`${x}/${z}`} geometry={cube(along === 'x' ? len : 0.07, 0.05, along === 'x' ? 0.07 : len)} material={M.ink} position={[x, h, z]} />
  );
  const post = (x: number, z: number) => <Part key={`p${x}/${z}`} geometry={cube(0.08, h, 0.08)} material={M.ink} position={[x, h / 2, z]} />;
  return (
    <group>
      <Part geometry={cube(w, h, t)} material={M.glass} position={[0, h / 2, -d / 2 + t / 2]} castShadow={false} renderOrder={2} />
      <Part geometry={cube(t, h, d)} material={M.glass} position={[-w / 2 + t / 2, h / 2, 0]} castShadow={false} renderOrder={2} />
      <Part geometry={cube(t, h, d)} material={M.glass} position={[w / 2 - t / 2, h / 2, 0]} castShadow={false} renderOrder={2} />
      <Part geometry={cube(side, h, t)} material={M.glass} position={[-(door + side) / 2, h / 2, d / 2 - t / 2]} castShadow={false} renderOrder={2} />
      <Part geometry={cube(side, h, t)} material={M.glass} position={[(door + side) / 2, h / 2, d / 2 - t / 2]} castShadow={false} renderOrder={2} />
      {frosted && (
        <>
          <Part geometry={cube(w - 0.1, 0.32, t + 0.01)} material={M.frost} position={[0, 0.95, -d / 2 + t / 2]} castShadow={false} renderOrder={3} />
          <Part geometry={cube(t + 0.01, 0.32, d - 0.1)} material={M.frost} position={[-w / 2 + t / 2, 0.95, 0]} castShadow={false} renderOrder={3} />
          <Part geometry={cube(t + 0.01, 0.32, d - 0.1)} material={M.frost} position={[w / 2 - t / 2, 0.95, 0]} castShadow={false} renderOrder={3} />
        </>
      )}
      {rail(w, 0, -d / 2 + 0.035, 'x')}
      {rail(d, -w / 2 + 0.035, 0, 'z')}
      {rail(d, w / 2 - 0.035, 0, 'z')}
      {rail(side, -(door + side) / 2, d / 2 - 0.035, 'x')}
      {rail(side, (door + side) / 2, d / 2 - 0.035, 'x')}
      {post(-w / 2 + 0.04, -d / 2 + 0.04)}
      {post(w / 2 - 0.04, -d / 2 + 0.04)}
      {post(-w / 2 + 0.04, d / 2 - 0.04)}
      {post(w / 2 - 0.04, d / 2 - 0.04)}
      {post(-door / 2, d / 2 - 0.04)}
      {post(door / 2, d / 2 - 0.04)}
    </group>
  );
}

interface Interior {
  w: number;
  d: number;
  seats: number;
  lit: boolean;
}

/** The long table with a chair on each side, which suits the standard meeting room. */
function MeetingInterior({ w, d, seats }: Interior) {
  const n = Math.min(seats, 12);
  const tableW = Math.max(1.2, w * 0.5);
  const tableD = Math.max(0.8, d * 0.3);
  const perSide = Math.ceil(n / 2);
  const chairX = (i: number, count: number) => (count === 1 ? 0 : -tableW / 2 + 0.3 + (i * (tableW - 0.6)) / (count - 1));
  return (
    <>
      <Table w={tableW} d={tableD} position={[0, 0, 0]} />
      {Array.from({ length: perSide }).map((_, i) => (
        <Chair key={`f${i}`} position={[chairX(i, perSide), 0, tableD / 2 + 0.34]} />
      ))}
      {Array.from({ length: n - perSide }).map((_, i) => (
        <Chair key={`b${i}`} position={[chairX(i, n - perSide), 0, -tableD / 2 - 0.34]} rotation={Math.PI} />
      ))}
    </>
  );
}

function PhoneBoothInterior({ w, d, lit }: Interior) {
  return (
    <>
      <Part geometry={rbox(Math.max(0.9, w - 0.9), 0.05, 0.5, 0.025)} material={M.white} position={[0, 1.0, -d / 2 + 0.34]} />
      <Part geometry={cube(0.04, 1.0, 0.44)} material={M.ink} position={[-(Math.max(0.9, w - 0.9) / 2) + 0.05, 0.5, -d / 2 + 0.34]} />
      <Part geometry={cube(0.04, 1.0, 0.44)} material={M.ink} position={[Math.max(0.9, w - 0.9) / 2 - 0.05, 0.5, -d / 2 + 0.34]} />
      <Part geometry={rbox(0.34, 0.012, 0.24, 0.006)} material={M.mist} position={[0, 1.04, -d / 2 + 0.34]} />
      <Part geometry={cube(0.3, 0.2, 0.004)} material={lit ? M.screenOn : M.screenOff} position={[0, 1.16, -d / 2 + 0.2]} castShadow={false} />
      <Stool position={[0, 0, -d / 2 + 1.15]} height={0.68} />
    </>
  );
}

function HuddleInterior({ w, d, lit }: Interior) {
  return (
    <>
      <Sofa position={[0, 0, -d / 2 + 0.7]} width={Math.min(2.6, w * 0.7)} />
      <Part geometry={rbox(1.0, 0.34, 0.6, 0.05)} material={M.white} position={[0, 0.2, -d / 2 + 1.85]} />
      <Part geometry={cyl(0.28, 0.28, 0.4)} material={M.fabric} position={[-w * 0.3, 0.2, -d / 2 + 1.9]} />
      <Part geometry={cyl(0.28, 0.28, 0.4)} material={M.fabric} position={[w * 0.3, 0.2, -d / 2 + 1.9]} />
      <Part geometry={rbox(Math.min(1.5, w * 0.45), 0.8, 0.05, 0.02)} material={M.ink} position={[0, 1.15, -d / 2 + 0.1]} />
      <Part geometry={cube(Math.min(1.4, w * 0.42), 0.72, 0.004)} material={lit ? M.screenOn : M.screenOff} position={[0, 1.15, -d / 2 + 0.131]} castShadow={false} />
    </>
  );
}

function TrainingInterior({ w, d, seats, lit }: Interior) {
  const n = Math.min(seats, 28);
  const cols = Math.max(2, Math.min(6, Math.floor((w - 1) / 1.1)));
  const rows = Math.ceil(n / cols);
  const x0 = -((cols - 1) * 1.1) / 2;
  return (
    <>
      <Part geometry={rbox(Math.min(3.2, w * 0.55), 0.9, 0.05, 0.02)} material={M.ink} position={[0, 1.25, -d / 2 + 0.1]} />
      <Part geometry={cube(Math.min(3.1, w * 0.53), 0.82, 0.004)} material={lit ? M.screenOn : M.screenOff} position={[0, 1.25, -d / 2 + 0.131]} castShadow={false} />
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((__, c) =>
          r * cols + c < n ? <Part key={`t${r}/${c}`} geometry={rbox(0.9, 0.04, 0.42, 0.02)} material={M.white} position={[x0 + c * 1.1, 0.74, -d / 2 + 1.7 + r * 0.95]} /> : null,
        ),
      )}
      <Rows cols={cols} rows={rows} x0={x0} z0={-d / 2 + 2.25} dx={1.1} dz={0.95} count={n} />
    </>
  );
}

function BoardroomInterior({ w, d, seats, lit }: Interior) {
  const n = Math.min(seats, 20);
  const tableW = w * 0.62;
  const tableD = Math.min(2.2, d * 0.36);
  const perSide = Math.ceil(n / 2);
  const chairX = (i: number, count: number) => (count === 1 ? 0 : -tableW / 2 + 0.35 + (i * (tableW - 0.7)) / (count - 1));
  return (
    <>
      <Part geometry={rbox(Math.min(5.5, w * 0.6), 1.15, 0.06, 0.02)} material={M.ink} position={[0, 1.2, -d / 2 + 0.12]} />
      <Part geometry={cube(Math.min(5.4, w * 0.58), 1.05, 0.004)} material={lit ? M.screenOn : M.screenOff} position={[0, 1.2, -d / 2 + 0.145]} castShadow={false} />
      <Table w={tableW} d={tableD} position={[0, 0, 0.2]} />
      {Array.from({ length: perSide }).map((_, i) => (
        <Chair key={`f${i}`} position={[chairX(i, perSide), 0, 0.2 + tableD / 2 + 0.36]} />
      ))}
      {Array.from({ length: n - perSide }).map((_, i) => (
        <Chair key={`b${i}`} position={[chairX(i, n - perSide), 0, 0.2 - tableD / 2 - 0.36]} rotation={Math.PI} />
      ))}
      <Part geometry={rbox(0.5, 0.8, Math.min(3.2, d * 0.5), 0.03)} material={M.ink} position={[w / 2 - 0.4, 0.4, -d / 4]} />
    </>
  );
}

function TrainingHallInterior({ w, d, seats, lit }: Interior) {
  const n = Math.min(seats, 60);
  const cols = Math.max(4, Math.min(14, Math.floor((w - 1.4) / 0.78)));
  const rows = Math.ceil(n / cols);
  const x0 = -((cols - 1) * 0.78) / 2;
  return (
    <>
      <Part geometry={rbox(w * 0.7, 0.2, 1.7, 0.04)} material={M.mist} position={[0, 0.1, -d / 2 + 1.05]} />
      <Part geometry={rbox(w * 0.44, 1.5, 0.06, 0.02)} material={M.ink} position={[0, 1.3, -d / 2 + 0.12]} />
      <Part geometry={cube(w * 0.43, 1.4, 0.004)} material={lit ? M.screenOn : M.screenOff} position={[0, 1.3, -d / 2 + 0.145]} castShadow={false} />
      <Part geometry={rbox(0.5, 1.05, 0.4, 0.03)} material={M.ink} position={[w * 0.2, 0.72, -d / 2 + 1.25]} />
      <Rows cols={cols} rows={rows} x0={x0} z0={-d / 2 + 3.0} dx={0.78} dz={0.8} count={n} scale={0.85} />
    </>
  );
}

function OfficeInterior({ w, d, seats }: Interior) {
  const desks = Math.min(4, Math.max(2, Math.ceil(seats / 2)));
  return (
    <>
      {Array.from({ length: desks }).map((_, i) => {
        const x = -w / 2 + 1 + (i * (w - 2)) / Math.max(1, desks - 1);
        return (
          <group key={i} position={[x, 0, -d / 2 + 1.05]}>
            <Part geometry={rbox(1.15, 0.05, 0.62, 0.025)} material={M.white} position-y={0.74} />
            <Part geometry={cube(0.05, 0.72, 0.56)} material={M.ink} position={[-0.52, 0.36, 0]} />
            <Part geometry={cube(0.05, 0.72, 0.56)} material={M.ink} position={[0.52, 0.36, 0]} />
            <Part geometry={rbox(0.44, 0.27, 0.025, 0.012)} material={M.ink} position={[0, 1.04, -0.2]} />
            <Chair position={[0, 0, 0.5]} />
          </group>
        );
      })}
    </>
  );
}

function ExecutiveInterior({ w, d, lit }: Interior) {
  return (
    <>
      <group position={[w * 0.12, 0, -d / 2 + 1.35]}>
        <Part geometry={rbox(1.9, 0.06, 0.9, 0.03)} material={M.white} position-y={0.76} />
        <Part geometry={rbox(0.5, 0.7, 0.8, 0.03)} material={M.ink} position={[-0.7, 0.36, 0]} />
        <Part geometry={rbox(0.5, 0.7, 0.8, 0.03)} material={M.ink} position={[0.7, 0.36, 0]} />
        <Part geometry={rbox(0.6, 0.34, 0.03, 0.014)} material={M.ink} position={[0, 1.1, -0.28]} />
        <Part geometry={cube(0.54, 0.28, 0.004)} material={lit ? M.screenOn : M.screenOff} position={[0, 1.1, -0.2635]} castShadow={false} />
        <Chair position={[0, 0, 0.78]} scale={1.1} />
      </group>
      <Sofa position={[-w / 2 + 0.7, 0, d * 0.12]} width={2.2} rotation={Math.PI / 2} />
      <Part geometry={rbox(0.9, 0.34, 0.6, 0.05)} material={M.white} position={[-w / 2 + 2.0, 0.2, d * 0.12]} />
      <Plant position={[w / 2 - 0.5, 0, -d / 2 + 0.5]} />
    </>
  );
}

export function RoomShape({ p }: { p: Placed }) {
  const { w, d, item } = p;
  const style = styleKey(item.kind, item.style);
  const h = wallHeight(item.kind);
  const corporate = item.kind === 'corporate_room';
  const door = corporate ? Math.min(2.2, w * 0.24) : Math.min(1.25, w * 0.34);
  const lit = item.tone === 'busy' || item.tone === 'mine';
  const props: Interior = { w, d, seats: item.capacity, lit };

  return (
    <group>
      <Inlay w={w - 0.08} d={d - 0.08} tone={item.tone} />
      <Panes w={w} d={d} h={h} door={door} frosted={corporate || item.kind === 'office'} />

      {/* Busy light over the door, and a threshold in signal yellow */}
      <Part geometry={rbox(door * 0.8, 0.07, 0.05, 0.02)} material={lampMat(item.tone)} position={[0, h - 0.13, d / 2 - 0.03]} castShadow={false} />
      <Part geometry={cube(door, 0.02, 0.1)} material={M.signal} position={[0, 0.03, d / 2 - 0.05]} castShadow={false} />

      {item.kind === 'office' ? (
        style === 'executive' ? (
          <ExecutiveInterior {...props} />
        ) : (
          <OfficeInterior {...props} />
        )
      ) : style === 'phone_booth' ? (
        <PhoneBoothInterior {...props} />
      ) : style === 'huddle' ? (
        <HuddleInterior {...props} />
      ) : style === 'training' ? (
        <TrainingInterior {...props} />
      ) : style === 'boardroom' ? (
        <BoardroomInterior {...props} />
      ) : style === 'training_hall' ? (
        <TrainingHallInterior {...props} />
      ) : (
        <MeetingInterior {...props} />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Desks

export function DeskShape({ p }: { p: Placed }) {
  const { item } = p;
  const style = styleKey(item.kind, item.style);
  const taken = item.tone === 'busy' || item.tone === 'mine';
  const dedicated = item.kind === 'dedicated_desk';
  const standing = style === 'standing';
  const corner = style === 'corner';
  const top = standing ? 1.08 : 0.74;

  return (
    <group>
      <Inlay w={p.w} d={p.d} tone={item.tone} />
      {corner ? (
        <>
          <Part geometry={rbox(1.55, 0.05, 0.78, 0.025)} material={M.white} position={[-0.15, top, -0.42]} />
          <Part geometry={rbox(0.62, 0.05, 1.45, 0.025)} material={M.white} position={[0.62, top, -0.1]} />
          <Part geometry={cube(0.05, top - 0.02, 0.7)} material={M.ink} position={[-0.88, top / 2, -0.42]} />
          <Part geometry={cube(0.5, top - 0.02, 0.05)} material={M.ink} position={[0.62, top / 2, 0.6]} />
          <Part geometry={cube(0.05, top - 0.02, 0.5)} material={M.ink} position={[-0.15, top / 2, -0.8]} />
          <group position={[-0.25, 0, -0.64]}>
            <Part geometry={cube(0.04, 0.2, 0.03)} material={M.mist} position-y={0.87} />
            <Part geometry={rbox(0.58, 0.34, 0.03, 0.014)} material={M.ink} position-y={1.1} />
            <Part geometry={cube(0.52, 0.28, 0.004)} material={taken ? M.screenOn : M.screenOff} position={[0, 1.1, 0.0165]} castShadow={false} />
          </group>
          <Part geometry={rbox(0.36, 0.014, 0.12, 0.006)} material={M.mist} position={[-0.25, top + 0.035, -0.22]} />
        </>
      ) : (
        <>
          <Part geometry={rbox(1.5, 0.05, 0.78, 0.025)} material={M.white} position={[0, top, -0.36]} />
          <Part geometry={cube(0.05, top - 0.02, 0.7)} material={M.ink} position={[-0.68, top / 2, -0.36]} />
          <Part geometry={cube(0.05, top - 0.02, 0.7)} material={M.ink} position={[0.68, top / 2, -0.36]} />
          <Part geometry={cube(0.04, 0.2, 0.03)} material={M.mist} position={[0, top + 0.13, -0.62]} />
          <Part geometry={rbox(0.58, 0.34, 0.03, 0.014)} material={M.ink} position={[0, top + 0.36, -0.64]} />
          <Part geometry={cube(0.52, 0.28, 0.004)} material={taken ? M.screenOn : M.screenOff} position={[0, top + 0.36, -0.6235]} castShadow={false} />
          <Part geometry={rbox(0.36, 0.014, 0.12, 0.006)} material={M.mist} position={[0, top + 0.035, -0.2]} />
        </>
      )}
      {dedicated && !corner && (
        <>
          <Part geometry={cube(0.03, 0.5, 0.78)} material={M.glass} position={[-0.78, top + 0.26, -0.36]} castShadow={false} renderOrder={2} />
          <Part geometry={cube(0.03, 0.5, 0.78)} material={M.glass} position={[0.78, top + 0.26, -0.36]} castShadow={false} renderOrder={2} />
        </>
      )}
      {standing ? (
        <Part geometry={rbox(0.9, 0.03, 0.55, 0.015)} material={M.fabric} position={[0, 0.02, 0.36]} castShadow={false} />
      ) : (
        <Chair position={[corner ? -0.15 : 0, 0, 0.42]} />
      )}
      {taken && !dedicated && <Person tone={item.tone} standing={standing} position={[corner ? -0.15 : 0, standing ? 0 : 0.5, standing ? 0.4 : 0.38]} />}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Things that are not booked

export function CoreBlock({ c }: { c: Core }) {
  return (
    <group position={[c.x, 0, c.z]}>
      <Part geometry={rbox(c.w, CORE_HEIGHT, c.d, 0.08)} material={M.core} position-y={CORE_HEIGHT / 2} />
      {/* Lift doors: two panels and a line of signal yellow where they meet */}
      <Part geometry={cube(0.66, 1.75, 0.03)} material={M.ink} position={[-0.36, 0.95, c.d / 2 + 0.005]} castShadow={false} />
      <Part geometry={cube(0.66, 1.75, 0.03)} material={M.ink} position={[0.36, 0.95, c.d / 2 + 0.005]} castShadow={false} />
      <Part geometry={cube(0.035, 1.75, 0.035)} material={M.signal} position={[0, 0.95, c.d / 2 + 0.01]} castShadow={false} />
    </group>
  );
}

function Kitchen({ w, d }: { w: number; d: number }) {
  const islandW = Math.max(1.4, w * 0.5);
  return (
    <>
      <Part geometry={fill(w, d, 0.12, 0.02)} material={M.mist} castShadow={false} />
      {/* Cabinets and worktop along the back wall */}
      <Part geometry={rbox(w - 0.9, 0.86, 0.62, 0.02)} material={M.ink} position={[0.45, 0.43, -d / 2 + 0.34]} />
      <Part geometry={rbox(w - 0.88, 0.05, 0.66, 0.02)} material={M.white} position={[0.45, 0.9, -d / 2 + 0.34]} />
      <Part geometry={rbox(0.5, 0.012, 0.36, 0.006)} material={M.steel} position={[0.1, 0.93, -d / 2 + 0.36]} />
      <Part geometry={cyl(0.015, 0.015, 0.26)} material={M.steel} position={[0.1, 1.05, -d / 2 + 0.16]} />
      {/* Fridge */}
      <Part geometry={rbox(0.78, 1.85, 0.7, 0.04)} material={M.white} position={[-w / 2 + 0.42, 0.93, -d / 2 + 0.38]} />
      <Part geometry={cube(0.02, 0.5, 0.02)} material={M.steel} position={[-w / 2 + 0.74, 1.2, -d / 2 + 0.75]} />
      {/* Island with stools */}
      <Part geometry={rbox(islandW, 0.86, 0.75, 0.02)} material={M.ink} position={[0.4, 0.43, d / 2 - 0.85]} />
      <Part geometry={rbox(islandW + 0.1, 0.05, 0.9, 0.02)} material={M.white} position={[0.4, 0.9, d / 2 - 0.85]} />
      {[-0.35, 0.35].map((o) => (
        <Stool key={o} position={[0.4 + o * (islandW / 1.6), 0, d / 2 - 0.2]} height={0.66} />
      ))}
    </>
  );
}

function CoffeeMachine({ w, d }: { w: number; d: number }) {
  return (
    <>
      <Part geometry={rbox(w, 0.88, d, 0.02)} material={M.ink} position-y={0.44} />
      <Part geometry={rbox(w + 0.04, 0.05, d + 0.04, 0.02)} material={M.white} position-y={0.9} />
      <Part geometry={rbox(0.42, 0.5, 0.42, 0.04)} material={M.steel} position={[-w * 0.15, 1.18, -d * 0.1]} />
      <Part geometry={cube(0.12, 0.03, 0.025)} material={M.signal} position={[-w * 0.15, 1.3, d * 0.1]} castShadow={false} />
      <Part geometry={cyl(0.03, 0.03, 0.1)} material={M.ink} position={[-w * 0.15, 1.02, d * 0.12]} />
      {[0.22, 0.34].map((o) => (
        <Part key={o} geometry={cyl(0.045, 0.035, 0.09)} material={M.white} position={[o + w * 0.1, 0.975, d * 0.05]} />
      ))}
    </>
  );
}

function Lounge({ w, d }: { w: number; d: number }) {
  return (
    <>
      <Part geometry={fill(w, d, 0.2, 0.025)} material={M.rug} castShadow={false} />
      <Sofa position={[0, 0.02, -d / 2 + 0.6]} width={Math.min(w - 0.4, 2.8)} />
      <Sofa position={[-w / 2 + 0.55, 0.02, 0.2]} width={Math.min(d - 1.1, 1.6)} rotation={Math.PI / 2} />
      <Part geometry={rbox(Math.min(1.1, w * 0.35), 0.34, 0.65, 0.05)} material={M.white} position={[0.1, 0.19, 0.25]} />
      <Plant position={[w / 2 - 0.35, 0.02, -d / 2 + 0.35]} scale={0.9} />
    </>
  );
}

function PrintStation({ w, d }: { w: number; d: number }) {
  return (
    <>
      <Part geometry={rbox(w, 0.82, d, 0.02)} material={M.mist} position-y={0.41} />
      <Part geometry={rbox(w * 0.7, 0.3, d * 0.75, 0.04)} material={M.ink} position-y={0.97} />
      <Part geometry={cube(0.08, 0.02, 0.02)} material={M.signal} position={[w * 0.2, 1.05, d * 0.36]} castShadow={false} />
      <Part geometry={rbox(w * 0.5, 0.012, 0.2, 0.006)} material={M.white} position={[0, 0.84 + 0.17, d * 0.42]} />
    </>
  );
}

function Reception({ w, d }: { w: number; d: number }) {
  return (
    <>
      <Part geometry={rbox(w, 1.05, d, 0.04)} material={M.ink} position-y={0.52} />
      <Part geometry={rbox(w + 0.12, 0.06, d + 0.12, 0.03)} material={M.white} position-y={1.08} />
      <Part geometry={cube(w * 0.4, 0.05, 0.02)} material={M.signal} position={[0, 0.75, d / 2 + 0.012]} castShadow={false} />
      <Part geometry={rbox(0.5, 0.32, 0.03, 0.014)} material={M.ink} position={[-w * 0.2, 1.36, -d * 0.1]} />
      <Chair position={[0, 0, -d / 2 - 0.45]} rotation={Math.PI} />
    </>
  );
}

export function ObjectShape({ o }: { o: PlacedObject }) {
  switch (o.type) {
    case 'kitchen':
      return <Kitchen w={o.w} d={o.d} />;
    case 'coffee_machine':
      return <CoffeeMachine w={o.w} d={o.d} />;
    case 'lounge':
      return <Lounge w={o.w} d={o.d} />;
    case 'print_station':
      return <PrintStation w={o.w} d={o.d} />;
    case 'reception':
      return <Reception w={o.w} d={o.d} />;
    case 'plant':
      return <Plant position={[0, 0, 0]} scale={Math.max(0.8, o.w / 0.8)} />;
    case 'core':
      return <CoreBlock c={{ x: 0, z: 0, w: o.w, d: o.d }} />;
    default:
      return null;
  }
}

/** The pale tile under a pod of open-plan desks. */
export function ZoneInlay({ z }: { z: Zone }) {
  return <Part geometry={fill(z.w, z.d, 0.35, 0.012)} material={z.kind === 'open' ? M.inlay : M.inlayReserved} position={[z.x, 0, z.z]} castShadow={false} />;
}

export function Plate({ w, d, rim }: { w: number; d: number; rim: boolean }) {
  return (
    <group>
      <Part geometry={rbox(w, 0.16, d, 0.2)} material={M.plate} position-y={-0.08} />
      {rim && <Part geometry={rbox(w + 0.02, 0.035, d + 0.02, 0.012)} material={M.signal} position-y={-0.178} castShadow={false} />}
      <Part geometry={rbox(w - 0.6, 0.24, d - 0.6, 0.1)} material={M.base} position-y={-0.3} />
    </group>
  );
}

export { noRay };
