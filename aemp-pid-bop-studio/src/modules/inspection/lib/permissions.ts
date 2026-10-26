// ============================================================================
//  Inspection module — pure permission helpers, mirroring the reference
//  eInspection model (0044): roles hold `resource:action` keys and scope
//  templates hold companies / units. The DB (RLS + RPC guards) is the real
//  authorization boundary; these only drive navigation / UI.
// ============================================================================
import type { Role } from '../../../state/AuthContext';

const ACTIONS = {
  ai: ['use'],
  audit: ['view'],
  calibration: ['create', 'delete', 'export', 'file-download', 'file-upload', 'import', 'notify', 'update', 'view'],
  company: ['create', 'delete', 'update', 'view'],
  dashboard: ['view'],
  equipment: ['create', 'delete', 'update', 'view'],
  'equipment-category': ['create', 'delete', 'update', 'view'],
  'equipment-component': ['create', 'delete', 'update', 'view'],
  inspection: ['approve', 'create', 'delete', 'edit-identity', 'export', 'import', 'notify', 'update', 'view'],
  'inspection-file': ['delete', 'download', 'upload'],
  'inspection-frequency': ['create', 'delete', 'update', 'view'],
  library: ['create', 'delete', 'download', 'view'],
  log: ['view'],
  pid: ['create', 'delete', 'issue', 'update', 'view'],
  'release-log': ['view'],
  role: ['create', 'delete', 'manage-permissions', 'update', 'view'],
  'shared-document': ['create', 'delete', 'view'],
  specification: ['create', 'delete', 'update', 'view'],
  unit: ['create', 'delete', 'update', 'view'],
  user: ['create', 'delete', 'manage-access', 'set-password', 'update', 'view'],
  'vendor-company': ['create', 'update', 'view'],
} as const;

type Actions = typeof ACTIONS;
export type InspectionPermission = {
  [R in keyof Actions]: `${R & string}:${Actions[R][number]}`
}[keyof Actions];

/** All 80 reference permission keys, grouped by resource in reference order. */
export const INSPECTION_PERMISSIONS: readonly InspectionPermission[] = Object.entries(ACTIONS)
  .flatMap(([r, acts]) => (acts as readonly string[]).map((a) => `${r}:${a}` as InspectionPermission));

export const PERMISSION_RESOURCES = Object.keys(ACTIONS) as (keyof Actions)[];

export function permissionsOf(resource: string): InspectionPermission[] {
  return INSPECTION_PERMISSIONS.filter((p) => p.startsWith(resource + ':'));
}

/** What `insp_my_access()` returns. */
export interface InspectionAccess {
  privileged: boolean;
  permissions: string[];
  unitIds: string[];
}

export function isPrivileged(role: Role | null): boolean {
  return role === 'admin' || role === 'manager';
}

export function hasPermission(
  role: Role | null,
  granted: ReadonlySet<string>,
  perm: InspectionPermission,
): boolean {
  return isPrivileged(role) || granted.has(perm);
}

/** The module opens for privileged users or anyone holding at least one key. */
export function canAccessModule(role: Role | null, granted: ReadonlySet<string>): boolean {
  return isPrivileged(role) || granted.size > 0;
}

/** Keys / ids to add and remove to turn `current` into `wanted`. */
export function diffSets(current: readonly string[], wanted: readonly string[]): { added: string[]; removed: string[] } {
  const c = new Set(current);
  const w = new Set(wanted);
  return { added: [...w].filter((x) => !c.has(x)), removed: [...c].filter((x) => !w.has(x)) };
}
