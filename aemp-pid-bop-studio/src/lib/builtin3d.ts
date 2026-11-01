// ============================================================================
//  Built-in 3D models — procedural, code-built (no binary assets), one per
//  common well-control / mud-system symbol. Y-up, roughly metre-scaled, framed
//  by the viewer so absolute size does not matter. An uploaded .glb for the same
//  symbol key always wins over these; symbols not listed here fall back to the
//  flat 2.5D card. Loaded lazily with three.js.
// ============================================================================
import * as THREE from 'three';
import { BUILTIN_3D_KEYS } from './builtin3dKeys';

type V3 = [number, number, number];
type Mat = THREE.MeshStandardMaterial;
interface Palette { red: Mat; redD: Mat; steel: Mat; dark: Mat; blue: Mat; green: Mat; brass: Mat; white: Mat; orange: Mat; gray: Mat }

const std = (color: number, metalness: number, roughness: number): Mat => new THREE.MeshStandardMaterial({ color, metalness, roughness });
/** Fresh materials per model so disposing one model never affects another. */
const palette = (): Palette => ({
  red: std(0xcf3a30, 0.35, 0.5), redD: std(0x9c271f, 0.35, 0.55), steel: std(0x9aa7b3, 0.75, 0.3),
  dark: std(0x2b3640, 0.6, 0.45), blue: std(0x3270b2, 0.35, 0.5), green: std(0x2f8b55, 0.35, 0.5),
  brass: std(0xc9a23a, 0.8, 0.3), white: std(0xf2f4f6, 0.1, 0.8), orange: std(0xd07a1e, 0.2, 0.6), gray: std(0x7c8894, 0.5, 0.5),
});

const HX: V3 = [0, 0, Math.PI / 2];   // cylinder axis along X
const HZ: V3 = [Math.PI / 2, 0, 0];   // cylinder axis along Z

function place<T extends THREE.Object3D>(o: T, p: V3, rot?: V3): T {
  o.position.set(...p);
  if (rot) o.rotation.set(...rot);
  return o;
}
const cyl = (m: Mat, r: number, h: number, p: V3 = [0, 0, 0], rot?: V3, seg = 36) =>
  place(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m), p, rot);
const box = (m: Mat, w: number, h: number, d: number, p: V3 = [0, 0, 0], rot?: V3) =>
  place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), p, rot);
const sph = (m: Mat, r: number, p: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) => {
  const o = place(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), m), p);
  o.scale.set(...s);
  return o;
};
const group = (...kids: THREE.Object3D[]) => { const g = new THREE.Group(); g.add(...kids); return g; };

/** Bolt heads on a circle (in the XZ plane at height y). */
function bolts(m: Mat, ringR: number, y: number, n: number, size: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.add(cyl(m, size, size * 1.6, [Math.cos(a) * ringR, y, Math.sin(a) * ringR], undefined, 6));
  }
  return g;
}
/** A bolted flange: disc + bolt ring, axis Y unless `rot` is given. */
const flange = (C: Palette, r: number, t: number, p: V3, rot?: V3, n = 8) =>
  place(group(cyl(C.steel, r, t), bolts(C.dark, r * 0.8, t / 2, n, r * 0.06)), p, rot);

/** Wheel on a vertical stem (axis Y); `faceZ` turns it for a stem running along Z. */
function handwheel(C: Palette, R: number, p: V3, faceZ = false): THREE.Group {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.1, 12, 40), C.dark);
  ring.rotation.x = Math.PI / 2;
  const g = group(ring, box(C.dark, R * 2, R * 0.07, R * 0.07), box(C.dark, R * 0.07, R * 0.07, R * 2), cyl(C.steel, R * 0.16, R * 0.18));
  if (faceZ) g.rotation.x = Math.PI / 2;
  return place(g, p, faceZ ? [Math.PI / 2, 0, 0] : undefined);
}

// ---- BOP stack ---------------------------------------------------------------
function annular(C: Palette) {
  return group(
    flange(C, 1.05, 0.2, [0, 0.1, 0], undefined, 12),
    cyl(C.red, 0.9, 0.9, [0, 0.65, 0]),
    sph(C.red, 0.9, [0, 1.1, 0], [1, 0.38, 1]),
    cyl(C.steel, 0.5, 0.3, [0, 1.4, 0]),
    flange(C, 0.72, 0.16, [0, 1.62, 0], undefined, 10),
    cyl(C.brass, 0.07, 0.4, [0.98, 0.5, 0], HX), cyl(C.brass, 0.07, 0.4, [-0.98, 0.5, 0], HX),
  );
}
function ramBody(C: Palette, y: number) {
  const g = group(box(C.red, 2.0, 0.72, 1.1, [0, y, 0]), box(C.steel, 0.55, 0.1, 0.55, [0, y + 0.41, 0]));
  for (const s of [-1, 1]) {
    g.add(cyl(C.redD, 0.33, 0.8, [s * 1.35, y, 0], HX), cyl(C.steel, 0.38, 0.1, [s * 1.8, y, 0], HX));
    g.add(cyl(C.brass, 0.06, 0.3, [s * 1.35, y + 0.4, 0.2]));
  }
  return g;
}
const sram = (C: Palette) => group(flange(C, 0.8, 0.18, [0, 0.09, 0], undefined, 10), ramBody(C, 0.55), flange(C, 0.8, 0.18, [0, 1.01, 0], undefined, 10));
const dram = (C: Palette) => group(
  flange(C, 0.8, 0.18, [0, 0.09, 0], undefined, 10), ramBody(C, 0.55), flange(C, 0.78, 0.16, [0, 1.0, 0], undefined, 10),
  ramBody(C, 1.45), flange(C, 0.8, 0.18, [0, 1.91, 0], undefined, 10),
);
const cross = (C: Palette) => group(
  cyl(C.steel, 0.45, 1.4, [0, 0.7, 0]), cyl(C.steel, 0.38, 2.2, [0, 0.7, 0], HX),
  flange(C, 0.66, 0.16, [0, 0, 0], undefined, 10), flange(C, 0.66, 0.16, [0, 1.4, 0], undefined, 10),
  flange(C, 0.58, 0.16, [1.1, 0.7, 0], HX), flange(C, 0.58, 0.16, [-1.1, 0.7, 0], HX),
);
const teststump = (C: Palette) => group(
  box(C.steel, 1.2, 0.1, 1.2, [0, 0.05, 0]), cyl(C.steel, 0.45, 1.0, [0, 0.6, 0]),
  cyl(C.dark, 0.5, 0.08, [0, 1.0, 0]), flange(C, 0.62, 0.14, [0, 1.17, 0], undefined, 10),
);

// ---- Wellhead & tree ------------------------------------------------------------
function wellhead(C: Palette) {
  const g = group(
    flange(C, 0.7, 0.14, [0, 0.07, 0], undefined, 10), cyl(C.green, 0.5, 0.6, [0, 0.5, 0]),
    flange(C, 0.62, 0.14, [0, 0.87, 0], undefined, 10), cyl(C.green, 0.4, 0.5, [0, 1.19, 0]),
    flange(C, 0.55, 0.14, [0, 1.5, 0], undefined, 8), cyl(C.steel, 0.3, 0.25, [0, 1.7, 0]),
  );
  for (const s of [-1, 1]) g.add(cyl(C.green, 0.14, 0.6, [s * 0.7, 0.55, 0], HX), flange(C, 0.26, 0.1, [s * 1.0, 0.55, 0], HX, 6));
  return g;
}
function xmastree(C: Palette) {
  const g = group(flange(C, 0.55, 0.14, [0, 0.07, 0], undefined, 8), cyl(C.green, 0.2, 2.3, [0, 1.2, 0]));
  for (const y of [0.65, 1.95]) g.add(box(C.green, 0.55, 0.6, 0.55, [0, y, 0]), cyl(C.steel, 0.05, 0.4, [0, y, 0.45], HZ), handwheel(C, 0.26, [0, y, 0.72], true));
  g.add(cyl(C.green, 0.15, 1.1, [0.7, 1.3, 0], HX), box(C.green, 0.5, 0.5, 0.5, [0.75, 1.3, 0]), cyl(C.steel, 0.05, 0.4, [0.75, 1.3, 0.4], HZ), handwheel(C, 0.24, [0.75, 1.3, 0.66], true));
  g.add(cyl(C.steel, 0.18, 0.3, [0, 2.5, 0]), cyl(C.white, 0.16, 0.08, [0, 2.78, 0], HZ));
  return g;
}

// ---- Valves ---------------------------------------------------------------------
function valveBody(C: Palette) {
  return group(
    cyl(C.red, 0.34, 1.0, [0, 0, 0], HX), sph(C.red, 0.5),
    flange(C, 0.5, 0.14, [0.52, 0, 0], HX), flange(C, 0.5, 0.14, [-0.52, 0, 0], HX),
    cyl(C.red, 0.3, 0.5, [0, 0.65, 0]), flange(C, 0.38, 0.1, [0, 0.42, 0], undefined, 6),
  );
}
function gate(C: Palette) {
  const g = valveBody(C);
  g.add(cyl(C.steel, 0.05, 0.5, [0, 1.1, 0]), handwheel(C, 0.34, [0, 1.35, 0]));
  return g;
}
function hcr(C: Palette) {
  const g = valveBody(C);
  g.add(cyl(C.steel, 0.06, 0.35, [0, 1.0, 0]), cyl(C.blue, 0.26, 0.85, [0, 1.35, 0]), sph(C.blue, 0.26, [0, 1.78, 0], [1, 0.6, 1]));
  return g;
}
function plug(C: Palette) {
  const g = valveBody(C);
  g.add(cyl(C.steel, 0.14, 0.3, [0, 0.95, 0], undefined, 6), box(C.dark, 0.14, 0.1, 1.0, [0, 1.15, 0.35]), sph(C.dark, 0.09, [0, 1.15, 0.85]));
  return g;
}
function butterfly(C: Palette) {
  return group(
    cyl(C.red, 0.55, 0.4, [0, 0, 0], HX), cyl(C.steel, 0.58, 0.08, [0.2, 0, 0], HX), cyl(C.steel, 0.58, 0.08, [-0.2, 0, 0], HX),
    cyl(C.red, 0.16, 0.5, [0, 0.65, 0]), cyl(C.steel, 0.2, 0.1, [0, 0.95, 0]), box(C.dark, 0.1, 0.08, 1.0, [0, 1.08, 0.3]),
  );
}
function check(C: Palette) {
  return group(
    cyl(C.red, 0.3, 1.0, [0, 0, 0], HX), sph(C.red, 0.42, [0, 0, 0], [1.25, 1, 1]),
    flange(C, 0.48, 0.14, [0.52, 0, 0], HX), flange(C, 0.48, 0.14, [-0.52, 0, 0], HX),
    cyl(C.red, 0.22, 0.2, [0, 0.5, 0]), cyl(C.steel, 0.28, 0.08, [0, 0.64, 0]),
  );
}
function choke(C: Palette) {
  return group(
    box(C.red, 0.9, 0.7, 0.7), cyl(C.red, 0.34, 1.2, [0, 0, 0], HX),
    flange(C, 0.46, 0.14, [0.62, 0, 0], HX), flange(C, 0.46, 0.14, [-0.62, 0, 0], HX),
    cyl(C.red, 0.3, 0.4, [0, 0.55, 0]), cyl(C.white, 0.28, 0.06, [0, 0.78, 0]),
    box(C.red, 0.24, 0.02, 0.04, [0.05, 0.82, 0]), cyl(C.steel, 0.05, 0.3, [0, 0.95, 0]), handwheel(C, 0.26, [0, 1.12, 0]),
  );
}
function relief(C: Palette) {
  return group(
    flange(C, 0.38, 0.12, [0, -0.25, 0], undefined, 6), cyl(C.red, 0.22, 0.5, [0, 0, 0]), cyl(C.red, 0.32, 0.5, [0, 0.45, 0]),
    cyl(C.red, 0.2, 0.5, [0.38, 0.45, 0], HX), flange(C, 0.3, 0.1, [0.68, 0.45, 0], HX, 6),
    cyl(C.steel, 0.2, 0.7, [0, 1.0, 0]), cyl(C.red, 0.25, 0.1, [0, 1.4, 0]), sph(C.dark, 0.1, [0, 1.52, 0]),
  );
}

// ---- Manifold & piping -------------------------------------------------------------
function manifold(C: Palette) {
  const g = group(cyl(C.red, 0.2, 3.4, [0, 0, 0], HX), flange(C, 0.34, 0.12, [1.7, 0, 0], HX), flange(C, 0.34, 0.12, [-1.7, 0, 0], HX));
  for (const x of [-1.0, 0, 1.0]) {
    const v = gate(C);
    v.rotation.y = Math.PI / 2;
    v.scale.setScalar(0.55);
    v.position.set(x, 0, 1.05);
    g.add(cyl(C.red, 0.14, 0.55, [x, 0, 0.4], HZ), v);
  }
  return g;
}
const pipe = (C: Palette) => group(cyl(C.steel, 0.22, 2.2, [0, 0, 0], HX), flange(C, 0.38, 0.14, [1.1, 0, 0], HX), flange(C, 0.38, 0.14, [-1.1, 0, 0], HX));
function hose(C: Palette) {
  const curve = new THREE.CatmullRomCurve3([[-1.3, 0, 0], [-0.7, 0.35, 0.2], [0, -0.1, -0.2], [0.7, 0.3, 0.2], [1.3, 0, 0]].map((p) => new THREE.Vector3(...(p as V3))));
  return group(
    new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.12, 12), C.orange),
    cyl(C.steel, 0.17, 0.3, [1.3, 0, 0], HX), cyl(C.steel, 0.17, 0.3, [-1.3, 0, 0], HX),
  );
}
const flangeSym = (C: Palette) => group(
  cyl(C.steel, 0.6, 0.24), bolts(C.dark, 0.46, 0.12, 12, 0.05), cyl(C.dark, 0.26, 0.26), cyl(C.steel, 0.34, 0.04, [0, 0.13, 0]),
);

// ---- Mud system ----------------------------------------------------------------------
function mudpump(C: Palette) {
  const g = group(box(C.dark, 2.8, 0.12, 1.6, [0, 0.3, 0.2]), box(C.blue, 2.4, 1.0, 1.1, [0, 0.9, 0]), box(C.steel, 2.5, 0.1, 1.2, [0, 1.45, 0]));
  for (const x of [-0.75, 0, 0.75]) g.add(cyl(C.steel, 0.2, 0.8, [x, 0.9, 0.95], HZ), cyl(C.dark, 0.25, 0.1, [x, 0.9, 1.4], HZ));
  g.add(cyl(C.steel, 0.14, 2.4, [0, 1.3, 1.0], HX), cyl(C.red, 0.1, 0.3, [1.2, 1.3, 1.0], HX));
  return g;
}
function pump(C: Palette) {
  return group(
    box(C.steel, 2.2, 0.12, 0.8, [-0.3, 0, 0]), cyl(C.blue, 0.5, 0.4, [0, 0.55, 0], HZ), cyl(C.blue, 0.2, 0.5, [0, 0.55, 0.45], HZ),
    cyl(C.blue, 0.18, 0.5, [0, 1.1, 0]), flange(C, 0.3, 0.1, [0, 1.38, 0], undefined, 6),
    cyl(C.steel, 0.12, 0.35, [-0.35, 0.55, 0], HX), cyl(C.dark, 0.32, 1.0, [-0.95, 0.55, 0], HX),
  );
}
function tank(C: Palette) {
  const g = group(box(C.gray, 3.8, 1.2, 1.5, [0, 0.7, 0]), box(C.steel, 3.9, 0.06, 1.6, [0, 1.33, 0]));
  for (const x of [-1.2, 0, 1.2]) g.add(cyl(C.dark, 0.2, 0.08, [x, 1.4, 0]));
  for (const x of [-1.8, 1.8]) g.add(box(C.dark, 0.14, 0.1, 1.6, [x, 0.05, 0]));
  for (const x of [-1.9, 1.9]) for (const z of [-0.8, 0.8]) g.add(cyl(C.steel, 0.025, 0.4, [x, 1.55, z]));
  return g;
}
function vessel(C: Palette, tall = 1.5) {
  const g = group(
    cyl(C.blue, 0.5, tall, [0, 0.6 + tall / 2, 0]), sph(C.blue, 0.5, [0, 0.6 + tall, 0], [1, 0.6, 1]), sph(C.blue, 0.5, [0, 0.6, 0], [1, 0.6, 1]),
    cyl(C.blue, 0.14, 0.5, [0.6, 0.6 + tall * 0.7, 0], HX), flange(C, 0.24, 0.1, [0.88, 0.6 + tall * 0.7, 0], HX, 6),
    cyl(C.steel, 0.1, 0.3, [0, 0.9 + tall, 0]),
  );
  for (const [x, z] of [[0.38, 0.38], [-0.38, 0.38], [0.38, -0.38], [-0.38, -0.38]]) g.add(cyl(C.steel, 0.04, 0.6, [x, 0.3, z]));
  return g;
}
const mgs = (C: Palette) => group(vessel(C, 2.6), cyl(C.steel, 0.07, 1.4, [0, 4.1, 0]), cyl(C.blue, 0.14, 0.5, [-0.6, 1.2, 0], HX));
const dampener = (C: Palette) => group(
  sph(C.blue, 0.55, [0, 1.0, 0]), cyl(C.blue, 0.22, 0.4, [0, 0.45, 0]), flange(C, 0.36, 0.12, [0, 0.22, 0], undefined, 8),
  cyl(C.brass, 0.06, 0.2, [0, 1.6, 0]), cyl(C.white, 0.14, 0.05, [0, 1.74, 0], HZ),
);

// ---- Koomey / instruments ---------------------------------------------------------------
const accum = (C: Palette) => group(
  cyl(C.blue, 0.3, 1.3, [0, 0.85, 0]), sph(C.blue, 0.3, [0, 1.5, 0]), sph(C.blue, 0.3, [0, 0.2, 0]),
  cyl(C.dark, 0.36, 0.08, [0, -0.05, 0]), cyl(C.steel, 0.12, 0.25, [0, 1.82, 0]), cyl(C.brass, 0.05, 0.2, [0.16, 1.9, 0], HX),
);
function gauge(C: Palette) {
  const needle = box(C.red, 0.03, 0.26, 0.01, [0, 0.5, 0.09]);
  needle.rotation.z = -0.7;
  return group(
    cyl(C.steel, 0.4, 0.14, [0, 0.55, 0], HZ), cyl(C.white, 0.34, 0.02, [0, 0.55, 0.075], HZ), needle,
    cyl(C.brass, 0.07, 0.4, [0, 0.08, 0]), cyl(C.brass, 0.12, 0.1, [0, 0.3, 0], undefined, 6),
  );
}

type Builder = (C: Palette) => THREE.Object3D;
const BUILDERS: Record<(typeof BUILTIN_3D_KEYS)[number], Builder> = {
  annular, dram, sram, cross, wellhead, xmastree, gate, butterfly, plug, hcr, check, choke, relief,
  manifold, pipe, hose, flange: flangeSym, teststump, mudpump, pump, tank, vessel: (C) => vessel(C), mgs, dampener, accum, gauge,
};

/** Build the procedural 3D model for a built-in symbol key, or null if it has none. */
export function buildBuiltin3d(key: string): THREE.Object3D | null {
  const b = (BUILDERS as Record<string, Builder | undefined>)[key];
  return b ? b(palette()) : null;
}
