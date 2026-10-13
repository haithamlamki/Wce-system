// ============================================================================
//  Auth + role context (PRD §7.2). Wraps Supabase Auth. When Supabase is not
//  configured the app runs unauthenticated (local-only). Role comes from the
//  `profiles` table (admin / field / manager) and is exposed to gate edit UI.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { AuthRaceGuard } from '../lib/authRace';
import { clearAutosave } from '../lib/persistence';

export type Role = 'admin' | 'field' | 'manager';

interface AuthCtx {
  enabled: boolean; // Supabase configured
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: Role | null;
  fullName: string;
  /** The user's assigned rig (per-rig authorization). null = unassigned. */
  rig: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Send a password-reset email with a link back to the app. */
  resetPassword: (email: string) => Promise<void>;
  /** Set a new password (used after returning via the reset link). */
  updatePassword: (password: string) => Promise<void>;
  /** True while the user is in the password-recovery flow (clicked reset link). */
  recovery: boolean;
  /** True when an admin-provisioned account still has its default password
   *  (auth user_metadata.must_change_password) — forces the set-password screen. */
  mustChangePassword: boolean;
  /** Update the caller's assigned rig (writes profiles.rig). */
  updateRig: (rig: string) => Promise<void>;
  /** profiles.is_super_admin (0038) — unlocks User Management. UI gate only;
   *  the user-management RPCs re-check it server-side. */
  isSuperAdmin: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [rig, setRig] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [recovery, setRecovery] = useState(false);

  // F13: onAuthStateChange/getSession can fire overlapping, un-awaited
  // loadProfile calls (e.g. a sign-out racing an in-flight fetch, or two
  // rapid sign-ins). Guard against the LAST-TO-RESOLVE winning regardless of
  // event order — only the most recently started (or explicitly invalidated
  // by sign-out) result may apply.
  const raceGuard = useRef(new AuthRaceGuard()).current;

  const loadProfile = useCallback(async (uid: string, fallbackName: string) => {
    if (!supabase) return;
    const myToken = raceGuard.start();
    // Newest schema first; older backends lack is_super_admin (pre-0038) or
    // active/access_expiry (pre-0032), so fall back column set by column set.
    const columnSets = [
      'role, full_name, rig, active, access_expiry, is_super_admin',
      'role, full_name, rig, active, access_expiry',
      'role, full_name, rig',
    ];
    let data: Record<string, unknown> | null = null;
    let error: unknown = null;
    for (const cols of columnSets) {
      ({ data, error } = await supabase.from('profiles').select(cols).eq('id', uid).single());
      if (!error) break;
    }
    if (error) console.error('Failed to load profile:', error);
    if (!raceGuard.isCurrent(myToken)) return; // superseded by a newer load or a sign-out — discard
    // Account validity gate (0032): deactivated or expired accounts are signed
    // out immediately, matching the source system's login-screen block.
    const p = data as { role?: Role; full_name?: string; rig?: string | null; active?: boolean;
      access_expiry?: string | null; is_super_admin?: boolean } | null;
    const expired = p?.access_expiry ? p.access_expiry < new Date().toISOString().slice(0, 10) : false;
    if (p && (p.active === false || expired)) {
      await supabase.auth.signOut();
      alert(p.active === false
        ? 'This account has been deactivated. Contact your administrator.'
        : 'This account\'s access period has expired. Contact your administrator.');
      return;
    }
    setRole(p?.role ?? 'field');
    setFullName(p?.full_name || fallbackName);
    setRig(p?.rig ?? null);
    setIsSuperAdmin(p?.is_super_admin === true);
  }, [raceGuard]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id, data.session.user.email ?? '');
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Returning via a reset link creates a recovery session and fires this
      // event — flag it so the app shows the "set new password" screen.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      if (s) loadProfile(s.user.id, s.user.email ?? '');
      else { raceGuard.invalidate(); setRole(null); setFullName(''); setRig(null); setIsSuperAdmin(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile, raceGuard]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Cloud not configured');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, full_name: string) => {
    if (!supabase) throw new Error('Cloud not configured');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    // Drop the leaving user's local draft so it can't be restored into the next
    // person who signs in on this browser.
    clearAutosave(session?.user?.id);
    await supabase?.auth.signOut();
  }, [session]);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Cloud not configured');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('Cloud not configured');
    // Clearing must_change_password in the same call releases the forced
    // first-login password screen once the new password is saved.
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    if (error) throw new Error(error.message);
    setRecovery(false);
  }, []);

  const updateRig = useCallback(async (newRig: string) => {
    if (!supabase || !session) return;
    const { error } = await supabase.from('profiles').update({ rig: newRig }).eq('id', session.user.id);
    if (error) throw new Error(error.message);
    setRig(newRig);
  }, [session]);

  const value: AuthCtx = {
    enabled: isSupabaseConfigured, loading, session, user: session?.user ?? null,
    role, fullName, rig, signIn, signUp, signOut, resetPassword, updatePassword, recovery, updateRig,
    mustChangePassword: session?.user?.user_metadata?.must_change_password === true,
    isSuperAdmin,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
