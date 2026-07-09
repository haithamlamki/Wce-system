// ============================================================================
//  Tubular data access — catalog + unit records + batch save. All reads go
//  through RLS; the only write path is the submit_tubular_entry RPC (0016).
//  Errors are surfaced to the caller (no silent failure, no local fallback —
//  this module is cloud-backed by design).
// ============================================================================
import { supabase } from '../../../lib/supabase';

export type TubularCategory = 'drill_pipe' | 'hwdp' | 'drill_collar' | 'pup_joint';

export const CATEGORY_LABEL: Record<TubularCategory, string> = {
  drill_pipe: 'DRILL PIPE',
  hwdp: 'HWDP',
  drill_collar: 'DRILL COLLAR',
  pup_joint: 'PUP JOINT',
};

export const CATEGORY_ORDER: TubularCategory[] = ['drill_pipe', 'hwdp', 'drill_collar', 'pup_joint'];

export interface CatalogItem {
  id: string;
  category: TubularCategory;
  description: string;
  position: number;
  active: boolean;
}

export interface TubularRecordRow {
  id: string;
  unitId: string;
  catalogItemId: string;
  position: number;
  onContract: number;
  premium: number;
  class2: number;
  class3: number;
  scrap: number;
  needsInspection: number;
  damagedOnLocation: number;
  sendToRepair: number;
  toOtherRig: number;
  receiveFromRig: number;
  onBoardOverride: number | null;
  onBoard: number;
  contractDelta: number;
  rentalDate: string | null;
  remarks: string | null;
  archived: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface EntryLineInput {
  id: string | null;
  catalog_item_id: string;
  position: number;
  on_contract: number;
  premium: number;
  class2: number;
  class3: number;
  scrap: number;
  needs_inspection: number;
  damaged_on_location: number;
  send_to_repair: number;
  to_other_rig: number;
  receive_from_rig: number;
  rental_date: string | null;
  remarks: string | null;
}

export interface SubmissionInfo {
  id: string;
  submittedAt: string;
  submittedBy: string;
  entryDate: string | null;
  source: string;
}

function need() {
  if (!supabase) throw new Error('Cloud is not configured');
  return supabase;
}

export async function fetchCatalog(): Promise<CatalogItem[]> {
  const { data, error } = await need()
    .from('tubular_catalog')
    .select('id, category, description, position, active')
    .order('position');
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogItem[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRecord(r: any): TubularRecordRow {
  return {
    id: r.id, unitId: r.unit_id, catalogItemId: r.catalog_item_id, position: r.position,
    onContract: r.on_contract, premium: r.premium, class2: r.class2, class3: r.class3,
    scrap: r.scrap, needsInspection: r.needs_inspection,
    damagedOnLocation: r.damaged_on_location, sendToRepair: r.send_to_repair,
    toOtherRig: r.to_other_rig, receiveFromRig: r.receive_from_rig,
    onBoardOverride: r.on_board_override, onBoard: r.on_board, contractDelta: r.contract_delta,
    rentalDate: r.rental_date, remarks: r.remarks, archived: r.archived,
    updatedAt: r.updated_at, updatedBy: r.updated_by,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const RECORD_COLS =
  'id, unit_id, catalog_item_id, position, on_contract, premium, class2, class3, scrap, ' +
  'needs_inspection, damaged_on_location, send_to_repair, to_other_rig, receive_from_rig, ' +
  'on_board_override, on_board, contract_delta, rental_date, remarks, archived, updated_at, updated_by';

export async function fetchUnitRecords(unitId: string): Promise<TubularRecordRow[]> {
  const { data, error } = await need()
    .from('tubular_records')
    .select(RECORD_COLS)
    .eq('unit_id', unitId)
    .eq('archived', false)
    .order('position');
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRecord);
}

/** All records visible to the caller (RLS-scoped) for Fleet Inventory. */
export async function fetchVisibleRecords(): Promise<TubularRecordRow[]> {
  const { data, error } = await need()
    .from('tubular_records')
    .select(RECORD_COLS)
    .eq('archived', false)
    .order('unit_id')
    .order('position');
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRecord);
}

export async function fetchLastSubmission(unitId: string): Promise<SubmissionInfo | null> {
  const { data, error } = await need()
    .from('tubular_submissions')
    .select('id, submitted_at, submitted_by, entry_date, source')
    .eq('unit_id', unitId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id, submittedAt: data.submitted_at, submittedBy: data.submitted_by,
    entryDate: data.entry_date, source: data.source,
  };
}

export async function submitEntry(args: {
  unitId: string;
  entryDate: string;
  lines: EntryLineInput[];
  archiveIds: string[];
  note?: string;
}): Promise<{ submissionId: string; recordIds: string[] }> {
  const { data, error } = await need().rpc('submit_tubular_entry', {
    p_unit_id: args.unitId,
    p_entry_date: args.entryDate,
    p_lines: args.lines,
    p_archive_ids: args.archiveIds.length ? args.archiveIds : null,
    p_note: args.note ?? null,
  });
  if (error) throw new Error(error.message);
  const res = data as { submission_id: string; record_ids: string[] };
  return { submissionId: res.submission_id, recordIds: res.record_ids };
}
