// ============================================================================
//  Super Admin user management (migration 0038). Account creation and password
//  resets go through super-admin-only SECURITY DEFINER RPCs — the database
//  re-checks profiles.is_super_admin, so hiding the UI is not the boundary.
//  Profile edits (name / role / status / expiry) use the 0032 admin RLS.
// ============================================================================
import { supabase } from './supabase';
import type { Role } from '../state/AuthContext';

export const ROLES: readonly Role[] = ['admin', 'manager', 'field'];
export const MIN_PASSWORD = 8;

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  rig: string | null;
  active: boolean;
  accessExpiry: string | null;   // ISO date, null = permanent
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

/** Client-side mirror of the RPC checks, so the form can fail fast. */
export function validateNewUser(email: string, password: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Enter a valid email address.';
  return validatePassword(password);
}

export function validatePassword(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (confirm !== undefined && password !== confirm) return 'Passwords don’t match.';
  return null;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const { data, error } = await need().rpc('admin_list_users');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    email: (r.email as string) ?? '',
    fullName: (r.full_name as string) ?? '',
    role: ((r.role as Role) ?? 'field'),
    rig: (r.rig as string | null) ?? null,
    active: (r.active as boolean) ?? true,
    accessExpiry: (r.access_expiry as string | null) ?? null,
    isSuperAdmin: Boolean(r.is_super_admin),
    mustChangePassword: Boolean(r.must_change_password),
    createdAt: (r.created_at as string | null) ?? null,
    lastSignInAt: (r.last_sign_in_at as string | null) ?? null,
  }));
}

export async function createManagedUser(input: {
  email: string; password: string; fullName: string; role: Role; mustChange: boolean;
}): Promise<string> {
  const { data, error } = await need().rpc('admin_create_user', {
    p_email: input.email.trim(), p_password: input.password, p_full_name: input.fullName.trim(),
    p_role: input.role, p_must_change: input.mustChange,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function resetManagedPassword(userId: string, password: string, mustChange: boolean): Promise<void> {
  const { error } = await need().rpc('admin_reset_password', {
    p_user: userId, p_password: password, p_must_change: mustChange,
  });
  if (error) throw new Error(error.message);
}

export async function updateManagedUser(userId: string, patch: {
  full_name?: string; role?: Role; active?: boolean; access_expiry?: string | null;
}): Promise<void> {
  const { error } = await need().from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}
