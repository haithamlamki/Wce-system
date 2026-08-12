// ============================================================================
//  Inspection module — pure permission helpers (mirror of has_insp_perm() in
//  0029). The DB (RLS + RPC guards) is the real authorization boundary; these
//  only drive navigation/UI, same pattern as the tubular module.
// ============================================================================
import type { Role } from '../../../state/AuthContext';

export const INSPECTION_PERMISSIONS = [
  'insp_view',
  'insp_data_entry',
  'insp_approve',
  'insp_upload',
  'insp_manage_catalog',
  'insp_manage_files',
  'insp_export',
] as const;

export type InspectionPermission = (typeof INSPECTION_PERMISSIONS)[number];

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

export function canAccessModule(role: Role | null, granted: ReadonlySet<string>): boolean {
  return isPrivileged(role) || granted.has('insp_view');
}
