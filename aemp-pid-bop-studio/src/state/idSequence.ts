// ============================================================================
//  Shared id-sequence counter (F19 extraction from ProjectContext.tsx).
//  A single module-level counter so ids minted from anywhere in the app
//  (ProjectContext's own node/edge CRUD, useSelection's paste/duplicate/
//  group, useUnits' unit/template loads) never collide. Reseeding (F8) never
//  lowers the counter — see nextSeqSeed.
// ============================================================================
import type { Project } from '../types';
import { nextSeqSeed } from '../lib/idSeq';

let seq = 1000;

/** Mint the next id with prefix `p` (e.g. 'n', 'e', 'a', 'g'). */
export function nextId(p: string): string {
  return `${p}${seq++}`;
}

/** Reseed the id counter (F8) from a project brought in from an external
 *  source (restore / open / cloud-load / version-restore / unit switch /
 *  template) so freshly-created ids can't collide with ids it already
 *  contains. Never lowers the counter. */
export function seedSeqFromProject(project: Project | null | undefined): void {
  seq = nextSeqSeed(project, seq);
}
