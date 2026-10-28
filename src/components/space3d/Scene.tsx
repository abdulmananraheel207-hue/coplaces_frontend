import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { SpaceItem } from '../../lib/spaceState';
import { isDeskKind, mayOverlap } from '../../lib/catalogue';
import { floorKey, footprint, wallHeight, type Box, type FloorLayout, type LabelSpec, type Placed, type PlacedObject, type StackPlan, type StackSlot } from './layout';
import { CoreBlock, Plate, ZoneInlay, noRay } from './shapes';
import { ObjectBody, ResourceBody, extraHeight, objectHeight } from './shapesExtra';
import { M, fill, mk, reducedMotion, ring, ringMat } from './three-kit';

// ---------------------------------------------------------------------------------------------
// Editing

/** What the editor hands to the scene while a floor plan is being edited. Positions are the plan's own coordinates. */
export interface EditApi {
  /** The floor being edited. Only this floor takes part. */
  floorKey: string;
  /** What is armed to be placed, drawn as a ghost that follows the pointer. */
  ghost: { placed: Placed } | { object: PlacedObject } | null;
  /**
   * Whether something of this size would sit clear of everything else on the floor. `ignore` are the things being moved
   * and `free` is true for a thing that may sit over others, such as a wall or a zone.
   */
  fits: (box: Box, ignore?: readonly string[], free?: boolean) => boolean;
  /** The boxes of everything on the floor except these, for lining a dragged thing up with. */
  others: (ignore: readonly string[]) => Box[];
  /** What is selected now. Several can be, and they move together. */
  selectedIds: readonly string[];
  /** Where each of the moved things now sits. */
  onMoveMany: (moves: { id: string; x: number; z: number }[]) => void;
  onPlace: (x: number, z: number) => void;
  /** Pointing at a thing selects it. `additive` (Shift) adds it to the selection, or takes it out when it is already in. */
  onSelect: (id: string | null, additive?: boolean) => void;
  /** A box drawn round several things with Shift held. */
  onMarquee: (ids: string[], additive: boolean) => void;
  /** Picking and moving, or measuring the distance between two points. */
  tool: 'select' | 'measure';
  /** The distance just measured, in metres, or null when a new measurement starts. */
  onMeasured: (metres: number | null) => void;
  /** Metres. Things snap to this grid. */
  snap: number;
}

/** A floor plan picture drawn flat under the floor being edited, to trace over. Plan coordinates, metres. */
export interface Underlay {
  floorKey: string;
  url: string;
  /** Its top left corner. */
  x: number;
  z: number;
  w: number;
  d: number;
  opacity: number;
}

interface HitEntry {
  root: THREE.Group;
  mesh: THREE.Mesh;
  w: number;
  d: number;
  rot: number;
  /** It may sit over other things, so it never blocks and is never blocked. */
  free: boolean;
}
type Registry = React.RefObject<Map<string, HitEntry>>;

/** Mutable state the label overlay and the editor read every frame without re-rendering React. */
interface Live {
  y: Record<string, number>;
  shown: Record<string, boolean>;
  building: boolean;
  /** Where something being dragged is right now, so its tag follows it. */
  moved: Record<string, { x: number; z: number }>;
}

// ---------------------------------------------------------------------------------------------
// Pieces

type Mode = 'none' | 'view' | 'edit';

/** One room, desk or object on the floor: places it, turns it, lifts it when pointed at, and owns its hit box. */
function Piece({
  id,
  x,
  z,
  w,
  d,
  rot,
  height,
  selected,
  mode,
  registry,
  free = false,
  onSelect,
  onHover,
  children,
}: {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  height: number;
  selected: boolean;
  mode: Mode;
  registry?: Registry;
  free?: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (mode !== 'edit' || !registry?.current || !root.current || !hit.current) return;
    const map = registry.current;
    map.set(id, { root: root.current, mesh: hit.current, w, d, rot, free });
    return () => {
      map.delete(id);
    };
  }, [mode, registry, id, w, d, rot, free]);

  // Lift a little on hover or selection. Rendering is on demand, so keep asking for frames until it settles.
  useFrame((_, dt) => {
    const g = body.current;
    if (!g) return;
    const target = hover || selected ? 0.2 : 0;
    const next = reducedMotion() ? target : g.position.y + (target - g.position.y) * Math.min(1, dt * 12);
    g.position.y = Math.abs(target - next) < 0.003 ? target : next;
    if (g.position.y !== target) invalidate();
  });

  return (
    <group ref={root} position={[x, 0, z]} rotation-y={(rot * Math.PI) / 2}>
      <group ref={body}>{children}</group>
      {selected && <mesh raycast={noRay} geometry={ring(w + 0.6, d + 0.6, 0.11, 0.3, 0.02)} material={M.signal} position-y={0.04} />}
      {/* The one thing the pointer tests. */}
      {mode !== 'none' && (
        <mesh
          ref={hit}
          position-y={height / 2}
          {...(mode === 'view'
            ? {
                onPointerOver: (e: { stopPropagation: () => void }) => {
                  e.stopPropagation();
                  setHover(true);
                  onHover?.(id);
                  document.body.style.cursor = 'pointer';
                },
                onPointerOut: () => {
                  setHover(false);
                  onHover?.(null);
                  document.body.style.cursor = '';
                },
                onClick: (e: { stopPropagation: () => void }) => {
                  e.stopPropagation();
                  onSelect?.(id);
                },
              }
            : {})}
        >
          <boxGeometry args={[Math.max(w, 0.9), height, Math.max(d, 0.9)]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
}

const heightOf = (i: SpaceItem) => extraHeight(i) ?? (isDeskKind(i.kind) ? 1.4 : wallHeight(i.kind));

function ResourceUnit({ p, selected, mode, registry, onSelect, onHover }: { p: Placed; selected: boolean; mode: Mode; registry?: Registry; onSelect: (id: string) => void; onHover: (id: string | null) => void }) {
  return (
    <Piece id={p.item.id} x={p.x} z={p.z} w={p.w} d={p.d} rot={p.rot} height={heightOf(p.item)} selected={selected} mode={mode} registry={registry} onSelect={onSelect} onHover={onHover}>
      <ResourceBody p={p} />
    </Piece>
  );
}

function ObjectUnit({ o, siblings, selected, mode, registry }: { o: PlacedObject; siblings: PlacedObject[]; selected: boolean; mode: Mode; registry?: Registry }) {
  return (
    <Piece id={o.id} x={o.x} z={o.z} w={o.w} d={o.d} rot={o.rot} height={objectHeight(o.type)} selected={selected} mode={mode} registry={registry} free={mayOverlap(o.type)}>
      <ObjectBody o={o} siblings={siblings} />
    </Piece>
  );
}

/** The uploaded plan, lying on the floor. It never takes clicks, so everything above it stays easy to pick. */
function PlanPicture({ u, origin }: { u: Underlay; origin: { x: number; z: number } }) {
  const invalidate = useThree((s) => s.invalidate);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let live = true;
    const tex = new THREE.TextureLoader().load(u.url, () => {
      if (!live) return;
      setTexture(tex);
      invalidate();
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return () => {
      live = false;
      tex.dispose();
    };
  }, [u.url, invalidate]);

  if (!texture) return null;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[u.x + u.w / 2 - origin.x, 0.008, u.z + u.d / 2 - origin.z]} raycast={noRay} renderOrder={1}>
      <planeGeometry args={[u.w, u.d]} />
      <meshBasicMaterial map={texture} transparent opacity={u.opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** From quiet to busy: pale blue, through the signal yellow, to brick red. */
const HEAT = ['#dce7f2', '#f3e6a6', '#f6c324', '#e0802a', '#b8381a'].map((c) => new THREE.Color(c));
const heatMats = new Map<number, THREE.Material>();
function heatMat(v: number) {
  const step = Math.round(Math.min(1, Math.max(0, v)) * 20);
  let m = heatMats.get(step);
  if (!m) {
    const t = (step / 20) * (HEAT.length - 1);
    const i = Math.min(HEAT.length - 2, Math.floor(t));
    m = mk(`#${HEAT[i]!.clone().lerp(HEAT[i + 1]!, t - i).getHexString()}`, { roughness: 0.9, transparent: true, opacity: 0.9 });
    heatMats.set(step, m);
  }
  return m;
}

/** A space coloured by how busy it has been. It lies over the status colour and never takes clicks. */
function HeatTile({ p, v }: { p: Placed; v: number }) {
  return (
    <group position={[p.x, 0.06, p.z]} rotation-y={(p.rot * Math.PI) / 2}>
      <mesh raycast={noRay} geometry={fill(Math.max(0.5, p.w - 0.06), Math.max(0.5, p.d - 0.06), 0.12, 0.02)} material={heatMat(v)} renderOrder={1} />
    </group>
  );
}

const gridMaterial = new THREE.LineBasicMaterial({ color: '#aebbca', transparent: true, opacity: 0.6 });

/** A one-metre grid over the floor, lined up with the plan's own coordinates. */
function Grid({ f }: { f: FloorLayout }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const minX = f.cx - f.width / 2 + 0.6;
    const maxX = f.cx + f.width / 2 - 0.6;
    const minZ = f.cz - f.depth / 2 + 0.6;
    const maxZ = f.cz + f.depth / 2 - 0.6;
    for (let k = Math.ceil(minX + f.origin.x); k <= maxX + f.origin.x; k++) pts.push(k - f.origin.x, 0.012, minZ, k - f.origin.x, 0.012, maxZ);
    for (let k = Math.ceil(minZ + f.origin.z); k <= maxZ + f.origin.z; k++) pts.push(minX, 0.012, k - f.origin.z, maxX, 0.012, k - f.origin.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [f.cx, f.cz, f.width, f.depth, f.origin.x, f.origin.z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments raycast={noRay} geometry={geometry} material={gridMaterial} />;
}

// ---------------------------------------------------------------------------------------------
// Stage

function FloorStage({
  slot,
  rim,
  live,
  selectedId,
  onSelect,
  onHover,
  edit,
  underlay,
  registry,
  heat,
}: {
  slot: StackSlot;
  rim: boolean;
  live: React.RefObject<Live>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  edit?: EditApi;
  underlay?: Underlay;
  registry: Registry;
  heat?: Record<string, number>;
}) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { floor, mode } = slot;
  const key = floorKey(floor.floor);
  const editing = !!edit && edit.floorKey === key && mode === 'full';
  const unitMode: Mode = editing ? 'edit' : edit ? 'none' : 'view';
  const isSelected = (id: string) => id === selectedId || (editing && !!edit!.selectedIds.includes(id));

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.position.y = slot.y;
    g.visible = mode !== 'away';
    live.current.y[key] = slot.y;
    live.current.shown[key] = mode === 'full';
    // Only the first placement is instant; later changes animate in the frame loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    invalidate();
  }, [slot.y, mode, invalidate]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const next = reducedMotion() ? slot.y : g.position.y + (slot.y - g.position.y) * Math.min(1, dt * 6.5);
    const settled = Math.abs(slot.y - next) < 0.004;
    g.position.y = settled ? slot.y : next;
    g.visible = mode !== 'away' || !settled;
    live.current.y[key] = g.position.y;
    live.current.shown[key] = mode === 'full' && g.visible;
    if (!settled) invalidate();
  });

  return (
    <group ref={group}>
      <group position={[floor.cx, 0, floor.cz]}>
        <Plate w={floor.width} d={floor.depth} rim={rim} />
      </group>
      {mode === 'full' && (
        <>
          {editing && underlay?.floorKey === key && <PlanPicture u={underlay} origin={floor.origin} />}
          {editing && <Grid f={floor} />}
          {floor.zones.map((z, i) => (
            <ZoneInlay key={i} z={z} />
          ))}
          {floor.core && <CoreBlock c={floor.core} />}
          {floor.placed.map((p) => (
            <ResourceUnit key={p.item.id} p={p} selected={isSelected(p.item.id)} mode={unitMode} registry={registry} onSelect={onSelect} onHover={onHover} />
          ))}
          {heat && floor.placed.map((p) => (heat[p.item.id] === undefined ? null : <HeatTile key={`heat-${p.item.id}`} p={p} v={heat[p.item.id]!} />))}
          {floor.objects.map((o) => (
            <ObjectUnit key={o.id} o={o} siblings={floor.objects} selected={isSelected(o.id)} mode={editing ? 'edit' : 'none'} registry={registry} />
          ))}
        </>
      )}
    </group>
  );
}

/** The studio: a soft procedural environment for reflections, built in code so nothing is fetched. */
function Studio() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.3;
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

// A floor is studied from fairly high up. The stacked building is seen lower and flatter, so each floor
// clears the one above it instead of hiding behind it.
const FLOOR_VIEW = new THREE.Vector3(0.5, 0.66, 0.8).normalize();
const BUILDING_VIEW = new THREE.Vector3(0.5, 0.4, 0.86).normalize();

type ControlsLike = {
  target: THREE.Vector3;
  enabled: boolean;
  update: () => void;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
};

interface Fit {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

function CameraRig({ fit, building, resetKey }: { fit: Fit; building: boolean; resetKey: number }) {
  const { camera, size, invalidate } = useThree();
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const goal = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), active: false, speed: 2.6 });
  const first = useRef(true);
  const { cx, cy, cz, radius } = fit;

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const vfov = THREE.MathUtils.degToRad(persp.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(1, size.height)));
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.93;
    goal.current.look.set(cx, cy, cz);
    goal.current.pos.copy(goal.current.look).addScaledVector(building ? BUILDING_VIEW : FLOOR_VIEW, dist);
    goal.current.active = true;
    // The first move is a slow glide in from afar; later moves are quicker.
    goal.current.speed = first.current ? 2.4 : 5;
    first.current = false;
    if (reducedMotion()) {
      camera.position.copy(goal.current.pos);
      if (controls) {
        controls.target.copy(goal.current.look);
        controls.update();
      }
      goal.current.active = false;
    }
    invalidate();
  }, [cx, cy, cz, radius, building, resetKey, size.width, size.height, camera, controls, invalidate]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      goal.current.active = false;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g.active || !controls) return;
    const k = Math.min(1, dt * g.speed);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.look, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.05 && controls.target.distanceTo(g.look) < 0.05) g.active = false;
    else invalidate();
  });
  return null;
}

const tmp = new THREE.Vector3();

/** Keeps the DOM tags in the overlay pinned to their 3D positions, scaled by distance, and hides the ones that should not show. */
function LabelProjector({ labels, overlay, live, refDistance }: { labels: LabelSpec[]; overlay: React.RefObject<HTMLDivElement | null>; live: React.RefObject<Live>; refDistance: number }) {
  const { camera, size, invalidate } = useThree();
  const nodes = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    nodes.current = new Map();
    overlay.current?.querySelectorAll<HTMLElement>('[data-label]').forEach((el) => nodes.current.set(el.dataset.label!, el));
    invalidate();
  }, [labels, overlay, invalidate]);

  useFrame(() => {
    const L = live.current;
    for (const l of labels) {
      const el = nodes.current.get(l.id);
      if (!el) continue;
      const floorShown = l.kind === 'floor' ? L.building : L.shown[l.floorKey];
      const dragged = L.moved[l.id];
      tmp.set(dragged ? dragged.x : l.pos[0], l.pos[1] + (L.y[l.floorKey] ?? 0), dragged ? dragged.z : l.pos[2]);
      const dist = camera.position.distanceTo(tmp);
      tmp.project(camera);
      // Desk numbers are too many to read when the whole building is on show.
      const hidden = !floorShown || tmp.z > 1 || tmp.z < -1 || ((l.kind === 'desk' || l.kind === 'note') && L.building);
      el.style.visibility = hidden ? 'hidden' : 'visible';
      if (hidden) continue;
      const scale = Math.min(1.2, Math.max(0.78, refDistance / dist));
      const x = ((tmp.x + 1) / 2) * size.width;
      const y = ((1 - tmp.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, ${l.kind === 'floor' ? '-50%' : '-100%'}) scale(${scale.toFixed(3)})`;
      el.style.zIndex = String(Math.round(5000 - dist * 10) + (el.dataset.raise ? 10000 : 0));
    }
  });
  return null;
}

// ---------------------------------------------------------------------------------------------
// The editor's hands

interface GuideParts {
  lines: THREE.LineSegments | null;
}

interface GhostParts {
  group: THREE.Group | null;
  ok: THREE.Object3D | null;
  bad: THREE.Object3D | null;
}

/** A footprint outline, green where the thing would fit and brick-red where it would not. */
function Ghost({ edit, parts }: { edit: EditApi; parts: React.RefObject<GhostParts> }) {
  const g = edit.ghost!;
  const isPlaced = 'placed' in g;
  const box = isPlaced ? g.placed : g.object;
  const { w, d, rot } = box;
  const group = useRef<THREE.Group>(null);
  const ok = useRef<THREE.Mesh>(null);
  const bad = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    parts.current.group = group.current;
    parts.current.ok = ok.current;
    parts.current.bad = bad.current;
    if (group.current) group.current.visible = false;
    return () => {
      parts.current.group = null;
    };
  }, [parts]);

  return (
    <group ref={group} rotation-y={(rot * Math.PI) / 2}>
      <group position-y={0.15}>{isPlaced ? <ResourceBody p={g.placed} /> : <ObjectBody o={g.object} siblings={[]} />}</group>
      <mesh ref={ok} raycast={noRay} geometry={ring(w + 0.3, d + 0.3, 0.1, 0.3, 0.02)} material={ringMat('ok')} position-y={0.05} />
      <mesh ref={bad} raycast={noRay} geometry={ring(w + 0.3, d + 0.3, 0.1, 0.3, 0.02)} material={ringMat('busy')} position-y={0.05} visible={false} />
    </group>
  );
}

/** Thin yellow lines that appear while something is dragged, to show it is lined up with another thing. */
function Guides({ parts }: { parts: React.RefObject<GuideParts> }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 2 * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: '#f6c324', transparent: true, opacity: 0.95, depthTest: false }), []);
  const lines = useRef<THREE.LineSegments>(null);
  useLayoutEffect(() => {
    parts.current.lines = lines.current;
    return () => {
      parts.current.lines = null;
    };
  }, [parts]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <lineSegments ref={lines} geometry={geometry} material={material} raycast={noRay} renderOrder={5} frustumCulled={false} />;
}

/** Click two points on the floor to read the distance between them, in metres. */
function MeasureTool({ edit, origin, live }: { edit: EditApi; origin: { x: number; z: number }; live: React.RefObject<Live> }) {
  const { gl, camera, raycaster, scene, invalidate } = useThree();
  const latest = useRef({ edit, origin });
  latest.current = { edit, origin };

  useEffect(() => {
    const el = gl.domElement;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const point = new THREE.Vector3();
    const group = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#f6c324', depthTest: false }));
    line.renderOrder = 6;
    line.frustumCulled = false;
    const dotGeo = new THREE.SphereGeometry(0.1, 12, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: '#f6c324', depthTest: false });
    const dots = [new THREE.Mesh(dotGeo, dotMat), new THREE.Mesh(dotGeo, dotMat)];
    for (const d of dots) {
      d.renderOrder = 6;
      d.visible = false;
      group.add(d);
    }
    group.add(line);
    group.visible = false;
    scene.add(group);

    const tag = document.createElement('div');
    tag.className = 'num pointer-events-none absolute z-10 rounded-full bg-ink px-2.5 py-1 text-[12px] font-bold text-signal ring-1 ring-white/30';
    tag.style.display = 'none';
    el.parentElement?.appendChild(tag);

    let a: THREE.Vector3 | null = null;
    let b: THREE.Vector3 | null = null;
    let press: { x: number; y: number } | null = null;
    const snap = (v: number) => Math.round(v * 10) / 10;

    const ground = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, point) ? new THREE.Vector3(snap(point.x), 0.07, snap(point.z)) : null;
    };
    const draw = (end: THREE.Vector3 | null, e?: PointerEvent) => {
      if (!a) {
        group.visible = false;
        tag.style.display = 'none';
        return;
      }
      group.visible = true;
      dots[0]!.position.copy(a);
      dots[0]!.visible = true;
      const to = end ?? a;
      dots[1]!.position.copy(to);
      dots[1]!.visible = !!end;
      geometry.setFromPoints([a, to]);
      const dist = a.distanceTo(to);
      if (end && e) {
        const r = el.getBoundingClientRect();
        tag.textContent = `${dist.toFixed(2)} m`;
        tag.style.display = 'block';
        tag.style.left = `${e.clientX - r.left + 14}px`;
        tag.style.top = `${e.clientY - r.top - 30}px`;
      }
      invalidate();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      press = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      el.style.cursor = 'crosshair';
      if (a && !b) {
        const p = ground(e);
        if (p) draw(p, e);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4;
      press = null;
      if (moved) return;
      const p = ground(e);
      if (!p) return;
      if (!a || b) {
        a = p;
        b = null;
        latest.current.edit.onMeasured(null);
        draw(null);
      } else {
        b = p;
        draw(b, e);
        const dist = a.distanceTo(b);
        tag.style.display = 'none';
        latest.current.edit.onMeasured(dist);
      }
    };
    const onLeave = () => {
      if (!b) tag.style.display = 'none';
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);
    live.current.building = false;
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.style.cursor = '';
      scene.remove(group);
      geometry.dispose();
      line.material.dispose();
      dotGeo.dispose();
      dotMat.dispose();
      tag.remove();
      latest.current.edit.onMeasured(null);
      invalidate();
    };
  }, [gl, camera, raycaster, scene, invalidate, live]);

  return null;
}

/**
 * Picking, dragging and placing, done on the canvas element itself so it can claim a press before the orbit
 * controls do. A press on a room or desk selects it and, when moved, drags it on the floor, snapped to the
 * grid; a press on something in a selection drags the whole selection. Shift adds to the selection, and Shift
 * with a drag on the empty floor draws a box that selects what it covers. With something armed, a click on the
 * floor places it. While dragging, a thing that lines up with another snaps to it and a guide line shows it.
 */
function EditController({ edit, registry, live, origin, ghost, guides }: { edit: EditApi; registry: Registry; live: React.RefObject<Live>; origin: { x: number; z: number }; ghost: React.RefObject<GhostParts>; guides: React.RefObject<GuideParts> }) {
  const { gl, camera, raycaster, invalidate } = useThree();
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const latest = useRef({ edit, origin });
  latest.current = { edit, origin };

  useEffect(() => {
    const el = gl.domElement;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const point = new THREE.Vector3();
    const world = new THREE.Vector3();
    let press: { sx: number; sy: number; moved: boolean; id: string | null; collapse: boolean } | null = null;
    interface Drag {
      ids: string[];
      leader: string;
      offX: number;
      offZ: number;
      start: Map<string, { x: number; z: number }>;
      dx: number;
      dz: number;
      ok: boolean;
      /** Boxes of everything not being moved, in plan coordinates, to line up with. */
      others: Box[];
    }
    let drag: Drag | null = null;
    let marquee: { sx: number; sy: number; box: HTMLDivElement } | null = null;

    const aim = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    const ground = (e: PointerEvent) => {
      aim(e);
      return raycaster.ray.intersectPlane(plane, point) ? point : null;
    };
    const pick = (e: PointerEvent) => {
      aim(e);
      const entries = [...registry.current.entries()];
      const hit = raycaster.intersectObjects(entries.map(([, h]) => h.mesh), false)[0];
      return hit ? (entries.find(([, h]) => h.mesh === hit.object)?.[0] ?? null) : null;
    };
    const snap = (v: number) => Math.round(v / latest.current.edit.snap) * latest.current.edit.snap;
    const plan = (x: number, z: number) => ({ x: x + latest.current.origin.x, z: z + latest.current.origin.z });
    const mark = (target: { ok: THREE.Object3D | null; bad: THREE.Object3D | null }, fits: boolean) => {
      if (target.ok) target.ok.visible = fits;
      if (target.bad) target.bad.visible = !fits;
    };
    const measuring = () => latest.current.edit.tool === 'measure';

    const hideGuides = () => {
      const l = guides.current.lines;
      if (l) l.geometry.setDrawRange(0, 0);
    };
    /**
     * Nudges the leader so an edge or centre lines up with another thing's, when they are within a few centimetres, and
     * says which lines to draw. Returns how far it moved in x and z, in metres.
     */
    const lineUp = (d: Drag, x: number, z: number) => {
      const h = registry.current.get(d.leader);
      if (!h || !d.others.length) return { ax: 0, az: 0, lines: [] as [number, number, number, number][] };
      const at = plan(x, z);
      const me = footprint({ x: at.x, z: at.z, w: h.w, d: h.d, rot: h.rot });
      const mx = [me.minX, (me.minX + me.maxX) / 2, me.maxX];
      const mz = [me.minZ, (me.minZ + me.maxZ) / 2, me.maxZ];
      let ax = 0;
      let az = 0;
      let bestX = 0.12;
      let bestZ = 0.12;
      let lx: [number, number, number, number] | null = null;
      let lz: [number, number, number, number] | null = null;
      for (const o of d.others) {
        const f = footprint(o);
        const ox = [f.minX, (f.minX + f.maxX) / 2, f.maxX];
        const oz = [f.minZ, (f.minZ + f.maxZ) / 2, f.maxZ];
        for (const a of mx)
          for (const b of ox) {
            const diff = b - a;
            if (Math.abs(diff) < bestX) {
              bestX = Math.abs(diff);
              ax = diff;
              lx = [b, Math.min(me.minZ, f.minZ) - 0.4, b, Math.max(me.maxZ, f.maxZ) + 0.4];
            }
          }
        for (const a of mz)
          for (const b of oz) {
            const diff = b - a;
            if (Math.abs(diff) < bestZ) {
              bestZ = Math.abs(diff);
              az = diff;
              lz = [Math.min(me.minX, f.minX) - 0.4, b, Math.max(me.maxX, f.maxX) + 0.4, b];
            }
          }
      }
      return { ax, az, lines: [lx, lz].filter((l): l is [number, number, number, number] => !!l) };
    };
    const drawGuides = (lines: [number, number, number, number][]) => {
      const l = guides.current.lines;
      if (!l) return;
      const attr = l.geometry.getAttribute('position') as THREE.BufferAttribute;
      lines.forEach(([x0, z0, x1, z1], i) => {
        attr.setXYZ(i * 2, x0 - latest.current.origin.x, 0.08, z0 - latest.current.origin.z);
        attr.setXYZ(i * 2 + 1, x1 - latest.current.origin.x, 0.08, z1 - latest.current.origin.z);
      });
      attr.needsUpdate = true;
      l.geometry.setDrawRange(0, lines.length * 2);
    };

    const moveGhost = (e: PointerEvent) => {
      const g = ghost.current;
      const spec = latest.current.edit.ghost;
      if (!g.group || !spec) return;
      const p = ground(e);
      if (!p) return;
      const x = snap(p.x);
      const z = snap(p.z);
      const b = 'placed' in spec ? spec.placed : spec.object;
      g.group.position.set(x, 0, z);
      g.group.visible = true;
      const free = 'object' in spec && mayOverlap(spec.object.type);
      mark(g, latest.current.edit.fits({ ...plan(x, z), w: b.w, d: b.d, rot: b.rot }, [], free));
      invalidate();
    };

    const drawMarquee = (e: PointerEvent) => {
      if (!marquee) return;
      const r = el.getBoundingClientRect();
      const x0 = Math.min(marquee.sx, e.clientX) - r.left;
      const y0 = Math.min(marquee.sy, e.clientY) - r.top;
      Object.assign(marquee.box.style, { left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(e.clientX - marquee.sx)}px`, height: `${Math.abs(e.clientY - marquee.sy)}px` });
    };

    const onMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (press && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 4) press.moved = true;

      if (marquee) {
        drawMarquee(e);
        return;
      }

      if (drag) {
        const leader = registry.current.get(drag.leader);
        const p = ground(e);
        if (!leader || !p) return;
        const s0 = drag.start.get(drag.leader)!;
        let lx = snap(p.x + drag.offX);
        let lz = snap(p.z + drag.offZ);
        const near = lineUp(drag, lx, lz);
        lx += near.ax;
        lz += near.az;
        const test = (x: number, z: number) => {
          const dx = x - s0.x;
          const dz = z - s0.z;
          return drag!.ids.every((id) => {
            const h = registry.current.get(id);
            const s = drag!.start.get(id);
            return !!h && !!s && latest.current.edit.fits({ ...plan(s.x + dx, s.z + dz), w: h.w, d: h.d, rot: h.rot }, drag!.ids, h.free);
          });
        };
        // The line-up only helps if the thing still fits where it leads.
        let fitsHere = test(lx, lz);
        let guideLines = near.lines;
        if (!fitsHere && (near.ax || near.az)) {
          lx -= near.ax;
          lz -= near.az;
          fitsHere = test(lx, lz);
          guideLines = [];
        }
        drag.dx = lx - s0.x;
        drag.dz = lz - s0.z;
        drag.ok = fitsHere;
        for (const id of drag.ids) {
          const h = registry.current.get(id);
          const s = drag.start.get(id)!;
          if (!h) continue;
          h.root.position.set(s.x + drag.dx, 0, s.z + drag.dz);
          live.current.moved[id] = { x: s.x + drag.dx, z: s.z + drag.dz };
        }
        drawGuides(guideLines);
        el.style.cursor = drag.ok ? 'grabbing' : 'not-allowed';
        invalidate();
        return;
      }

      if (latest.current.edit.ghost) {
        el.style.cursor = 'crosshair';
        moveGhost(e);
        return;
      }
      el.style.cursor = pick(e) ? 'grab' : '';
    };

    const finish = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (controls) controls.enabled = true;
      const api = latest.current.edit;

      if (marquee) {
        const r = el.getBoundingClientRect();
        const x0 = Math.min(marquee.sx, e.clientX) - r.left;
        const x1 = Math.max(marquee.sx, e.clientX) - r.left;
        const y0 = Math.min(marquee.sy, e.clientY) - r.top;
        const y1 = Math.max(marquee.sy, e.clientY) - r.top;
        const inside: string[] = [];
        if (x1 - x0 > 4 || y1 - y0 > 4) {
          camera.updateMatrixWorld();
          for (const [id, h] of registry.current) {
            h.root.getWorldPosition(world);
            world.project(camera);
            const px = ((world.x + 1) / 2) * r.width;
            const py = ((1 - world.y) / 2) * r.height;
            if (px >= x0 && px <= x1 && py >= y0 && py <= y1) inside.push(id);
          }
          api.onMarquee(inside, true);
        }
        marquee.box.remove();
        marquee = null;
      } else if (drag) {
        const d = drag;
        const moved = d.dx !== 0 || d.dz !== 0;
        if (moved && d.ok) {
          api.onMoveMany(d.ids.map((id) => ({ id, ...plan(d.start.get(id)!.x + d.dx, d.start.get(id)!.z + d.dz) })));
        } else if (moved) {
          for (const id of d.ids) {
            const h = registry.current.get(id);
            const s = d.start.get(id)!;
            h?.root.position.set(s.x, 0, s.z);
          }
        } else if (press && !press.moved && press.collapse) {
          // A plain click on one of several selected things picks just that one.
          api.onSelect(d.leader, false);
        }
        for (const id of d.ids) delete live.current.moved[id];
        drag = null;
        hideGuides();
        el.style.cursor = '';
        invalidate();
      } else if (press && !press.moved && e.type === 'pointerup') {
        // A click, not a drag of the view.
        if (api.ghost) {
          const p = ground(e);
          if (p) {
            const x = snap(p.x);
            const z = snap(p.z);
            const b = 'placed' in api.ghost ? api.ghost.placed : api.ghost.object;
            const free = 'object' in api.ghost && mayOverlap(api.ghost.object.type);
            if (api.fits({ ...plan(x, z), w: b.w, d: b.d, rot: b.rot }, [], free)) api.onPlace(plan(x, z).x, plan(x, z).z);
          }
        } else if (!press.id && !e.shiftKey) {
          api.onSelect(null);
        }
      }
      press = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || measuring()) return;
      const api = latest.current.edit;
      const id = api.ghost ? null : pick(e);
      press = { sx: e.clientX, sy: e.clientY, moved: false, id, collapse: false };

      if (id && e.shiftKey) {
        // Shift adds to, or takes from, the selection, and does not start a drag.
        api.onSelect(id, true);
      } else if (id) {
        // Claim the press so the view does not turn while something is being moved.
        const h = registry.current.get(id);
        const p = ground(e);
        if (h && p) {
          if (controls) controls.enabled = false;
          const inSelection = api.selectedIds.includes(id) && api.selectedIds.length > 1;
          const ids = inSelection ? api.selectedIds.filter((x) => registry.current.has(x)) : [id];
          const start = new Map<string, { x: number; z: number }>();
          for (const k of ids) {
            const r = registry.current.get(k)!.root.position;
            start.set(k, { x: r.x, z: r.z });
          }
          press.collapse = inSelection;
          drag = {
            ids,
            leader: id,
            offX: h.root.position.x - p.x,
            offZ: h.root.position.z - p.z,
            start,
            dx: 0,
            dz: 0,
            ok: true,
            others: api.others(ids),
          };
          if (!inSelection) api.onSelect(id, false);
        }
      } else if (e.shiftKey && !api.ghost) {
        // Shift on the empty floor: draw a box to select what is inside it.
        if (controls) controls.enabled = false;
        const box = document.createElement('div');
        box.className = 'pointer-events-none absolute z-10 rounded-sm border-[1.5px] border-dashed border-signal bg-signal/15';
        el.parentElement?.appendChild(box);
        marquee = { sx: e.clientX, sy: e.clientY, box };
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    };

    const onHover = (e: PointerEvent) => {
      if (press || measuring()) return;
      onMove(e);
    };
    const onLeave = () => {
      if (ghost.current.group) ghost.current.group.visible = false;
      el.style.cursor = '';
      invalidate();
    };

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onHover);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onHover);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      marquee?.box.remove();
      if (controls) controls.enabled = true;
      el.style.cursor = '';
    };
  }, [gl, camera, raycaster, invalidate, controls, registry, live, ghost, guides]);

  return null;
}

// ---------------------------------------------------------------------------------------------

/** The scene only draws on demand; a turning model needs a frame every tick. */
function KeepDrawing() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      invalidate();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [invalidate]);
  return null;
}

export default function Scene({
  plan,
  labels,
  overlay,
  selectedId,
  onSelect,
  onHover,
  resetKey,
  edit,
  fit,
  underlay,
  heat,
  spin,
  dpr,
}: {
  plan: StackPlan;
  labels: LabelSpec[];
  overlay: React.RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  resetKey: number;
  /** Present while a floor plan is being edited. */
  edit?: EditApi;
  /** Frames the camera on this instead of the plan's bounds, so editing does not move the view. */
  fit?: Fit;
  /** A floor plan picture to trace over, shown only while editing. */
  underlay?: Underlay;
  /** How busy each space has been, 0 to 1 by space id. Draws a colour over each. */
  heat?: Record<string, number>;
  /** Turns the model slowly by itself, for display pages. */
  spin?: boolean;
  /** Pixel density range; display pages ask for more so edges stay sharp. */
  dpr?: [number, number];
}) {
  const live = useRef<Live>({ y: {}, shown: {}, building: false, moved: {} });
  live.current.building = plan.building;
  const registry = useRef<Map<string, HitEntry>>(new Map());
  const ghost = useRef<GhostParts>({ group: null, ok: null, bad: null });
  const guides = useRef<GuideParts>({ lines: null });
  const { cx, cy, cz, radius, groundY } = plan.bounds;
  const reach = radius * 1.25;
  const single = plan.slots.length <= 1;
  const editing = plan.slots.find((s) => edit && floorKey(s.floor.floor) === edit.floorKey && s.mode === 'full')?.floor;
  const camera = fit ?? { cx, cy, cz, radius };

  return (
    <Canvas
      shadows="percentage"
      dpr={dpr ?? [1, 2]}
      frameloop="demand"
      camera={{ fov: 30, near: 0.5, far: 800, position: [70, 58, 82] }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        // Neutral tone mapping keeps the brand colours as they are instead of washing them out.
        gl.toneMapping = THREE.NeutralToneMapping;
      }}
      onPointerMissed={edit ? undefined : () => onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <Studio />
      <ambientLight intensity={0.22} />
      <hemisphereLight args={['#ffffff', '#8ea3bd', 0.5]} />
      <directionalLight position={[-15, cy + 21, 9]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04} shadow-radius={3}>
        <orthographicCamera attach="shadow-camera" args={[-reach, reach, reach, -reach, 1, 120]} />
      </directionalLight>
      <directionalLight position={[16, 9, 6]} intensity={0.35} color="#cfe0ff" />

      {/* Catches the model's shadow on the stage */}
      <mesh rotation-x={-Math.PI / 2} position-y={groundY} receiveShadow raycast={noRay}>
        <planeGeometry args={[400, 400]} />
        <shadowMaterial transparent opacity={0.45} color="#040a14" />
      </mesh>

      {plan.slots.map((slot) => (
        <FloorStage
          key={floorKey(slot.floor.floor)}
          slot={slot}
          rim={(!single && !plan.building && slot.mode === 'full') || !!edit}
          live={live}
          selectedId={selectedId}
          onSelect={onSelect}
          onHover={onHover}
          edit={edit}
          underlay={underlay}
          registry={registry}
          heat={heat}
        />
      ))}

      {edit && editing && (
        <>
          {edit.ghost && <Ghost key={'placed' in edit.ghost ? edit.ghost.placed.item.id : edit.ghost.object.type} edit={edit} parts={ghost} />}
          <Guides parts={guides} />
          {edit.tool === 'measure' && <MeasureTool edit={edit} origin={editing.origin} live={live} />}
          <EditController edit={edit} registry={registry} live={live} origin={editing.origin} ghost={ghost} guides={guides} />
        </>
      )}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={Math.max(6, camera.radius * 0.4)}
        maxDistance={camera.radius * 4.5}
        screenSpacePanning
        target={[camera.cx, camera.cy, camera.cz]}
        autoRotate={!!spin && !reducedMotion()}
        autoRotateSpeed={0.7}
      />
      {spin && !reducedMotion() && <KeepDrawing />}
      <CameraRig fit={camera} building={plan.building} resetKey={resetKey} />
      <LabelProjector labels={labels} overlay={overlay} live={live} refDistance={radius * 3.2} />
    </Canvas>
  );
}

