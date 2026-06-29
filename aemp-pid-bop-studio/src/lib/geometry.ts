// ============================================================================
//  Canvas geometry  —  bounding boxes, ports, transforms, view <-> world.
//  Ported from the prototype's box()/ports() and node render transform so the
//  React canvas places, rotates, scales and connects items identically.
// ============================================================================
import type { Component, Edge } from '../types';
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

/** Orthogonal (elbow) route between the nearest ports of two nodes. */
export function routeEdge(a: Component, b: Component): string {
  const ca = center(a);
  const cb = center(b);
  const pa = ports(a);
  const pb = ports(b);
  // choose the port on each node closest to the other node's centre
  const from = nearestPort(pa, cb);
  const to = nearestPort(pb, ca);
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`;
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
