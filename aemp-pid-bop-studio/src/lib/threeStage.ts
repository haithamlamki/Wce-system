// ============================================================================
//  threeStage — shared three.js plumbing for the 3D symbol viewer and the 3D
//  BOP stack: renderer + lights + orbit controls + resize + dispose, GLB
//  parsing from memory, and the flat 2.5D fallback slab. Only imported from
//  lazily-loaded components, so three.js never lands in the initial bundle.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { symbolToSvgDocument, type FlatArt } from './model3d';
import { buildBuiltin3d } from './builtin3d';

export function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** Parse a binary glTF from memory (no fetch → the strict CSP is untouched). */
export function parseGlb(buf: ArrayBuffer): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buf.slice(0), '', (g) => resolve(g.scene), (e) => reject(new Error(e?.message || 'Invalid GLB')));
  });
}

/** The symbol's SVG art on a thin slab: width = aspect, height = 1 (unit height).
 *  `depth` is the slab thickness relative to its height. */
export function makeFlatSlab(art: FlatArt, depth = 0.07): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([symbolToSvgDocument(art)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      const face = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.04, roughness: 0.6, metalness: 0.1 });
      const side = new THREE.MeshStandardMaterial({ color: 0x8d9dab, roughness: 0.5, metalness: 0.4 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(art.w / art.h, 1, depth), [side, side, side, side, face, face]));
      resolve(g);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the symbol art in 3D.')); };
    img.src = url;
  });
}

export type SymbolObjectKind = 'glb' | 'builtin' | 'flat';

/** Pick the best 3D object for a symbol: an uploaded .glb, else the built-in
 *  procedural model for `key`, else a flat card of its 2D art (null if none). */
export async function buildSymbolObject(o: { key?: string; glb?: ArrayBuffer | null; flat?: FlatArt | null; flatDepth?: number }):
  Promise<{ object: THREE.Object3D; kind: SymbolObjectKind } | null> {
  if (o.glb) return { object: await parseGlb(o.glb), kind: 'glb' };
  const built = o.key ? buildBuiltin3d(o.key) : null;
  if (built) return { object: built, kind: 'builtin' };
  if (o.flat) return { object: await makeFlatSlab(o.flat, o.flatDepth), kind: 'flat' };
  return null;
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  /** Everything added here is framed by fit() and disposed by dispose(). */
  root: THREE.Group;
  /** Aim the camera at the root's bounds (or the given box). */
  fit(box?: THREE.Box3, dir?: THREE.Vector3): void;
  dispose(): void;
}

/** Build a stage on `cv`, sized to `el`. Returns null when WebGL is unavailable. */
export function createStage(cv: HTMLCanvasElement, el: HTMLElement, opts: { autoRotate?: boolean } = {}): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(-5, 2, -4); scene.add(rim);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = !!opts.autoRotate;
  controls.autoRotateSpeed = 1.4;

  const root = new THREE.Group();
  scene.add(root);

  const resize = () => {
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let raf = 0;
  const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
  loop();

  return {
    scene, camera, controls, renderer, root,
    fit(box, dir = new THREE.Vector3(0.65, 0.3, 1)) {
      const b = box ?? new THREE.Box3().setFromObject(root);
      if (b.isEmpty()) return;
      const size = b.getSize(new THREE.Vector3());
      const centre = b.getCenter(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 1e-6) / 2;
      const dist = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.35;
      camera.near = dist / 200;
      camera.far = dist * 200;
      camera.updateProjectionMatrix();
      camera.position.copy(centre).addScaledVector(dir.clone().normalize(), dist);
      controls.target.copy(centre);
      controls.update();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeTree(root);
      // Do not forceContextLoss(): React StrictMode re-runs effects on the same <canvas>,
      // and a lost context makes the next WebGLRenderer fail on that canvas.
      renderer.dispose();
    },
  };
}
