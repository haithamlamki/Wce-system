// ============================================================================
//  Canvas geometry  —  bounding boxes, ports, transforms, view <-> world.
//  Ported from the prototype's box()/ports() and node render transform so the
//  React canvas places, rotates, scales and connects items identically.
// ============================================================================
import type { Component, Edge, PortName as TPortName } from '../types';
import { SYM, type SymbolKey } from './symbols';

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface Box {
  w: number;
  h: number;
}

export const GRID = 20;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

export function normRot(rot = 0): number {
  return ((rot % 360) + 360) % 360;
}

/** Scaled, rotation-aware bounding box (w/h swap at 90°/270°). */
export function box(n: Pick<Component, 'type' | 'scale' | 'rot'>): Box {
  const s = SYM[n.type as SymbolKey];
  const sc = n.scale || 1;
  const rot = normRot(n.rot);
  const bw = s.w * sc;
  const bh = s.h * sc;
  return rot === 90 || rot === 270 ? { w: bh, h: bw } : { w: bw, h: bh };
}

export type PortName = 'N' | 'E' | 'S' | 'W';
export type Ports = Record<PortName, { x: number; y: number }>;

/** N/E/S/W connection points in world space. */
export function ports(n: Component): Ports {
  const { w, h } = box(n);
  return {
    W: { x: n.x, y: n.y + h / 2 },
    E: { x: n.x + w, y: n.y + h / 2 },
    N: { x: n.x + w / 2, y: n.y },
    S: { x: n.x + w / 2, y: n.y + h },
  };
}

/** Centre of a node in world space. */
export function center(n: Component): { x: number; y: number } {
  const { w, h } = box(n);
  return { x: n.x + w / 2, y: n.y + h / 2 };
}

/** Inner SVG transform that rotates/scales/flips the artwork inside its box. */
export function innerTransform(n: Component): string {
  const s = SYM[n.type as SymbolKey];
  const sc = n.scale || 1;
  const rot = normRot(n.rot);
  const fx = n.flip ? -1 : 1;
  const { w: ew, h: eh } = box(n);
  return `translate(${ew / 2},${eh / 2}) rotate(${rot}) scale(${sc * fx},${sc}) translate(${-s.w / 2},${-s.h / 2})`;
}

/** Convert a pointer position (relative to the SVG element) to world coords. */
export function screenToWorld(px: number, py: number, view: View) {
  return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
}

/** Hit-test: is point (world) inside node n's box? */
export function hitNode(n: Component, wx: number, wy: number): boolean {
  const { w, h } = box(n);
  return wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h;
}

/** Pick the topmost node under a world point (last drawn = on top). */
export function pickNode(nodes: Component[], wx: number, wy: number): Component | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (hitNode(nodes[i], wx, wy)) return nodes[i];
  }
  return null;
}

type Pt = { x: number; y: number };
interface Rect { x: number; y: number; w: number; h: number }

const rectOf = (n: Component): Rect => { const { w, h } = box(n); return { x: n.x, y: n.y, w, h }; };

/** Does an axis-aligned segment p0→p1 cross rect r? (segments here are H or V.) */
function segHitsRect(p0: Pt, p1: Pt, r: Rect): boolean {
  if (p0.y === p1.y) {
    const [lo, hi] = [Math.min(p0.x, p1.x), Math.max(p0.x, p1.x)];
    return p0.y > r.y && p0.y < r.y + r.h && hi > r.x && lo < r.x + r.w;
  }
  const [lo, hi] = [Math.min(p0.y, p1.y), Math.max(p0.y, p1.y)];
  return p0.x > r.x && p0.x < r.x + r.w && hi > r.y && lo < r.y + r.h;
}

function crossings(path: Pt[], rects: Rect[]): number {
  let c = 0;
  for (let i = 0; i < path.length - 1; i++)
    for (const r of rects) if (segHitsRect(path[i], path[i + 1], r)) c++;
  return c;
}

const polyline = (pts: Pt[]) => `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');

function curvedPath(pts: Pt[]): string {
  if (pts.length === 2) {
    const [a, b] = pts;
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  return polyline(pts);
}

/**
 * Route a logical edge as an SVG path. Honours explicit ports + stored
 * waypoints + a curved flag (report §2.2); otherwise draws an orthogonal elbow
 * and, given the other nodes as obstacles, picks the bend direction that
 * crosses the fewest of them (light obstacle avoidance, report §4).
 */
export function routeEdge(a: Component, b: Component, edge?: Edge, obstacles?: Component[]): string {
  const pa = ports(a);
  const pb = ports(b);
  const fromPort = edge?.fromPort as TPortName | undefined;
  const toPort = edge?.toPort as TPortName | undefined;
  const from = fromPort ? pa[fromPort] : nearestPort(pa, center(b));
  const to = toPort ? pb[toPort] : nearestPort(pb, center(a));

  if (edge?.waypoints?.length) {
    const pts = [from, ...edge.waypoints, to];
    return edge.curved ? curvedPath(pts) : polyline(pts);
  }
  if (edge?.curved) return curvedPath([from, to]);

  // orthogonal: compare horizontal-first vs vertical-first, fewest crossings wins
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const hvh: Pt[] = [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
  const vhv: Pt[] = [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to];
  const rects = (obstacles ?? [])
    .filter((n) => n.id !== a.id && n.id !== b.id && !n.removed)
    .map(rectOf);
  return crossings(vhv, rects) < crossings(hvh, rects) ? polyline(vhv) : polyline(hvh);
}

function nearestPort(p: Ports, target: { x: number; y: number }) {
  let best = p.E;
  let bestD = Infinity;
  for (const k of ['N', 'E', 'S', 'W'] as PortName[]) {
    const d = (p[k].x - target.x) ** 2 + (p[k].y - target.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p[k];
    }
  }
  return best;
}

/** Fit-to-view: compute a view transform that frames all nodes with padding. */
export function fitView(nodes: Component[], vw: number, vh: number, pad = 80): View {
  if (!nodes.length) return { x: 60, y: 60, k: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const { w, h } = box(n);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h + 30); // include label band
  }
  const cw = maxX - minX;
  const ch = maxY - minY;
  const k = Math.min((vw - pad * 2) / cw, (vh - pad * 2) / ch, 1.6);
  return {
    k,
    x: (vw - cw * k) / 2 - minX * k,
    y: (vh - ch * k) / 2 - minY * k,
  };
}

// ---- isometric (2.5D) projection (PRD FR-44) -------------------------------

/** Project a world point onto the tilted iso ground plane. */
export function proj(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * 0.707, y: (x + y) * 0.409 };
}

/** Per-node iso placement: where its (billboarded) artwork sits + shadow geom. */
export function isoPlacement(n: Component) {
  const s = SYM[n.type as SymbolKey];
  const sc = n.scale || 1;
  const bw = s.w * sc;
  const bh = s.h * sc;
  const { w: ew, h: eh } = box(n);
  const gp = proj(n.x + bw / 2, n.y + bh / 2);
  const lift = 12 + eh * 0.55;
  return { x: gp.x - ew / 2, y: gp.y - lift - eh / 2, lift, ew, eh };
}

/** Iso depth key — back-to-front draw order. */
export const isoDepth = (n: Component) => n.x + n.y;

/** Resolve the two endpoints of a logical edge to their nodes. */
export function edgeNodes(edge: Edge, nodes: Component[]) {
  const a = nodes.find((n) => n.id === edge.from);
  const b = nodes.find((n) => n.id === edge.to);
  return a && b ? { a, b } : null;
}
