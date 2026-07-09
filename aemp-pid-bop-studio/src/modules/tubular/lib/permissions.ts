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
  /** Tab glyph shown in the nav. */
  icon: string;
  /** Tab number (zero-padded, prototype style). */
  num: string;
  /** Permission needed to see the tab; null = any module access. */
  requires: TubularPermission | null;
}

/** Module navigation — the original 10 tabs in prototype order + 3 platform tabs. */
export const TUBULAR_TABS: TubularTab[] = [
  { to: '/tubular', label: 'Dashboard', icon: '▦', num: '01', requires: null },
  { to: '/tubular/inventory', label: 'Fleet Inventory', icon: '⊟', num: '02', requires: null },
  { to: '/tubular/entry', label: 'Data Entry', icon: '✎', num: '03', requires: 'data_entry' },
  { to: '/tubular/assistant', label: 'AI Assistant', icon: '◈', num: '04', requires: null },
  { to: '/tubular/contracts', label: 'Contracts', icon: '▤', num: '05', requires: null },
  { to: '/tubular/reference', label: 'Reference', icon: '◐', num: '06', requires: null },
  { to: '/tubular/map', label: 'Asset Map', icon: '◎', num: '07', requires: null },
  { to: '/tubular/orders', label: 'Order Pipe', icon: '⛟', num: '08', requires: null },
  { to: '/tubular/manual', label: 'Manual', icon: '📘', num: '09', requires: null },
  { to: '/tubular/training', label: 'Training', icon: '🎓', num: '10', requires: null },
  { to: '/tubular/master', label: 'Master Register', icon: '▥', num: '11', requires: 'view_fleet' },
  { to: '/tubular/transfers', label: 'Transfers', icon: '⇄', num: '12', requires: null },
  { to: '/tubular/import', label: 'Import', icon: '⬆', num: '13', requires: 'import' },
];

export function visibleTabs(role: Role | null, granted: ReadonlySet<string>): TubularTab[] {
  if (!canAccessModule(role, granted)) return [];
  return TUBULAR_TABS.filter((t) => t.requires === null || hasPermission(role, granted, t.requires));
}
