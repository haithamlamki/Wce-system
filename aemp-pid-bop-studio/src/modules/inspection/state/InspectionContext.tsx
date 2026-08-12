// ============================================================================
//  Inspection module state — access gate + grants + catalog cache. Mirrors
//  TubularContext: loads the user's insp_* grants once, then the catalog.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { canAccessModule, hasPermission, type InspectionPermission } from '../lib/permissions';
import { fetchApprovers, fetchCatalog } from '../lib/records';
import type { Company, EquipmentPart, EquipmentType, InspUnit, PartComponent } from '../types';

interface InspectionState {
  enabled: boolean;
  loading: boolean;
  canAccess: boolean;
  can: (perm: InspectionPermission) => boolean;
  types: EquipmentType[];
  parts: EquipmentPart[];
  components: PartComponent[];
  units: InspUnit[];
  companies: Company[];
  approvers: { id: string; name: string }[];
  refreshCatalog: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<InspectionState | null>(null);

export function InspectionProvider({ children }: { children: ReactNode }) {
  const { role, session } = useAuth();
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [parts, setParts] = useState<EquipmentPart[]>([]);
  const [components, setComponents] = useState<PartComponent[]>([]);
  const [units, setUnits] = useState<InspUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [approvers, setApprovers] = useState<{ id: string; name: string }[]>([]);

  const enabled = isSupabaseConfigured;
  const canAccess = canAccessModule(role, granted);

  const refreshCatalog = useCallback(async () => {
    const cat = await fetchCatalog();
    setTypes(cat.types); setParts(cat.parts); setComponents(cat.components);
    setUnits(cat.units); setCompanies(cat.companies);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!enabled || !supabase || !session) { setLoading(false); return; }
      try {
        const { data, error: gErr } = await supabase
          .from('user_module_permissions').select('permission')
          .eq('user_id', session.user.id);
        if (gErr) throw new Error(gErr.message);
        if (!alive) return;
        const grants = new Set((data ?? []).map((r) => r.permission as string));
        setGranted(grants);
        if (canAccessModule(role, grants)) {
          await refreshCatalog();
          setApprovers(await fetchApprovers());
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [enabled, session, role, refreshCatalog]);

  const value = useMemo<InspectionState>(() => ({
    enabled, loading, canAccess,
    can: (perm) => hasPermission(role, granted, perm),
    types, parts, components, units, companies, approvers, refreshCatalog, error,
  }), [enabled, loading, canAccess, role, granted, types, parts, components, units, companies, approvers, refreshCatalog, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInspection(): InspectionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useInspection must be used inside InspectionProvider');
  return v;
}
