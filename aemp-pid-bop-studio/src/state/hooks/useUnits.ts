// ============================================================================
//  Units hook (F19 extraction from ProjectContext.tsx).
//  Owns the user-manageable "units" (rigs) list, the Units panel's open/closed
//  state, per-unit templates, and switching/loading a unit's drawing —
//  including the field-user auto-load-latest-published effect.
//
//  Inputs:  role/authRig/authEnabled (from useAuth), the live `project` (read
//           for renameUnit's current-rig check and saveUnitTemplate's default
//           rig), setProject, setCloudId, and setSelectedId (from
//           useSelection) so switching/loading a unit clears the selection.
//  Outputs: exactly the units/template surface useProject() exposes.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import type { Project } from '../../types';
import { rigData, RIGS, buildFromRegister, buildMaster, seedProjectFromTemplate } from '../../lib/aemp';
import {
  addUnit as cloudAddUnit, deleteUnit as cloudDeleteUnit, fetchLatestProject, fetchLatestPublished,
  fetchUnitTemplate, isSupabaseConfigured, listProjectsCloud, listUnits, listUnitTemplates,
  renameUnit as cloudRenameUnit, saveUnitTemplate as cloudSaveUnitTemplate, type ProjectSummary,
} from '../../lib/cloud';
import type { Role } from '../AuthContext';
import { seedSeqFromProject } from '../idSequence';

export interface UnitsApi {
  units: string[];
  refreshUnits: () => Promise<void>;
  switchUnit: (name: string) => Promise<void>;
  addUnit: (name: string) => Promise<void>;
  renameUnit: (oldName: string, newName: string) => Promise<void>;
  removeUnit: (name: string) => Promise<void>;
  showUnits: boolean;
  setShowUnits: (b: boolean) => void;
  unitTemplates: string[];
  refreshUnitTemplates: () => Promise<void>;
  startFromTemplate: (rig: string) => Promise<void>;
  saveUnitTemplate: (rig?: string) => Promise<void>;
  listUnitDiagrams: (rig: string) => Promise<ProjectSummary[]>;
}

export function useUnits(
  role: Role | null,
  authRig: string | null,
  authEnabled: boolean,
  project: Project,
  setProject: React.Dispatch<React.SetStateAction<Project>>,
  setCloudId: (id: string | null) => void,
  setCloudVersion: (v: number | null) => void,
  setSelectedId: (id: string | null) => void,
): UnitsApi {
  // Each unit owns a page/drawing (a `projects` row keyed by rig_name). The list
  // comes from the cloud `units` table (admin-managed), merged with the built-in
  // rigs so their master templates stay available; falls back to built-ins when
  // the cloud is off or migration 0008 hasn't been applied.
  const [units, setUnits] = useState<string[]>(() => Object.keys(RIGS));
  const [showUnits, setShowUnits] = useState(false);
  const [unitTemplates, setUnitTemplates] = useState<string[]>([]);

  const refreshUnits = useCallback(async () => {
    const builtins = Object.keys(RIGS);
    if (!isSupabaseConfigured) { setUnits(builtins); return; }
    try {
      const names = await listUnits();
      setUnits(Array.from(new Set([...names, ...builtins])).sort());
    } catch { setUnits(builtins); }
  }, []);
  const refreshUnitTemplates = useCallback(async () => {
    if (!isSupabaseConfigured) { setUnitTemplates([]); return; }
    try { setUnitTemplates(await listUnitTemplates()); } catch { setUnitTemplates([]); }
  }, []);
  useEffect(() => { refreshUnits(); refreshUnitTemplates(); }, [refreshUnits, refreshUnitTemplates]);

  // Switch the active unit and load its drawing: field users see the latest
  // PUBLISHED sheet; privileged users get the latest saved row (so Save upserts
  // it), or a fresh master if the unit has no drawing yet.
  const switchUnit = useCallback(async (name: string) => {
    setSelectedId(null);
    if (role === 'field') {
      let pub: Project | null = null;
      try { pub = await fetchLatestPublished(name); } catch { /* none yet */ }
      if (pub) seedSeqFromProject(pub); // F8
      setCloudId(null); setCloudVersion(null);
      setProject((p) => pub ?? { ...p, meta: { ...p.meta, rig: name }, nodes: [], pipes: [], edges: [], annotations: [] });
      return;
    }
    let row: { id: string; data: Project; version: number } | null = null;
    try { row = await fetchLatestProject(name); } catch { /* none yet */ }
    if (row) { seedSeqFromProject(row.data); setCloudId(row.id); setCloudVersion(row.version); setProject(row.data); return; } // F8
    // no saved drawing — seed from the unit's saved template, else its built-in
    // master (known rig), else an empty page.
    let tpl: Project | null = null;
    try { tpl = await fetchUnitTemplate(name); } catch { /* none */ }
    if (tpl) seedSeqFromProject(tpl); // F8 — template carries over its own existing ids
    setCloudId(null); setCloudVersion(null);
    setProject((p) => {
      if (tpl) return seedProjectFromTemplate(tpl, name, p);
      const meta = { ...p.meta, rig: name };
      if (RIGS[name]) {
        const d = rigData(name);
        const { nodes, pipes } = d.byRegister ? buildFromRegister(d.register, d.template) : buildMaster(d.template, d.register, d.pipes);
        return { ...p, meta, nodes, pipes, edges: [], annotations: [], status: 'draft', publishedAt: undefined, revision: (p.revision ?? 0) + 1 };
      }
      return { ...p, meta, nodes: [], pipes: [], edges: [], annotations: [], status: 'draft', publishedAt: undefined };
    });
  }, [role, setSelectedId, setCloudId, setCloudVersion, setProject]);

  const addUnit = useCallback(async (name: string) => {
    const n = name.trim(); if (!n) return;
    await cloudAddUnit(n); await refreshUnits();
  }, [refreshUnits]);
  const renameUnit = useCallback(async (oldName: string, newName: string) => {
    const n = newName.trim(); if (!n || n === oldName) return;
    await cloudRenameUnit(oldName, n); await refreshUnits();
    setProject((p) => (p.meta.rig === oldName ? { ...p, meta: { ...p.meta, rig: n } } : p));
  }, [refreshUnits, setProject]);
  const removeUnit = useCallback(async (name: string) => {
    await cloudDeleteUnit(name); await refreshUnits();
  }, [refreshUnits]);

  // Start a brand-new draft for `rig` from its saved template, else its built-in
  // master, else an empty canvas. New draft (cloudId null) so Save creates a row.
  const startFromTemplate = useCallback(async (rig: string) => {
    let tpl: Project | null = null;
    try { tpl = await fetchUnitTemplate(rig); } catch { /* none */ }
    if (tpl) seedSeqFromProject(tpl); // F8 — template carries over its own existing ids
    setSelectedId(null);
    setCloudId(null); setCloudVersion(null);
    setProject((p) => {
      if (tpl) return seedProjectFromTemplate(tpl, rig, p);
      const meta = { ...p.meta, rig };
      if (RIGS[rig]) {
        const d = rigData(rig);
        const { nodes, pipes } = d.byRegister ? buildFromRegister(d.register, d.template) : buildMaster(d.template, d.register, d.pipes);
        return { ...p, meta, nodes, pipes, edges: [], annotations: [], status: 'draft', publishedAt: undefined, revision: (p.revision ?? 0) + 1 };
      }
      return { ...p, meta, nodes: [], pipes: [], edges: [], annotations: [], status: 'draft', publishedAt: undefined };
    });
  }, [setSelectedId, setCloudId, setCloudVersion, setProject]);

  // Admin: save the current diagram as `rig`'s reusable template (RLS-guarded).
  const saveUnitTemplate = useCallback(async (rig?: string) => {
    await cloudSaveUnitTemplate(rig ?? project.meta.rig, project);
    await refreshUnitTemplates();
  }, [project, refreshUnitTemplates]);

  // Saved diagrams (projects) for one unit, most-recent first.
  const listUnitDiagrams = useCallback((rig: string) => listProjectsCloud(rig), []);

  // End users load their rig's latest PUBLISHED final sheet (read-only).
  useEffect(() => {
    if (role !== 'field' || !authEnabled || !authRig) return;
    let active = true;
    fetchLatestPublished(authRig)
      .then((p) => { if (active && p) { setSelectedId(null); setProject(p); } })
      .catch(() => { /* no published sheet yet */ });
    return () => { active = false; };
  }, [role, authRig, authEnabled, setSelectedId, setProject]);

  return {
    units, refreshUnits, switchUnit, addUnit, renameUnit, removeUnit, showUnits, setShowUnits,
    unitTemplates, refreshUnitTemplates, startFromTemplate, saveUnitTemplate, listUnitDiagrams,
  };
}
