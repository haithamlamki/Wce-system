// ============================================================================
//  Client mapping — which client each Rig/Hoist works for. Frontend constant
//  (no DB column): keys are exact tubular_units.name values. Units missing
//  from this map match no client selection and appear only under
//  "All Clients". Rigs listed here that are not yet units in the database
//  (112, 211, 401) start working the day their unit rows are created.
// ============================================================================

export const CLIENT_BY_UNIT: Record<string, string> = {
  'Rig 103': 'PDO', 'Rig 104': 'PDO', 'Rig 105': 'Medco', 'Rig 106': 'PDO',
  'Rig 107': 'PDO', 'Rig 108': 'PDO', 'Rig 109': 'PDO', 'Rig 110': 'OQ',
  'Rig 111': 'OQ', 'Rig 112': 'K.S.C',
  'Rig 201': 'PDO', 'Rig 202': 'PDO', 'Rig 203': 'PDO', 'Rig 204': 'ARA',
  'Rig 205': 'OQ', 'Rig 206': 'OXY', 'Rig 207': 'OXY', 'Rig 208': 'OXY',
  'Rig 209': 'OXY', 'Rig 210': 'OQ', 'Rig 211': 'K.S.C',
  'Rig 301': 'PDO', 'Rig 302': 'PDO', 'Rig 303': 'PDO', 'Rig 304': 'PDO',
  'Rig 305': 'BP', 'Rig 306': 'PDO', 'Rig 401': 'K.S.C',
  'Hoist 1': 'PDO', 'Hoist 2': 'PDO', 'Hoist 3': 'PDO',
  'Hoist 4': 'PDO', 'Hoist 5': 'PDO',
};

/** Client for a unit name, or null when the unit is not in the map. */
export function clientOf(unitName: string): string | null {
  return CLIENT_BY_UNIT[unitName] ?? null;
}

/** Sorted unique client names present among the given units. */
export function clientsIn(units: ReadonlyArray<{ name: string }>): string[] {
  return [...new Set(
    units.map((u) => clientOf(u.name)).filter((c): c is string => c !== null),
  )].sort();
}

/** Ids of the given units that belong to `client`. */
export function unitIdsForClient(
  units: ReadonlyArray<{ id: string; name: string }>,
  client: string,
): Set<string> {
  return new Set(units.filter((u) => clientOf(u.name) === client).map((u) => u.id));
}
