// ============================================================================
//  Bop3DView — the BOP stack-up in 3D (one WebGL context). Items are stacked at
//  their real elevations (metres → scene units 1:1). A symbol with a .glb model
//  is scaled to its band height; any other symbol shows as a flat 2.5D card cut
//  from its 2D art, so the stack is complete before real models exist.
//  Hover raises the same tooltip the 2D view uses. Loaded lazily.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SYM } from '../lib/symbols';
import { loadModel } from '../lib/model3dStore';
import { clone as cloneObject } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildSymbolObject, createStage, type SymbolObjectKind } from '../lib/threeStage';

export interface Bop3DItem {
  id: string;
  type: string;
  /** Elevation of the item's bottom, metres. */
  bottom: number;
  /** Item height, metres. */
  height: number;
  /** Horizontal offset from the stack axis, metres (side branches). */
  x: number;
}

interface Props {
  items: Bop3DItem[];
  datum: number;
  rt: number;
  onHover: (id: string | null, clientX: number, clientY: number) => void;
}

function disc(radius: number, y: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

export default function Bop3DView({ items, datum, rt, onHover }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const hoverCb = useRef(onHover);
  hoverCb.current = onHover;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [flatCount, setFlatCount] = useState(0);

  const itemsKey = JSON.stringify(items);

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    setState('loading');
    const stage = createStage(cv, el, { autoRotate: false });
    if (!stage) { setState('error'); return; }
    let disposed = false;
    const pickables: THREE.Object3D[] = [];

    (async () => {
      const types = [...new Set(items.map((i) => i.type))];
      const bufs = new Map<string, ArrayBuffer | null>();
      await Promise.all(types.map(async (t) => bufs.set(t, await loadModel(t))));
      if (disposed) return;

      // Build each symbol type once; every item gets a clone (shared geometry/textures).
      const templates = new Map<string, Promise<{ object: THREE.Object3D; kind: SymbolObjectKind } | null>>();
      const template = (type: string, def: NonNullable<(typeof SYM)[string]>) => {
        let t = templates.get(type);
        if (!t) {
          t = buildSymbolObject({ key: type, glb: bufs.get(type), flat: { svg: def.svg, w: def.w, h: def.h, color: def.color }, flatDepth: 0.35 }).catch(() => null);
          templates.set(type, t);
        }
        return t;
      };
      let flats = 0;
      let maxR = 1;
      for (const it of items) {
        const def = SYM[it.type];
        if (!def || it.height <= 0) continue;
        let obj: THREE.Object3D;
        try {
          const res = await template(it.type, def);
          if (!res) continue;
          if (res.kind === 'flat') flats++;
          obj = cloneObject(res.object);
        } catch {
          continue; // a broken model must not blank the whole stack
        }
        if (disposed) return;
        // scale so the item's Y extent equals its band height, then sit it on `bottom`
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const s = it.height / Math.max(size.y, 1e-6);
        const holder = new THREE.Group();
        obj.scale.setScalar(s);
        const b2 = new THREE.Box3().setFromObject(obj);
        const c = b2.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -b2.min.y, -c.z);
        holder.add(obj);
        holder.position.set(it.x, it.bottom, 0);
        holder.userData.itemId = it.id;
        stage.root.add(holder);
        pickables.push(holder);
        maxR = Math.max(maxR, Math.abs(it.x) + (b2.max.x - b2.min.x) / 2);
      }
      const box = new THREE.Box3().setFromObject(stage.root);
      stage.root.add(disc(maxR * 1.3, datum, 0x8d9dab), disc(maxR * 1.3, rt, 0x2f7fd0));
      box.expandByPoint(new THREE.Vector3(0, Math.max(datum, rt), 0));
      box.expandByPoint(new THREE.Vector3(0, Math.min(datum, rt), 0));
      stage.fit(box);
      setFlatCount(flats);
      setState('ready');
    })();

    // hover → item id (walk up from the hit mesh to the holder that carries it)
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, stage.camera);
      const hit = ray.intersectObjects(pickables, true)[0];
      let id: string | null = null;
      for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) {
        if (o.userData.itemId) { id = o.userData.itemId as string; break; }
      }
      hoverCb.current(id, e.clientX, e.clientY);
    };
    const onLeave = () => hoverCb.current(null, 0, 0);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);

    return () => {
      disposed = true;
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerleave', onLeave);
      stage.dispose();
    };
    // itemsKey stands in for `items` (rebuild only when the stack actually changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, datum, rt]);

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      {state === 'loading' && <div style={overlay}>Building 3D stack…</div>}
      {state === 'error' && <div style={{ ...overlay, color: 'var(--red)' }}>3D view needs WebGL, which is unavailable in this browser.</div>}
      {state === 'ready' && (
        <div style={{ position: 'absolute', left: 14, bottom: 12, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.6, pointerEvents: 'none' }}>
          <div><span style={{ color: '#8d9dab' }}>●</span> Datum &nbsp; <span style={{ color: '#2f7fd0' }}>●</span> RKB &nbsp; · drag to rotate, scroll to zoom</div>
          {flatCount > 0 && <div>{flatCount} item{flatCount > 1 ? 's' : ''} shown as flat cards — no 3D model yet</div>}
        </div>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' };
