// ============================================================================
//  Security Management (guide §5.14) — admin user administration built on the
//  audited 0014 RPCs (set_user_permissions / set_user_units) and the 0032
//  profiles columns (active, access_expiry). Creating a user uses a secondary
//  Supabase client so the admin's own session is never replaced by signUp().
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { mergeModulePermissions } from './logsFormat';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'manager' | 'field' | string;
  active: boolean;
  accessExpiry: string | null;   // ISO date or null = permanent
}

export async function listUsers(): Promise<UserAccount[]> {
  const { data, error } = await need().from('profiles')
    .select('id,email,full_name,role,active,access_expiry').order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id, email: p.email ?? '', fullName: p.full_name ?? '',
    role: p.role ?? 'field', active: p.active ?? true,
    accessExpiry: p.access_expiry ?? null,
  }));
}

/** All module permissions + unit assignments for one user (admin read). */
export async function listUserGrants(userId: string): Promise<{ permissions: string[]; unitIds: string[] }> {
  const sb = need();
  const [perms, units] = await Promise.all([
    sb.from('user_module_permissions').select('permission').eq('user_id', userId),
    sb.from('user_unit_assignments').select('unit_id').eq('user_id', userId),
  ]);
  if (perms.error) throw new Error(perms.error.message);
  if (units.error) throw new Error(units.error.message);
  return {
    permissions: (perms.data ?? []).map((r) => r.permission as string),
    unitIds: (units.data ?? []).map((r) => r.unit_id as string),
  };
}

/** Replaces the user's insp_* grants, preserving other modules' permissions. */
export async function saveInspPermissions(userId: string, existing: string[], inspSelection: string[]): Promise<void> {
  const { error } = await need().rpc('set_user_permissions',
    { p_user: userId, p_perms: mergeModulePermissions(existing, inspSelection) });
  if (error) throw new Error(error.message);
}

export async function saveUserUnits(userId: string, unitIds: string[]): Promise<void> {
  const { error } = await need().rpc('set_user_units', { p_user: userId, p_unit_ids: unitIds });
  if (error) throw new Error(error.message);
}

export async function updateUserProfile(id: string, patch: {
  role?: string; active?: boolean; access_expiry?: string | null; full_name?: string;
}): Promise<void> {
  const { error } = await need().from('profiles').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** True when the signed-in account is deactivated or past its expiry date. */
export async function accountBlocked(): Promise<boolean> {
  const { data, error } = await need().rpc('account_blocked');
  if (error) return false; // fail open: pre-0032 backends have no such function
  return Boolean(data);
}

/** Creates an auth user without touching the admin's session. Depending on the
 *  project's auth settings the new user may still need to confirm their email. */
export async function createUser(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean }> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) throw new Error('Cloud not configured.');
  const temp = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await temp.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  });
  if (error) throw new Error(error.message);
  if (data.session) await temp.auth.signOut(); // discard the temp session
  return { needsConfirmation: !data.session };
}
