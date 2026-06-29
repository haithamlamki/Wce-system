// ============================================================================
//  Layout validation engine  (research report §2.4 / §4 — geometric & logical
//  checks only; no hydraulics). Pure, side-effect-free — mirrors status.ts so
//  views can recompute issues in a useMemo over the project.
// ============================================================================
import type { Component, Project } from '../types';
import { box, center } from './geometry';
import { SYM, type SymbolKey } from './symbols';

export type IssueKind = 'overlap' | 'clearance' | 'dangling' | 'duplicate' | 'untagged';
export type Severity = 'warn' | 'error';

export interface Issue {
  id: string;
  kind: IssueKind;
  severity: Severity;
  message: string;
  /** Components implicated (first entry is the click-to-zoom target). */
  nodeIds: string[];
  edgeId?: string;
  /** World-space anchor for centering the view. */
  at?: { x: number; y: number };
}

export interface ValidateOptions {
  /** Minimum gap (world units) required between component boxes; 0 = overlap-only. */
  clearance?: number;
  /**
   * Minimum overlap area as a fraction of the smaller box (0..1) before an
   * overlap is reported. Schematic layouts pack symbols so boxes often touch;
   * this keeps the check from firing on incidental edge contact. Default 0.18.
   */
  minOverlapRatio?: number;
}

/** Intersection area of two component boxes (0 if they don't overlap). */
function interArea(a: Component, b: Component): number {
  const ba = box(a);
  const bb = box(b);
  const ix = Math.min(a.x + ba.w, b.x + bb.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + ba.h, b.y + bb.h) - Math.max(a.y, b.y);
  return ix > 0 && iy > 0 ? ix * iy : 0;
}

const boxArea = (n: Component) => { const b = box(n); return b.w * b.h; };

/** Are two boxes within `gap` of each other without actually overlapping? */
function withinGap(a: Component, b: Component, gap: number): boolean {
  if (gap <= 0 || interArea(a, b) > 0) return false;
  const ba = box(a);
  const bb = box(b);
  return (
    a.x - gap < b.x + bb.w && a.x + ba.w + gap > b.x &&
    a.y - gap < b.y + bb.h && a.y + ba.h + gap > b.y
  );
}

const midpoint = (a: Component, b: Component) => {
  const ca = center(a);
  const cb = center(b);
  return { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
};

/** Run all layout checks and return the list of issues (empty = clean). */
export function validate(project: Project, opts: ValidateOptions = {}): Issue[] {
  const clearance = opts.clearance ?? 0;
  const minRatio = opts.minOverlapRatio ?? 0.18;
  const issues: Issue[] = [];
  const live = project.nodes.filter((n) => !n.removed);
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  // pairs joined by a connection are expected to sit close — don't flag them
  const linked = new Set(project.edges.map((e) => [e.from, e.to].sort().join('::')));
  const name = (n: Component) => n.tag || SYM[n.type as SymbolKey].name;

  // 1. Overlap / clearance — pairwise, ignoring incidental edge contact and
  //    deliberately-connected or grouped pairs.
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.groupId && a.groupId === b.groupId) continue; // grouped items may abut
      if (linked.has([a.id, b.id].sort().join('::'))) continue; // connected on purpose
      const area = interArea(a, b);
      if (area > 0) {
        if (area / Math.min(boxArea(a), boxArea(b)) < minRatio) continue; // incidental touch
        issues.push({
          id: `ov-${a.id}-${b.id}`, kind: 'overlap', severity: 'warn',
          message: `${name(a)} overlaps ${name(b)}`,
          nodeIds: [a.id, b.id], at: midpoint(a, b),
        });
      } else if (withinGap(a, b, clearance)) {
        issues.push({
          id: `cl-${a.id}-${b.id}`, kind: 'clearance', severity: 'warn',
          message: `${name(a)} is closer than ${clearance}px to ${name(b)}`,
          nodeIds: [a.id, b.id], at: midpoint(a, b),
        });
      }
    }
  }

  // 2. Dangling edges — endpoint references a missing node
  for (const e of project.edges) {
    const missing = [e.from, e.to].filter((id) => !byId.has(id));
    if (missing.length) {
      issues.push({
        id: `dang-${e.id}`,
        kind: 'dangling',
        severity: 'error',
        message: `Connection references a missing component`,
        nodeIds: [e.from, e.to].filter((id) => byId.has(id)),
        edgeId: e.id,
      });
    }
  }

  // 3. Duplicate links — same unordered node pair connected more than once
  const seen = new Map<string, string>();
  for (const e of project.edges) {
    const key = [e.from, e.to].sort().join('::');
    if (seen.has(key)) {
      const a = byId.get(e.from);
      issues.push({
        id: `dup-${e.id}`,
        kind: 'duplicate',
        severity: 'warn',
        message: `Duplicate connection between two components`,
        nodeIds: [e.from, e.to].filter((id) => byId.has(id)),
        edgeId: e.id,
        at: a ? center(a) : undefined,
      });
    } else {
      seen.set(key, e.id);
    }
  }

  // 4. Untagged critical equipment — BOP-stack items without a tag
  for (const n of live) {
    if (SYM[n.type as SymbolKey]?.cat === 'BOP Stack' && !n.tag.trim()) {
      issues.push({
        id: `untag-${n.id}`,
        kind: 'untagged',
        severity: 'warn',
        message: `${SYM[n.type as SymbolKey].name} has no tag`,
        nodeIds: [n.id],
        at: center(n),
      });
    }
  }

  return issues;
}

/** Count issues by severity for a summary badge. */
export function summarizeIssues(issues: Issue[]): { errors: number; warns: number } {
  let errors = 0;
  let warns = 0;
  for (const i of issues) (i.severity === 'error' ? errors++ : warns++);
  return { errors, warns };
}
