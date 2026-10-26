// ============================================================================
//  Inspection module state — access gate + grants + catalog cache. Mirrors
//  TubularContext: loads the caller's role keys + scoped units once
//  (insp_my_access), then the catalog.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { canAccessModule, hasPermission, type InspectionAccess, type InspectionPermission } from '../lib/permissions';
import { fetchApprovers, fetchCatalog } from '../lib/records';
import { logClientError } from '../lib/accessApi';
import type { Company, EquipmentPart, EquipmentType, InspUnit, PartComponent } from '../types';

interface InspectionState {
  enabled: boolean;
  loading: boolean;
  canAccess: boolean;
  can: (perm: InspectionPermission) => boolean;
  canAny: (...perms: InspectionPermission[]) => boolean;
  /** Units inside the caller's scope templates (every unit when privileged). */
  scopedUnitIds: ReadonlySet<string>;
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
  const [scopedUnitIds, setScopedUnitIds] = useState<ReadonlySet<string>>(new Set());
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
        const { data, error: gErr } = await supabase.rpc('insp_my_access');
        if (gErr) throw new Error(gErr.message);
        if (!alive) return;
        const access = data as InspectionAccess;
        const grants = new Set(access.permissions ?? []);
        setGranted(grants);
        setScopedUnitIds(new Set(access.unitIds ?? []));
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

  // Uncaught browser errors land in App Logs (source ClientError), like the reference.
  useEffect(() => {
    if (!enabled || !session) return;
    const onError = (e: ErrorEvent) => { void logClientError(e.message, e.error?.stack); };
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | undefined;
      void logClientError(r?.message ?? String(e.reason), r?.stack);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onReject); };
  }, [enabled, session]);

  const value = useMemo<InspectionState>(() => ({
    enabled, loading, canAccess,
    can: (perm) => hasPermission(role, granted, perm),
    canAny: (...perms) => perms.some((p) => hasPermission(role, granted, p)),
    scopedUnitIds,
    types, parts, components, units, companies, approvers, refreshCatalog, error,
  }), [enabled, loading, canAccess, role, granted, scopedUnitIds, types, parts, components, units, companies, approvers, refreshCatalog, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInspection(): InspectionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useInspection must be used inside InspectionProvider');
  return v;
}
