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
  /** Update the caller's assigned rig (writes profiles.rig). */
  updateRig: (rig: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [rig, setRig] = useState<string | null>(null);

  // F13: onAuthStateChange/getSession can fire overlapping, un-awaited
  // loadProfile calls (e.g. a sign-out racing an in-flight fetch, or two
  // rapid sign-ins). Guard against the LAST-TO-RESOLVE winning regardless of
  // event order — only the most recently started (or explicitly invalidated
  // by sign-out) result may apply.
  const raceGuard = useRef(new AuthRaceGuard()).current;

  const loadProfile = useCallback(async (uid: string, fallbackName: string) => {
    if (!supabase) return;
    const myToken = raceGuard.start();
    const { data, error } = await supabase.from('profiles').select('role, full_name, rig').eq('id', uid).single();
    if (error) console.error('Failed to load profile:', error);
    if (!raceGuard.isCurrent(myToken)) return; // superseded by a newer load or a sign-out — discard
    setRole((data?.role as Role) ?? 'field');
    setFullName(data?.full_name || fallbackName);
    setRig(data?.rig ?? null);
  }, [raceGuard]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id, data.session.user.email ?? '');
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadProfile(s.user.id, s.user.email ?? '');
      else { raceGuard.invalidate(); setRole(null); setFullName(''); setRig(null); }
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

  const updateRig = useCallback(async (newRig: string) => {
    if (!supabase || !session) return;
    const { error } = await supabase.from('profiles').update({ rig: newRig }).eq('id', session.user.id);
    if (error) throw new Error(error.message);
    setRig(newRig);
  }, [session]);

  const value: AuthCtx = {
    enabled: isSupabaseConfigured, loading, session, user: session?.user ?? null,
    role, fullName, rig, signIn, signUp, signOut, updateRig,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
