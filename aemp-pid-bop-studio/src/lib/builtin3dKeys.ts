// ============================================================================
//  Which built-in symbols ship with a procedural 3D model (see builtin3d.ts).
//  Kept separate and three-free so the library UI can badge them without
//  pulling three.js into the main bundle.
// ============================================================================
export const BUILTIN_3D_KEYS = [
  'annular', 'dram', 'sram', 'cross', 'wellhead', 'xmastree',
  'gate', 'butterfly', 'plug', 'hcr', 'check', 'choke', 'relief',
  'manifold', 'pipe', 'hose', 'flange', 'teststump',
  'mudpump', 'pump', 'tank', 'vessel', 'mgs', 'dampener',
  'accum', 'gauge',
] as const;

const SET: ReadonlySet<string> = new Set(BUILTIN_3D_KEYS);

/** True when the built-in symbol `key` has a procedural 3D model. */
export function hasBuiltin3d(key: string): boolean {
  return SET.has(key);
}
