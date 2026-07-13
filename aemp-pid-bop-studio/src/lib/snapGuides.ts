// ============================================================================
//  Smart alignment guides — Figma/PowerPoint-style object snapping while
//  dragging. The moving selection's box edges + centre are compared against
//  every static node's edges + centre; within tolerance the drag snaps to the
//  match and a guide line is returned for the canvas to draw.
//  Pure functions: candidate sets are built once at drag start, then
//  applySmartSnap runs per pointer-move (O(static candidates) per frame).
// ============================================================================
import type { Component } from '../types';
import { box } from './geometry';

/** One snappable coordinate of a static node: the value on the snap axis plus
 *  the node's extent on the OTHER axis (for drawing the guide line). */
export interface SnapCand { v: number; lo: number; hi: number }
export interface SnapSets { x: SnapCand[]; y: SnapCand[] }

/** A guide line to render: vertical (`v`, at x=pos spanning lo..hi in y) or
 *  horizontal (`h`, at y=pos spanning lo..hi in x). */
export interface Guide { axis: 'v' | 'h'; pos: number; lo: number; hi: number }

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/** Build the static candidate sets: left/centre/right (x) and top/middle/
 *  bottom (y) of every node not being dragged. */
export function buildSnapSets(nodes: Component[], exclude: Set<string>): SnapSets {
  const x: SnapCand[] = [];
  const y: SnapCand[] = [];
  for (const n of nodes) {
    if (exclude.has(n.id) || n.removed) continue;
    const b = box(n);
    for (const v of [n.x, n.x + b.w / 2, n.x + b.w]) x.push({ v, lo: n.y, hi: n.y + b.h });
    for (const v of [n.y, n.y + b.h / 2, n.y + b.h]) y.push({ v, lo: n.x, hi: n.x + b.w });
  }
  return { x, y };
}

interface Best { diff: number; cand: SnapCand }

function nearest(moving: number[], cands: SnapCand[], tol: number): Best | null {
  let best: Best | null = null;
  for (const m of moving) {
    for (const c of cands) {
      const diff = c.v - m;
      if (Math.abs(diff) < tol && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff, cand: c };
    }
  }
  return best;
}

/**
 * Given the moving selection's bounds at the RAW (unsnapped) drag position,
 * return the dx/dy correction that aligns the closest edge/centre pair within
 * `tol`, plus the guide lines to draw (empty when nothing snapped).
 */
export function applySmartSnap(b: Bounds, sets: SnapSets, tol: number): { dx: number; dy: number; guides: Guide[] } {
  const bx = nearest([b.minX, (b.minX + b.maxX) / 2, b.maxX], sets.x, tol);
  const by = nearest([b.minY, (b.minY + b.maxY) / 2, b.maxY], sets.y, tol);
  const dx = bx ? bx.diff : 0;
  const dy = by ? by.diff : 0;
  const guides: Guide[] = [];
  if (bx) guides.push({ axis: 'v', pos: bx.cand.v, lo: Math.min(bx.cand.lo, b.minY + dy), hi: Math.max(bx.cand.hi, b.maxY + dy) });
  if (by) guides.push({ axis: 'h', pos: by.cand.v, lo: Math.min(by.cand.lo, b.minX + dx), hi: Math.max(by.cand.hi, b.maxX + dx) });
  return { dx, dy, guides };
}
