// ============================================================================
//  Cloud persistence + equipment read via Supabase (PRD FR-36/37/59).
//  Projects are stored as JSONB documents; equipment is the AEMP-equivalent
//  WCE register. All functions no-op / return empty when Supabase is not
//  configured, so the app still works offline against localStorage + cache.
// ============================================================================
import { isSupabaseConfigured, supabase } from './supabase';
import type { AempAsset, Project } from '../types';

export interface ProjectSummary {
  id: string;
  rig_name: string;
  reference_date: string | null;
  updated_at: string;
}

const d = (v: string | null) => v ?? '';

/** Upsert the current project; returns the row id (or null if cloud is off). */
export async function saveProjectCloud(project: Project, id?: string): Promise<string | null> {
  if (!supabase) return null;
  const row = {
    ...(id ? { id } : {}),
    rig_name: project.meta.rig,
    reference_date: project.meta.date || null,
    inspector: project.meta.who || null,
    revision: project.revision ?? 0,
    data: project,
  };
  const { data, error } = await supabase.from('projects').upsert(row).select('id').single();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/** List saved projects (most-recent first). */
export async function listProjectsCloud(): Promise<ProjectSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('id, rig_name, reference_date, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ProjectSummary[]) ?? [];
}

/** Load a saved project document by id. */
export async function loadProjectCloud(id: string): Promise<Project | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('projects').select('data').eq('id', id).single();
  if (error) throw new Error(error.message);
  return (data?.data as Project) ?? null;
}

/** Fetch the AEMP-equivalent equipment register from Supabase (FR-36). */
export async function fetchEquipmentCloud(rig?: string): Promise<AempAsset[]> {
  if (!supabase) return [];
  let q = supabase
    .from('equipment')
    .select('type, section, description, tag, rwp, size, manufacturer, serial, int_last, int_due, maj_last, maj_due');
  if (rig) q = q.eq('rig_name', rig);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r): AempAsset => ({
    type: d(r.type), section: d(r.section), description: d(r.description), tag: d(r.tag),
    rwp: d(r.rwp), size: d(r.size), manufacturer: d(r.manufacturer), serial: d(r.serial),
    int_last: d(r.int_last), int_due: d(r.int_due), maj_last: d(r.maj_last), maj_due: d(r.maj_due),
  }));
}

export interface ComplianceRow {
  rig_name: string;
  section: string;
  tag: string;
  int_due: string;
  maj_due: string;
}

/** Pull minimal equipment rows across all rigs the caller can see (FR §13). */
export async function fetchComplianceRows(): Promise<ComplianceRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('equipment').select('rig_name, section, tag, int_due, maj_due');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    rig_name: d(r.rig_name) || '—',
    section: d(r.section) || '—',
    tag: d(r.tag),
    int_due: d(r.int_due),
    maj_due: d(r.maj_due),
  }));
}

export { isSupabaseConfigured };
