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

export interface EquipmentInput {
  tag: string | null;
  type: string | null;
  section: string | null;
  description: string | null;
  rwp: string | null;
  size: string | null;
  manufacturer: string | null;
  serial: string | null;
  int_last: string | null;
  int_due: string | null;
  maj_last: string | null;
  maj_due: string | null;
}

/**
 * Replace the shared equipment register for one rig (admin-only, FR-36/37).
 * Deletes the rig's existing rows then inserts the new set in chunks. RLS
 * rejects this for non-admins. Returns the number of rows written.
 */
export async function replaceRigEquipment(rig: string, rows: EquipmentInput[]): Promise<number> {
  if (!supabase) throw new Error('Cloud not configured');
  const del = await supabase.from('equipment').delete().eq('rig_name', rig);
  if (del.error) throw new Error(del.error.message);
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({ ...r, rig_name: rig }));
    const { error } = await supabase.from('equipment').insert(chunk);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export interface ComplianceRow {
  rig_name: string;
  section: string;
  tag: string;
  int_due: string;
  maj_due: string;
}

export interface LeaderRow {
  id: string;
  full_name: string;
  points: number;
  rig: string | null;
}

/** Write the caller's current steward points to their profile (FR-54). */
export async function upsertMyScore(points: number): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase.from('profiles').update({ points }).eq('id', data.user.id);
  if (error) throw new Error(error.message);
}

/** Fetch the crew leaderboard, ranked by points (FR-54). Uses a SECURITY
 *  DEFINER RPC that exposes only name/points/rig (not email/role). */
export async function fetchLeaderboard(): Promise<LeaderRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('leaderboard');
  if (error) throw new Error(error.message);
  return ((data as LeaderRow[]) ?? []).map((r) => ({ id: r.id, full_name: r.full_name || '—', points: r.points ?? 0, rig: r.rig ?? null }));
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
