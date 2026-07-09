// ============================================================================
//  Tubular module context — loads the caller's module permissions and unit
//  assignments once per session (mirrors AuthContext's profile load pattern).
//  RLS lets a user read only their own permission/assignment rows; privileged
//  roles bypass grants entirely (see 0014_tubular_foundation.sql), so for
//  admin/manager we skip the grant fetch and load every active unit instead.
//  The DB remains the authorization boundary — this context only drives UI.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import {
  canAccessModule,
  hasPermission,
  isPrivileged,
  type TubularPermission,
} from '../lib/permissions';

export interface TubularUnit {
  id: string;
  name: string;
  unitType: 'rig' | 'hoist';
  active: boolean;
}

interface TubularCtx {
  /** Supabase configured — the module is cloud-backed and needs it. */
  enabled: boolean;
  loading: boolean;
  /** Explicit grants (empty for privileged users — they bypass). */
  granted: ReadonlySet<string>;
  /** Units the caller may work with (all active units when privileged). */
  units: TubularUnit[];
  canAccess: boolean;
  hasPerm: (p: TubularPermission) => boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<TubularCtx | null>(null);

export function TubularProvider({ children }: { children: ReactNode }) {
  const { session, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const [units, setUnits] = useState<TubularUnit[]>([]);

  const load = useCallback(async () => {
    if (!supabase || !session) {
      setGranted(new Set());
      setUnits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (isPrivileged(role)) {
        const { data, error } = await supabase
          .from('units')
          .select('id, name, unit_type, active')
          .eq('active', true)
          .order('unit_type')
          .order('name');
        if (error) throw error;
        setGranted(new Set());
        setUnits((data ?? []).map((u) => ({
          id: u.id as string,
          name: u.name as string,
          unitType: (u.unit_type as 'rig' | 'hoist') ?? 'rig',
          active: (u.active as boolean) ?? true,
        })));
      } else {
        const [permsRes, unitsRes] = await Promise.all([
          supabase.from('user_module_permissions').select('permission').eq('user_id', session.user.id),
          supabase
            .from('user_unit_assignments')
            .select('unit_id, units(id, name, unit_type, active)')
            .eq('user_id', session.user.id),
        ]);
        if (permsRes.error) throw permsRes.error;
        if (unitsRes.error) throw unitsRes.error;
        setGranted(new Set((permsRes.data ?? []).map((r) => r.permission as string)));
        setUnits(((unitsRes.data ?? []) as unknown as Array<{ units: { id: string; name: string; unit_type: string; active: boolean } | null }>)
          .map((r) => r.units)
          .filter((u): u is NonNullable<typeof u> => !!u && u.active !== false)
          .map((u) => ({
            id: u.id,
            name: u.name,
            unitType: (u.unit_type as 'rig' | 'hoist') ?? 'rig',
            active: u.active ?? true,
          })));
      }
    } catch (e) {
      console.error('Failed to load tubular access:', e);
      // fail closed: no grants, no units
      setGranted(new Set());
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [session, role]);

  useEffect(() => { void load(); }, [load]);

  const value = useMemo<TubularCtx>(() => ({
    enabled: isSupabaseConfigured,
    loading,
    granted,
    units,
    canAccess: canAccessModule(role, granted),
    hasPerm: (p: TubularPermission) => hasPermission(role, granted, p),
    refresh: load,
  }), [loading, granted, units, role, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTubular(): TubularCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTubular must be used within <TubularProvider>');
  return ctx;
}
