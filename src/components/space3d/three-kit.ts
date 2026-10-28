import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TONE_COLOR, type Tone } from '../../lib/spaceState';

export const INK = '#14263f';
export const SIGNAL = '#f6c324';
export const PLATE = '#dde3ea';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------------------------
// Geometry. Shared between every piece that has the same size, so a floor of desks is a handful of buffers.

const cache = new Map<string, THREE.BufferGeometry>();
function memo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g as T;
}
const n = (v: number) => v.toFixed(3);

export const rbox = (w: number, h: number, d: number, r = 0.03) => {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  return memo(`r${n(w)}/${n(h)}/${n(d)}/${n(rr)}`, () => new RoundedBoxGeometry(w, h, d, 3, rr));
};
export const cube = (w: number, h: number, d: number) => memo(`b${n(w)}/${n(h)}/${n(d)}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt: number, rb: number, h: number) => memo(`c${n(rt)}/${n(rb)}/${n(h)}`, () => new THREE.CylinderGeometry(rt, rb, h, 24));
export const capsule = (r: number, len: number) => memo(`p${n(r)}/${n(len)}`, () => new THREE.CapsuleGeometry(r, len, 6, 16));
export const sphere = (r: number) => memo(`s${n(r)}`, () => new THREE.SphereGeometry(r, 24, 16));

function trace(p: THREE.Path, w: number, d: number, r: number) {
  const x = -w / 2;
  const y = -d / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + d - r);
  p.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  p.lineTo(x + r, y + d);
  p.quadraticCurveTo(x, y + d, x, y + d - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
}

/** A flat rounded slab lying on the floor. */
export const fill = (w: number, d: number, r = 0.16, h = 0.03) =>
  memo(`f${n(w)}/${n(d)}/${n(r)}/${n(h)}`, () => {
    const s = new THREE.Shape();
    trace(s, w, d, r);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    return g;
  });

/** A thin rounded outline lying on the floor. */
export const ring = (w: number, d: number, t = 0.07, r = 0.16, h = 0.016) =>
  memo(`o${n(w)}/${n(d)}/${n(t)}/${n(r)}/${n(h)}`, () => {
    const s = new THREE.Shape();
    trace(s, w, d, r);
    const hole = new THREE.Path();
    trace(hole, w - t * 2, d - t * 2, Math.max(0.02, r - t));
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    return g;
  });

// ---------------------------------------------------------------------------------------------
// Materials. The palette is the signage palette: plaster-white model, ink details, status in colour.

export const mk = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...p });

export const M = {
  plate: mk(PLATE, { roughness: 0.92 }),
  base: mk('#0d1b2f', { roughness: 0.6 }),
  inlay: mk('#e9eef2', { roughness: 0.95 }),
  inlayReserved: mk('#e4e9ef', { roughness: 0.95 }),
  white: mk('#ffffff', { roughness: 0.42 }),
  mist: mk('#dfe5eb', { roughness: 0.6 }),
  ink: mk(INK, { roughness: 0.5 }),
  core: mk('#26415f', { roughness: 0.55 }),
  signal: mk(SIGNAL, { roughness: 0.4, emissive: SIGNAL, emissiveIntensity: 0.6 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#d4e4f4', transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
  screenOff: mk('#0a1524', { roughness: 0.25 }),
  screenOn: new THREE.MeshBasicMaterial({ color: '#e9f2ff' }),
  steel: mk('#b8c3cf', { roughness: 0.3, metalness: 0.7 }),
  fabric: mk('#2c4668', { roughness: 0.9 }),
  rug: mk('#cdd6e0', { roughness: 1 }),
  foliage: mk('#2f5d50', { roughness: 0.8 }),
  frost: new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.6, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
};

const PLATE_COLOR = new THREE.Color(PLATE);
export const wash = (t: Tone, a: number) => `#${PLATE_COLOR.clone().lerp(new THREE.Color(TONE_COLOR[t]), a).getHexString()}`;

let hatchTex: THREE.CanvasTexture | null = null;
/** Hazard stripes for anything out of service. One tile is one metre. */
export function hatch() {
  if (!hatchTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dark = (x + y) % 32 < 13;
        const i = (y * 64 + x) * 4;
        img.data[i] = dark ? 20 : 246;
        img.data[i + 1] = dark ? 38 : 195;
        img.data[i + 2] = dark ? 63 : 36;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    hatchTex = new THREE.CanvasTexture(c);
    hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping;
    hatchTex.colorSpace = THREE.SRGBColorSpace;
  }
  return hatchTex;
}

const fills = new Map<Tone, THREE.Material>();
/** Taken things are solid colour, free things are a pale wash inside an outline. */
export function fillMat(t: Tone) {
  let m = fills.get(t);
  if (!m) {
    if (t === 'busy' || t === 'mine') m = mk(TONE_COLOR[t], { roughness: 0.6, emissive: TONE_COLOR[t], emissiveIntensity: 0.22 });
    else if (t === 'hold') m = mk('#ffffff', { map: hatch(), roughness: 0.7 });
    else m = mk(wash(t, t === 'ok' ? 0.2 : 0.4), { roughness: 0.9 });
    fills.set(t, m);
  }
  return m;
}
const rings = new Map<Tone, THREE.Material>();
export function ringMat(t: Tone) {
  let m = rings.get(t);
  if (!m) {
    m = mk(TONE_COLOR[t], { roughness: 0.5, emissive: TONE_COLOR[t], emissiveIntensity: 0.5 });
    rings.set(t, m);
  }
  return m;
}
const lamps = new Map<Tone, THREE.Material>();
export function lampMat(t: Tone) {
  let m = lamps.get(t);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: TONE_COLOR[t] });
    lamps.set(t, m);
  }
  return m;
}
const bodies = new Map<Tone, THREE.Material>();
export function bodyMat(t: Tone) {
  let m = bodies.get(t);
  if (!m) {
    m = mk(TONE_COLOR[t], { roughness: 0.6 });
    bodies.set(t, m);
  }
  return m;
}

