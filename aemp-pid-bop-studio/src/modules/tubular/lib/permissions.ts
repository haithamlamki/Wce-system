// ============================================================================
//  Tubular module — pure permission helpers (mirror of the DB rules in
//  0014_tubular_foundation.sql). The database (RLS + SECDEF RPC guards) is the
//  real authorization boundary; these helpers only drive navigation/UI, the
//  same way canEditForRole() does for WCE.
//  Rule parity with has_tubular_perm(): admin/manager (is_privileged) hold
//  every permission implicitly; everyone else needs an explicit grant row.
// ============================================================================
import type { Role } from '../../../state/AuthContext';

export const TUBULAR_PERMISSIONS = [
  'view',
  'view_fleet',
  'data_entry',
  'approve_movements',
  'approve_orders',
  'manage_orders',
  'manage_catalog',
  'manage_contracts',
  'import',
  'export',
  'manage_assignments',
] as const;

export type TubularPermission = (typeof TUBULAR_PERMISSIONS)[number];

export function isPrivileged(role: Role | null): boolean {
  return role === 'admin' || role === 'manager';
}

export function hasPermission(
  role: Role | null,
  granted: ReadonlySet<string>,
  perm: TubularPermission,
): boolean {
  return isPrivileged(role) || granted.has(perm);
}

/** Module is visible when the user can see at least their own units' data. */
export function canAccessModule(role: Role | null, granted: ReadonlySet<string>): boolean {
  return isPrivileged(role) || granted.has('view') || granted.has('view_fleet');
}

export interface TubularTab {
  to: string;
  label: string;
  /** Permission needed to see the tab; null = any module access. */
  requires: TubularPermission | null;
}

/** Module navigation. Unrouted pages render a placeholder until their PR lands. */
export const TUBULAR_TABS: TubularTab[] = [
  { to: '/tubular', label: 'Dashboard', requires: null },
  { to: '/tubular/inventory', label: 'Fleet Inventory', requires: null },
  { to: '/tubular/entry', label: 'Data Entry', requires: 'data_entry' },
  { to: '/tubular/master', label: 'Master Register', requires: 'view_fleet' },
  { to: '/tubular/transfers', label: 'Transfers', requires: null },
  { to: '/tubular/contracts', label: 'Contracts', requires: null },
  { to: '/tubular/orders', label: 'Order Pipe', requires: null },
  { to: '/tubular/map', label: 'Asset Map', requires: null },
  { to: '/tubular/reference', label: 'Reference', requires: null },
  { to: '/tubular/training', label: 'Training', requires: null },
  { to: '/tubular/manual', label: 'Manual', requires: null },
  { to: '/tubular/import', label: 'Import', requires: 'import' },
];

export function visibleTabs(role: Role | null, granted: ReadonlySet<string>): TubularTab[] {
  if (!canAccessModule(role, granted)) return [];
  return TUBULAR_TABS.filter((t) => t.requires === null || hasPermission(role, granted, t.requires));
}
