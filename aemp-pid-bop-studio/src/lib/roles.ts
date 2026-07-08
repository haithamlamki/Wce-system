// ============================================================================
//  Role → edit-permission helper (F9). Kept as a tiny pure allow-list so a
//  role that hasn't loaded yet (null) or a fetch that failed (also null) can
//  never be mistaken for an editor. This is a UX / defense-in-depth
//  complement to server-side RLS — it is not itself an authorization
//  boundary.
// ============================================================================
import type { Role } from '../state/AuthContext';

/** Only admin/manager may edit. Unknown/loading/field roles are read-only. */
export function canEditForRole(role: Role | null): boolean {
  return role === 'admin' || role === 'manager';
}
