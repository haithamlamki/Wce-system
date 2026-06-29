// ============================================================================
//  Layout de-overlap pass.
//  The extracted Rig 305 geometry packs valves closer together than our
//  illustrated symbols are drawn, so big glyphs collide in dense manifolds.
//  This relaxes overlaps by SHRINKING the crowded symbols about their own
//  centre (so each item stays exactly on its pipe connection — preserving the
//  source positions, PRD FR-42) and only nudging items that are coincident or
//  fully contained, where shrinking alone can't separate them.
// ============================================================================
import type { Component } from '../types';
import { box, normRot } from './geometry';
import { SYM, type SymbolKey } from './symbols';

export interface RelaxOptions {
  /** Smallest scale a symbol may shrink to before nudging takes over. */
  minScale?: number;
  /** Overlap area (fraction of the smaller box) to relax below. */
  ratio?: number;
  /** Max relaxation iterations. */
  iters?: number;
}

/** Unrotated base box dimensions (rotation swaps w/h). */
function baseDims(n: Component): { w: number; h: number } {
  const s = SYM[n.type as SymbolKey];
  const r = normRot(n.rot);
  return r === 90 || r === 270 ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}

/** Change a node's scale while holding its centre fixed (keeps pipes aligned). */
function rescaleAboutCentre(n: Component, ns: number): void {
  const s0 = n.scale || 1;
  const { w, h } = baseDims(n);
  n.x += (w * (s0 - ns)) / 2;
  n.y += (h * (s0 - ns)) / 2;
  n.scale = ns;
}

/**
 * Return a copy of `nodes` with overlaps relaxed. Centres are preserved for the
 * common (shrink) case; only coincident/contained pairs are nudged apart.
 */
export function relaxOverlaps(nodes: Component[], opts: RelaxOptions = {}): Component[] {
  const minScale = opts.minScale ?? 0.4;
  // relax below the validator's flag threshold (0.18) with margin so dense
  // grids settle cleanly rather than hovering just above it.
  const ratio = opts.ratio ?? 0.12;
  const iters = opts.iters ?? 200;
  const work = nodes.map((n) => ({ ...n }));
  const live = work.filter((n) => !n.removed);

  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        if (a.groupId && a.groupId === b.groupId) continue;
        const ba = box(a);
        const bb = box(b);
        const ix = Math.min(a.x + ba.w, b.x + bb.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + ba.h, b.y + bb.h) - Math.max(a.y, b.y);
        if (ix <= 0 || iy <= 0) continue;
        const rr = (ix * iy) / Math.min(ba.w * ba.h, bb.w * bb.h);
        if (rr < ratio) continue;
        changed = true;

        const dx = (b.x + bb.w / 2) - (a.x + ba.w / 2);
        const dy = (b.y + bb.h / 2) - (a.y + ba.h / 2);
        const contained = ix >= Math.min(ba.w, bb.w) - 1 && iy >= Math.min(ba.h, bb.h) - 1;
        const atFloor = (a.scale || 1) <= minScale && (b.scale || 1) <= minScale;

        if (Math.hypot(dx, dy) < 1 || contained || atFloor) {
          // shrinking can't separate these — push apart along the axis of least
          // penetration (guaranteed to remove the overlap on that axis)
          if (ix <= iy) {
            const s = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
            const m = ix / 2 + 1;
            a.x -= s * m; b.x += s * m;
          } else {
            const s = dy === 0 ? (j % 2 === 0 ? 1 : -1) : Math.sign(dy);
            const m = iy / 2 + 1;
            a.y -= s * m; b.y += s * m;
          }
        }
        if (!contained) {
          rescaleAboutCentre(a, Math.max(minScale, (a.scale || 1) * 0.94));
          rescaleAboutCentre(b, Math.max(minScale, (b.scale || 1) * 0.94));
        }
      }
    }
    if (!changed) break;
  }

  for (const n of work) {
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
    n.scale = Math.round((n.scale || 1) * 100) / 100;
  }
  return work;
}
