// ============================================================================
//  Pid3DView — the master P&ID in real 3D (one WebGL context). The drawing is
//  stood up as a wall: canvas x → X, canvas y → −Y, Z = depth. Each item shows
//  its 3D model (uploaded GLB > built-in > flat card of the 2D art) stretched
//  to its drawn box and rotated/flipped like the 2D art, and each connection is
//  a real pipe (straight runs + rounded elbows) following the same route as 2D.
//  Every item exposes its N/E/S/W connection ports as rings: hover for the
//  name, click one port then another to connect (admin), same pipe-type picker.
//  Loaded lazily — three.js never reaches the initial bundle.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Component, Edge, PortName } from '../types';
import { SYM } from '../lib/symbols';
import { box, normRot, pipeColor, pipeParts, ports, routeEdgePoints } from '../lib/geometry';
import { loadModel } from '../lib/model3dStore';
import { buildSymbolObject, createStage, type Stage } from '../lib/threeStage';

export interface PortRef { id: string; port: PortName }

interface Props {
  nodes: Component[];
  edges: Edge[];
  nodeMap: Map<string, Component>;
  selectedIds: string[];
  /** Admin: ports can be clicked to create connections. */
  editable: boolean;
  onHover: (n: Component | null, clientX: number, clientY: number) => void;
  onSelect: (id: string | null) => void;
  /** sx/sy: the new run's mid-point in this view's own pixel space (for the pipe-type picker). */
  onConnect: (from: PortRef, to: PortRef, sx: number, sy: number) => void;
}

interface Tpl { obj: THREE.Object3D; size: THREE.Vector3; kind: string }

const PORTS: PortName[] = ['N', 'E', 'S', 'W'];
const PIPE_R = 4.5;
const RING_R = 9;
const DEFAULT_PIPE = '#5f7d95';
const C_PORT = 0x1f8fb0;
const C_PORT_HOT = 0xf5a623;
const C_PORT_SRC = 0x22c55e;

/** Unit vector pointing OUT of an item at a port, in 3D (Y up). */
const NORMAL: Record<PortName, THREE.Vector3> = {
  N: new THREE.Vector3(0, 1, 0), S: new THREE.Vector3(0, -1, 0),
  E: new THREE.Vector3(1, 0, 0), W: new THREE.Vector3(-1, 0, 0),
};

function tagSprite(text: string, color: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.strokeStyle = color; g.lineWidth = 3;
  g.beginPath(); g.roundRect(4, 8, 248, 48, 12); g.fill(); g.stroke();
  g.fillStyle = '#12202b'; g.font = '600 26px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.length > 14 ? text.slice(0, 13) + '…' : text, 128, 33);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(84, 21, 1);
  return sp;
}

export default function Pid3DView({ nodes, edges, nodeMap, selectedIds, editable, onHover, onSelect, onConnect }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const portGroupRef = useRef<THREE.Group | null>(null);
  const tplCache = useRef(new Map<string, Tpl | null>());
  const token = useRef(0);
  const fitted = useRef(false);
  const groups = useRef(new Map<string, THREE.Object3D>());
  const selHelpers = useRef<THREE.BoxHelper[]>([]);
  const pickers = useRef<THREE.Mesh[]>([]);
  const nodePickables = useRef<THREE.Object3D[]>([]);
  const srcRef = useRef<PortRef | null>(null);
  const rubber = useRef<THREE.Line | null>(null);
  const hotPort = useRef<THREE.Mesh | null>(null);

  const cb = useRef({ onHover, onSelect, onConnect, nodeMap, editable });
  cb.current = { onHover, onSelect, onConnect, nodeMap, editable };

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showPorts, setShowPorts] = useState(true);
  const [src, setSrc] = useState<PortRef | null>(null);
  const [portTip, setPortTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [flatCount, setFlatCount] = useState(0);

  // ---- stage (once) ----------------------------------------------------------
  useEffect(() => {
    const el = wrap.current, cv = canvas.current;
    if (!el || !cv) return;
    const stage = createStage(cv, el, { autoRotate: false });
    if (!stage) { setState('error'); return; }
    const tokenBox = token, cache = tplCache.current;
    stageRef.current = stage;
    stage.controls.screenSpacePanning = true;
    const content = new THREE.Group();
    const portGroup = new THREE.Group();
    stage.root.add(content, portGroup);
    contentRef.current = content;
    portGroupRef.current = portGroup;

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const setNdc = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, stage.camera);
    };
    const pickPort = (): THREE.Mesh | null => {
      if (!portGroup.visible) return null;
      return (ray.intersectObjects(pickers.current, false)[0]?.object as THREE.Mesh) ?? null;
    };
    const pickNode = (): string | null => {
      const hit = ray.intersectObjects(nodePickables.current, true)[0];
      for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) {
        if (o.userData.nodeId) return o.userData.nodeId as string;
      }
      return null;
    };
    const paint = (m: THREE.Mesh | null) => {
      if (hotPort.current && hotPort.current !== m) {
        const ring = hotPort.current.userData.ring as THREE.Mesh;
        const s = srcRef.current, u = hotPort.current.userData;
        (ring.material as THREE.MeshBasicMaterial).color.setHex(s && s.id === u.nodeId && s.port === u.port ? C_PORT_SRC : C_PORT);
        ring.scale.setScalar(1);
      }
      if (m) {
        const ring = m.userData.ring as THREE.Mesh;
        (ring.material as THREE.MeshBasicMaterial).color.setHex(C_PORT_HOT);
        ring.scale.setScalar(1.35);
      }
      hotPort.current = m;
    };

    // the port currently chosen as the start of a connection (kept green until done)
    let srcRing: THREE.Mesh | null = null;
    const clearSrc = () => {
      srcRef.current = null; setSrc(null);
      if (srcRing) { (srcRing.material as THREE.MeshBasicMaterial).color.setHex(C_PORT); srcRing = null; }
      if (rubber.current) rubber.current.visible = false;
    };
    let down: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      setNdc(e);
      const r = el.getBoundingClientRect();
      const p = pickPort();
      paint(p);
      cv.style.cursor = p && cb.current.editable ? 'pointer' : 'grab';
      if (p) {
        const n = cb.current.nodeMap.get(p.userData.nodeId as string);
        setPortTip({ text: `${n?.tag || SYM[n?.type ?? '']?.name || ''} · port ${p.userData.port}`, x: e.clientX - r.left, y: e.clientY - r.top });
        cb.current.onHover(null, 0, 0);
      } else {
        setPortTip(null);
        const id = pickNode();
        cb.current.onHover(id ? cb.current.nodeMap.get(id) ?? null : null, e.clientX, e.clientY);
      }
      // rubber band from the source port to the cursor (on the drawing plane)
      const s = srcRef.current;
      if (s && rubber.current) {
        const n = cb.current.nodeMap.get(s.id);
        const hitPt = ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (n && hitPt) {
          const sp = ports(n)[s.port];
          rubber.current.geometry.setFromPoints([new THREE.Vector3(sp.x, -sp.y, 0), hitPt]);
          rubber.current.computeLineDistances();
          rubber.current.visible = true;
        }
      }
    };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
      down = null;
      setNdc(e);
      const p = pickPort();
      if (p && cb.current.editable) {
        const ref: PortRef = { id: p.userData.nodeId as string, port: p.userData.port as PortName };
        const s = srcRef.current;
        if (!s) { srcRef.current = ref; srcRing = p.userData.ring as THREE.Mesh; setSrc(ref); paint(null); (srcRing.material as THREE.MeshBasicMaterial).color.setHex(C_PORT_SRC); return; }
        if (s.id !== ref.id) {
          const a = cb.current.nodeMap.get(s.id), b = cb.current.nodeMap.get(ref.id);
          if (a && b) {
            const pa = ports(a)[s.port], pb = ports(b)[ref.port];
            const mid = new THREE.Vector3((pa.x + pb.x) / 2, -(pa.y + pb.y) / 2, 0).project(stage.camera);
            const r = el.getBoundingClientRect();
            cb.current.onConnect(s, ref, ((mid.x + 1) / 2) * r.width, ((1 - mid.y) / 2) * r.height);
          }
        }
        clearSrc();
        return;
      }
      // empty space or a body: cancel a half-made connection, (de)select
      if (srcRef.current) clearSrc();
      cb.current.onSelect(pickNode());
    };
    const onLeave = () => { setPortTip(null); paint(null); cb.current.onHover(null, 0, 0); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && srcRef.current) clearSrc();
    };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);

    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: C_PORT_SRC, dashSize: 10, gapSize: 6, depthTest: false }));
    line.visible = false; line.renderOrder = 10;
    stage.root.add(line);
    rubber.current = line;

    return () => {
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      tokenBox.current++;
      stageRef.current = null; contentRef.current = null; portGroupRef.current = null;
      fitted.current = false;
      cache.clear();
      stage.dispose();
    };
  }, []);

  // ---- scene content: rebuilt when the drawing changes -----------------------
  const nodesKey = JSON.stringify(nodes.map((n) => [n.id, n.type, n.x, n.y, n.rot, n.scale, n.flip, n.sx, n.sy, n.tag]));
  const edgesKey = JSON.stringify(edges.map((e) => [e.id, e.from, e.to, e.fromPort, e.toPort, e.waypoints, e.lineType, e.color]));

  useEffect(() => {
    const stage = stageRef.current, content = contentRef.current, portGroup = portGroupRef.current;
    if (!stage || !content || !portGroup) return;
    const run = ++token.current;
    (async () => {
      // 1) one normalised template per symbol type
      const types = [...new Set(nodes.map((n) => n.type))];
      await Promise.all(types.filter((t) => !tplCache.current.has(t)).map(async (t) => {
        const def = SYM[t];
        if (!def) { tplCache.current.set(t, null); return; }
        try {
          const glb = await loadModel(t).catch(() => null);
          const res = await buildSymbolObject({ key: t, glb, flat: { svg: def.svg, w: def.w, h: def.h, color: def.color }, flatDepth: 0.12 });
          if (!res) { tplCache.current.set(t, null); return; }
          const b = new THREE.Box3().setFromObject(res.object);
          const size = b.getSize(new THREE.Vector3());
          const holder = new THREE.Group();
          res.object.position.sub(b.getCenter(new THREE.Vector3()));
          holder.add(res.object);
          tplCache.current.set(t, { obj: holder, size: size.max(new THREE.Vector3(1e-4, 1e-4, 1e-4)), kind: res.kind });
        } catch { tplCache.current.set(t, null); }
      }));
      if (run !== token.current) return;

      // 2) clear the previous build (templates are cached; only our own bits die)
      for (const c of [...content.children, ...portGroup.children]) {
        c.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.userData.own) { m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mt) ? mt : [mt]).forEach((x) => { (x as THREE.SpriteMaterial)?.map?.dispose?.(); x?.dispose?.(); }); }
        });
      }
      content.clear(); portGroup.clear();
      groups.current.clear(); pickers.current = []; nodePickables.current = [];
      let flats = 0;

      // wall + faint grid behind the drawing
      const bounds = new THREE.Box3();
      for (const n of nodes) { const b = box(n); bounds.expandByPoint(new THREE.Vector3(n.x, -n.y, 0)); bounds.expandByPoint(new THREE.Vector3(n.x + b.w, -(n.y + b.h), 0)); }
      const gap = new Map<string, { x: number; y: number }>();

      // 3) items
      for (const n of nodes) {
        const def = SYM[n.type];
        const sc = n.scale || 1;
        const bw = (def?.w ?? 60) * sc * (n.sx || 1);
        const bh = (def?.h ?? 60) * sc * (n.sy || 1);
        const tpl = tplCache.current.get(n.type);
        const inst = new THREE.Group();
        const bx = box(n);
        const cx = n.x + bx.w / 2, cy = n.y + bx.h / 2;
        inst.position.set(cx, -cy, 0);
        inst.rotation.z = -THREE.MathUtils.degToRad(normRot(n.rot));
        let aw = bw, ah = bh;
        if (tpl) {
          if (tpl.kind === 'flat') flats++;
          let sx = bw / tpl.size.x, sy = bh / tpl.size.y;
          const lo = Math.min(sx, sy);
          sx = Math.min(sx, lo * 1.6); sy = Math.min(sy, lo * 1.6); // keep flanges roughly round
          aw = tpl.size.x * sx; ah = tpl.size.y * sy;
          const body = tpl.obj.clone(true);
          body.scale.set(sx * (n.flip ? -1 : 1), sy, Math.sqrt(sx * sy));
          inst.add(body);
        } else {
          const ph = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, Math.min(bw, bh) * 0.4), new THREE.MeshStandardMaterial({ color: 0x8d9dab }));
          ph.userData.own = true; inst.add(ph);
        }
        inst.userData.nodeId = n.id;
        // gap between the drawn box edge (where ports sit) and the model's real edge
        const rot90 = normRot(n.rot) === 90 || normRot(n.rot) === 270;
        const wx = rot90 ? ah : aw, wy = rot90 ? aw : ah;
        gap.set(n.id, { x: Math.max(0, (bx.w - wx) / 2), y: Math.max(0, (bx.h - wy) / 2) });
        content.add(inst);
        groups.current.set(n.id, inst);
        nodePickables.current.push(inst);

        const sp = tagSprite(n.tag || def?.name || n.type, '#8aa0b2');
        sp.position.set(cx, -n.y + 16, 0);
        sp.userData.own = true;
        content.add(sp);
      }

      // 4) pipes (same route as the 2D drawing)
      const used = new Set<string>();
      for (const e of edges) {
        const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
        if (!a || !b) continue;
        const pts = routeEdgePoints(a, b, e).map((p) => ({ x: p.x, y: p.y }));
        if (pts.length < 2) continue;
        // pull the two ends in to the model's real surface so the pipe meets the body
        const tuck = (n: Component, i: number, toward: number) => {
          const pr = ports(n), g = gap.get(n.id) ?? { x: 0, y: 0 };
          for (const k of PORTS) {
            if (Math.abs(pr[k].x - pts[i].x) < 0.5 && Math.abs(pr[k].y - pts[i].y) < 0.5) {
              used.add(`${n.id}:${k}`);
              const dx = k === 'E' ? -g.x : k === 'W' ? g.x : 0, dy = k === 'N' ? g.y : k === 'S' ? -g.y : 0;
              const nx = pts[i].x + dx, ny = pts[i].y + dy;
              if (Math.hypot(nx - pts[toward].x, ny - pts[toward].y) > 2) pts[i] = { x: nx, y: ny };
              return;
            }
          }
        };
        tuck(a, 0, 1); tuck(b, pts.length - 1, pts.length - 2);
        const color = new THREE.Color(e.color ?? pipeColor(e.lineType) ?? DEFAULT_PIPE);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
        const parts = pipeParts(pts, 13);
        const up = new THREE.Vector3(0, 1, 0);
        for (const [p, q] of parts.segments) {
          const v = new THREE.Vector3(q.x - p.x, -(q.y - p.y), 0);
          const len = v.length();
          if (len < 0.5) continue;
          const m = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, len, 18), mat);
          m.position.set((p.x + q.x) / 2, -(p.y + q.y) / 2, 0);
          m.quaternion.setFromUnitVectors(up, v.normalize());
          m.userData.own = true; content.add(m);
        }
        for (const el of parts.elbows) {
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(el.a.x, -el.a.y, 0), new THREE.Vector3(el.corner.x, -el.corner.y, 0), new THREE.Vector3(el.b.x, -el.b.y, 0));
          const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, PIPE_R, 18), mat);
          m.userData.own = true; content.add(m);
        }
        // flange collars where the pipe meets each model
        for (const [pt, toward] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]] as const) {
          const v = new THREE.Vector3(toward.x - pt.x, -(toward.y - pt.y), 0).normalize();
          const m = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R * 1.55, PIPE_R * 1.55, 3.2, 20), new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.5, metalness: 0.6 }));
          m.position.set(pt.x, -pt.y, 0);
          m.quaternion.setFromUnitVectors(up, v);
          m.userData.own = true; content.add(m);
        }
      }

      // 5) connection ports: ring (visible) + bigger invisible sphere (easy to hit)
      for (const n of nodes) {
        const pr = ports(n);
        for (const k of PORTS) {
          const pt = pr[k];
          const isUsed = used.has(`${n.id}:${k}`);
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(RING_R, isUsed ? 1.2 : 1.8, 10, 36),
            new THREE.MeshBasicMaterial({ color: C_PORT, transparent: true, opacity: isUsed ? 0.55 : 0.95, depthTest: false }),
          );
          ring.renderOrder = 5; ring.userData.own = true;
          // ring plane ⟂ port normal; the torus axis is +Z, so rotate Z→normal
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), NORMAL[k]);
          ring.position.set(pt.x, -pt.y, 0);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), new THREE.MeshBasicMaterial({ color: C_PORT, depthTest: false }));
          dot.renderOrder = 5; dot.userData.own = true; dot.position.copy(ring.position);
          const hit = new THREE.Mesh(new THREE.SphereGeometry(RING_R * 1.25, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
          hit.userData = { own: true, nodeId: n.id, port: k, ring };
          hit.position.copy(ring.position);
          portGroup.add(ring, dot, hit);
          pickers.current.push(hit);
          bounds.expandByPoint(new THREE.Vector3(pt.x - 20, -pt.y - 20, -40)); bounds.expandByPoint(new THREE.Vector3(pt.x + 20, -pt.y + 20, 40));
        }
      }

      // 6) backdrop grid (stays out of picking: not in nodePickables)
      if (!bounds.isEmpty()) {
        const sz = bounds.getSize(new THREE.Vector3()), c = bounds.getCenter(new THREE.Vector3());
        const span = Math.ceil(Math.max(sz.x, sz.y) * 1.4 / 100) * 100;
        const grid = new THREE.GridHelper(span, span / 20, 0xb9c6d1, 0xdbe3ea);
        grid.rotation.x = Math.PI / 2;
        grid.position.set(c.x, c.y, -70);
        (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.55;
        grid.userData.own = true;
        content.add(grid);
        if (!fitted.current) { fitted.current = true; stage.fit(bounds, new THREE.Vector3(0.22, 0.12, 1)); }
      }
      portGroup.visible = showPortsRef.current;
      setFlatCount(flats);
      setState('ready');
      applySelection();
    })();
    // the keys stand in for the arrays (rebuild only when the drawing really changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesKey, edgesKey]);

  // ---- selection outline + port visibility (no rebuild) ----------------------
  const showPortsRef = useRef(true);
  const selRef = useRef<string[]>([]);
  selRef.current = selectedIds;
  function applySelection() {
    const content = contentRef.current;
    if (!content) return;
    for (const h of selHelpers.current) { content.remove(h); h.geometry.dispose(); }
    selHelpers.current = [];
    for (const id of selRef.current) {
      const g = groups.current.get(id);
      if (!g) continue;
      const h = new THREE.BoxHelper(g, 0xf5a623);
      content.add(h);
      selHelpers.current.push(h);
    }
  }
  useEffect(() => { applySelection(); }, [selectedIds]);
  useEffect(() => { showPortsRef.current = showPorts; if (portGroupRef.current) portGroupRef.current.visible = showPorts; }, [showPorts]);

  const view = (dir: THREE.Vector3) => {
    const s = stageRef.current, c = contentRef.current;
    if (s && c) s.fit(new THREE.Box3().setFromObject(c), dir);
  };

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'var(--sunk)' }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }} />
      {nodes.length === 0 && <div style={overlay}>No items yet — build the P&amp;ID in 2D first, then switch to 3D.</div>}
      {state === 'loading' && nodes.length > 0 && <div style={overlay}>Building 3D drawing…</div>}
      {state === 'error' && <div style={{ ...overlay, color: 'var(--red)' }}>3D view needs WebGL, which is unavailable in this browser.</div>}
      {portTip && <div style={{ position: 'absolute', left: portTip.x + 14, top: portTip.y + 12, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 7, padding: '4px 9px', fontSize: 11.5, fontFamily: 'var(--mono)', pointerEvents: 'none', boxShadow: 'var(--shadow)' }}>{portTip.text}</div>}
      {state === 'ready' && (
        <>
          <div style={bar}>
            <button style={btn} onClick={() => view(new THREE.Vector3(0, 0, 1))}>Front view</button>
            <button style={btn} onClick={() => view(new THREE.Vector3(0.45, 0.3, 1))}>Perspective</button>
            <label style={{ ...btn, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showPorts} onChange={(e) => setShowPorts(e.target.checked)} />Connection points
            </label>
          </div>
          <div style={hint}>
            {src
              ? <b style={{ color: '#16a34a' }}>Now click the target port on another item · Esc to cancel</b>
              : editable
                ? 'Click a connection point, then another item’s point, to connect · drag to rotate · right-drag to pan · scroll to zoom'
                : 'Drag to rotate · right-drag to pan · scroll to zoom'}
            {flatCount > 0 && <div>{flatCount} item{flatCount > 1 ? 's' : ''} shown as flat cards — no 3D model yet</div>}
          </div>
        </>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)', pointerEvents: 'none' };
const bar: React.CSSProperties = { position: 'absolute', left: 16, top: 16, display: 'flex', gap: 6 };
const btn: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 8, padding: '5px 11px', fontSize: 11.5, color: 'var(--ink)', cursor: 'pointer' };
const hint: React.CSSProperties = { position: 'absolute', left: 16, bottom: 14, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.6, pointerEvents: 'none', maxWidth: '60%' };
