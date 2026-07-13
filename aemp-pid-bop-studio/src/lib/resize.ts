// ============================================================================
//  Resize math — pure functions behind the 8-direction resize handles.
//  Corners scale proportionally (uniform `scale`); Shift+corner and the four
//  side handles stretch a single dimension (`sx`/`sy`, mapped through the
//  node's rotation so the artwork stretches along its local axes). Every
//  variant keeps the opposite corner/edge anchored, so the symbol grows away
//  from the fixed side — connected pipes follow because ports derive from
//  box(), which already honours scale/sx/sy.
// ============================================================================
import type { Component } from '../types';

export type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Transform snapshot of the node when the resize drag started. */
export interface ResizeStart {
  x: number;
  y: number;
  scale: number;
  sx: number;
  sy: number;
  /** normalised rotation (0/90/180/270) */
  rot: number;
}

interface Pt { x: number; y: number }
interface Dim { w: number; h: number }

/** Factor clamp: symbols can shrink to 20% and grow to 8× of their base. */
const clampF = (v: number) => Math.max(0.2, Math.min(8, v));

/** The world-space point that must NOT move during a resize with `handle`:
 *  the opposite corner (or opposite edge for side handles). */
export function resizeAnchor(handle: HandleName, x: number, y: number, b: Dim): Pt {
  return {
    x: handle.includes('w') ? x + b.w : x,
    y: handle.includes('n') ? y + b.h : y,
  };
}

/**
 * Compute the node patch for a resize drag.
 *  - `start`/`box0`/`anchor`/`d0` are captured at pointer-down (`d0` = start
 *    pointer→anchor distance, used for the proportional corner factor).
 *  - `ptr` is the current pointer in world space.
 *  - `proportional` = corner handle without Shift → uniform `scale`.
 * Returns a partial Component (scale or sx/sy, plus x/y so the anchor stays
 * fixed when dragging a north/west handle).
 */
export function resizePatch(
  handle: HandleName,
  start: ResizeStart,
  box0: Dim,
  anchor: Pt,
  d0: number,
  ptr: Pt,
  proportional: boolean,
): Partial<Component> {
  const isCorner = handle.length === 2;

  if (isCorner && proportional) {
    const dist = Math.hypot(ptr.x - anchor.x, ptr.y - anchor.y);
    const scale = clampF(start.scale * (dist / (d0 || 1)));
    const f = scale / start.scale;
    return {
      scale,
      x: handle.includes('w') ? anchor.x - box0.w * f : start.x,
      y: handle.includes('n') ? anchor.y - box0.h * f : start.y,
    };
  }

  // Single-axis stretch (side handles) or free two-axis stretch (Shift+corner):
  // displayed-box growth factors first…
  const fw = handle.includes('e') ? (ptr.x - start.x) / box0.w
    : handle.includes('w') ? (anchor.x - ptr.x) / box0.w : 1;
  const fh = handle.includes('s') ? (ptr.y - start.y) / box0.h
    : handle.includes('n') ? (anchor.y - ptr.y) / box0.h : 1;

  // …then mapped onto the LOCAL stretch factors. At 90°/270° the displayed
  // box is the local box with w/h swapped, so screen-width changes drive sy.
  const swap = start.rot === 90 || start.rot === 270;
  const sx = clampF(start.sx * (swap ? fh : fw));
  const sy = clampF(start.sy * (swap ? fw : fh));

  // Effective (post-clamp) displayed factors, so the anchor stays exact even
  // when a factor hit its clamp.
  const efw = swap ? sy / start.sy : sx / start.sx;
  const efh = swap ? sx / start.sx : sy / start.sy;
  return {
    sx,
    sy,
    x: handle.includes('w') ? anchor.x - box0.w * efw : start.x,
    y: handle.includes('n') ? anchor.y - box0.h * efh : start.y,
  };
}
