// ============================================================================
//  Id-sequence reseeding (F8) — a restored/loaded project already contains
//  ids like "n1042" / "e17" / "g3", but the in-memory `nextId` counters
//  (ProjectContext's `seq`, bop.ts's `bopSeq`) always restart from their
//  initial value on page load. Left alone, the next freshly-created id can
//  collide with one already in the loaded document. These pure helpers scan
//  a project's existing ids and return a seed that is guaranteed to be past
//  the highest one found — and never lower than the counter's current value.
// ============================================================================
import type { Project } from '../types';

const ID_TAIL = /(\d+)$/;

/** Parse the trailing integer off an id like "n1042" / "e17" / "g3" / "b12".
 *  Returns null when the id has no numeric tail (ignored by the seeders). */
export function idTail(id: string): number | null {
  const m = ID_TAIL.exec(id);
  return m ? parseInt(m[1], 10) : null;
}

/** Highest numeric id-tail found across a list of ids, or -Infinity if none. */
function maxTail(ids: Iterable<string>): number {
  let max = -Infinity;
  for (const id of ids) {
    const n = idTail(id);
    if (n !== null && n > max) max = n;
  }
  return max;
}

/**
 * Next safe seed for the node/edge/annotation `nextId` counter given a
 * loaded/restored project: one past the highest numeric suffix found across
 * `nodes[]`, `nodes[].groupId`, `edges[]` and `annotations[]`. Group ids are
 * minted via `nextId('g')` from this SAME shared `seq` counter (see
 * ProjectContext's `groupSelection`), so a group id left off the scan could
 * be reissued to a fresh node/edge/annotation after a reseed. Never lower
 * than `current` — it can only advance the counter, never rewind it.
 */
export function nextSeqSeed(
  project: Pick<Project, 'nodes' | 'edges' | 'annotations'> | null | undefined,
  current: number,
): number {
  if (!project) return current;
  const ids: string[] = [
    ...project.nodes.map((n) => n.id),
    ...project.nodes.map((n) => n.groupId).filter((g): g is string => !!g),
    ...project.edges.map((e) => e.id),
    ...(project.annotations ?? []).map((a) => a.id),
  ];
  const max = maxTail(ids);
  if (max === -Infinity) return current;
  return Math.max(current, max + 1);
}

/** Same idea for the BOP stack's independent `b<n>` id namespace. */
export function nextBopSeqSeed(items: Array<{ id: string }> | null | undefined, current: number): number {
  if (!items || !items.length) return current;
  const max = maxTail(items.map((i) => i.id));
  if (max === -Infinity) return current;
  return Math.max(current, max + 1);
}

/**
 * Pure "duplicate with fresh ids" (F11) used by paste/duplicate-selection.
 * Returns NEW copies of `items` offset by (dx, dy), each with a freshly
 * minted id from `makeId()`. Never mutates `items`, and calls `makeId()`
 * exactly once per item — so callers MUST invoke this to precompute the
 * copies BEFORE handing them to a React state updater. Calling `makeId()`
 * (which mutates an outer id counter) from inside the updater itself is
 * unsafe: StrictMode / concurrent re-invocation can run the updater twice,
 * silently skipping or duplicating ids and desyncing selection.
 */
export function withFreshIds<T extends { id: string; x: number; y: number }>(
  items: readonly T[],
  makeId: () => string,
  dx: number,
  dy: number,
): T[] {
  return items.map((it) => ({ ...it, id: makeId(), x: it.x + dx, y: it.y + dy }));
}
