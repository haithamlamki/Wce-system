// ============================================================================
//  Shared Documents (reference `/inspection/shared-documents`, migration 0048):
//  document sets uploaded once against one or more rigs and linked to many
//  inspection records. Files live in bucket 'inspection-files' under
//  shared/<setId>/, metadata in insp_document_set_files.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import { CATEGORY_LABELS, type InspCategory } from '../types';

const BUCKET = 'inspection-files';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export interface DocumentSetRow {
  id: string; name: string; description: string | null; createdBy: string | null; created: string;
  rigName: string | null; documentCount: number; linkedRecordCount: number; canManage: boolean;
}
export interface SetDocument { id: string; fileName: string; size: number; category: string | null; storagePath: string }
export interface SetRig { unitId: string; unitName: string; inScope: boolean; linkedRecordCount: number }
export interface DocumentSet {
  id: string; name: string; description: string | null; createdBy: string | null; created: string;
  canManage: boolean; rigs: SetRig[]; documents: SetDocument[]; linkedInspectionIds: string[];
}
export interface RecordSharedSet { id: string; name: string; description: string | null; documents: SetDocument[] }
export interface PickerRecord {
  id: string; serialNumber: string | null; equipmentType: string | null;
  equipmentPart: string | null; equipmentCategory: string | null;
}

// ---- pure helpers (reference detail page) ----------------------------------------
export function formatSize(b: number): string {
  return b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files grouped by category (case-insensitive), named categories A→Z, "No category" last. */
export function groupDocuments(docs: SetDocument[]): { category: string | null; documents: SetDocument[] }[] {
  const by = new Map<string, { category: string | null; documents: SetDocument[] }>();
  for (const d of docs) {
    const cat = d.category?.trim() || null;
    const key = cat?.toLowerCase() ?? '';
    const g = by.get(key) ?? { category: cat, documents: [] };
    g.documents.push(d);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => (a.category === null ? 1 : b.category === null ? -1
    : a.category.localeCompare(b.category)));
}

/** Picker records grouped by equipment category, A→Z. */
export function groupRecords(rows: PickerRecord[]): { category: string; rows: PickerRecord[] }[] {
  const by = new Map<string, PickerRecord[]>();
  for (const r of rows) {
    const k = r.equipmentCategory || 'Uncategorized';
    const g = by.get(k);
    if (g) g.push(r); else by.set(k, [r]);
  }
  return [...by.entries()].map(([category, list]) => ({ category, rows: list }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function filterRecords(rows: PickerRecord[], q: string): PickerRecord[] {
  const n = q.trim().toLowerCase();
  if (!n) return rows;
  return rows.filter((r) => [r.serialNumber, r.equipmentType, r.equipmentPart, r.equipmentCategory]
    .some((v) => (v ?? '').toLowerCase().includes(n)));
}

/** Links to add / remove between the saved and the edited selection. */
export function diffLinks(saved: Iterable<string>, chosen: Iterable<string>): { add: string[]; remove: string[] } {
  const s = new Set(saved); const c = new Set(chosen);
  return { add: [...c].filter((x) => !s.has(x)), remove: [...s].filter((x) => !c.has(x)) };
}

// ---- API ----------------------------------------------------------------------------
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await need().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const listDocumentSets = () => rpc<DocumentSetRow[]>('insp_document_sets_list');
export const fetchDocumentSet = (id: string) => rpc<DocumentSet | null>('insp_document_set_detail', { p_id: id });
export const fetchRecordSharedDocuments = (recordId: string) =>
  rpc<RecordSharedSet[]>('insp_record_shared_documents', { p_record: recordId });
export const updateSetRigs = (id: string, unitIds: string[]) =>
  rpc<{ unlinked: number }>('insp_document_set_update_rigs', { p_id: id, p_unit_ids: unitIds });

/** Distinct file categories already in use — the category combobox options. */
export async function listDocumentCategories(): Promise<string[]> {
  const { data, error } = await need().from('insp_document_set_files').select('category').not('category', 'is', null);
  if (error) throw new Error(error.message);
  const by = new Map<string, string>();
  for (const r of data ?? []) {
    const c = String(r.category).trim();
    if (c && !by.has(c.toLowerCase())) by.set(c.toLowerCase(), c);
  }
  return [...by.values()].sort((a, b) => a.localeCompare(b));
}

export async function addSetFiles(setId: string, category: string | null, files: File[],
  onProgress?: (pct: number) => void): Promise<number> {
  const sb = need();
  let done = 0;
  for (const f of files) {
    const safe = f.name.replace(/[^\w.\-() ]+/g, '_');
    const path = `shared/${setId}/${Date.now()}-${done}-${safe}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, f, { upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { error } = await sb.from('insp_document_set_files').insert({
      set_id: setId, category: category?.trim() || null, storage_path: path, file_name: f.name, file_size: f.size,
    });
    if (error) { await sb.storage.from(BUCKET).remove([path]); throw new Error(error.message); }
    done += 1;
    onProgress?.(Math.round((done / files.length) * 100));
  }
  return done;
}

export async function createDocumentSet(input: {
  unitIds: string[]; name: string; description?: string; category?: string; files: File[];
}, onProgress?: (pct: number) => void): Promise<string> {
  const id = await rpc<string>('insp_document_set_create', {
    p_name: input.name, p_description: input.description ?? null, p_unit_ids: input.unitIds,
  });
  await addSetFiles(id, input.category ?? null, input.files, onProgress);
  return id;
}

export async function deleteDocumentSet(id: string): Promise<void> {
  const sb = need();
  const { data, error: lErr } = await sb.from('insp_document_set_files').select('storage_path').eq('set_id', id);
  if (lErr) throw new Error(lErr.message);
  const paths = (data ?? []).map((r) => String(r.storage_path));
  const { error } = await sb.from('insp_document_sets').delete().eq('id', id);
  if (error) throw new Error(error.message);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths); // rows are gone; objects follow
}

export async function linkRecords(setId: string, recordIds: string[]): Promise<void> {
  if (!recordIds.length) return;
  const { error } = await need().from('insp_document_set_links')
    .insert(recordIds.map((record_id) => ({ set_id: setId, record_id })));
  if (error) throw new Error(error.message);
}

export async function unlinkRecord(setId: string, recordId: string): Promise<void> {
  const { error } = await need().from('insp_document_set_links').delete().eq('set_id', setId).eq('record_id', recordId);
  if (error) throw new Error(error.message);
}

/** Every record on one rig, for the link picker (reference caps at 2,000). */
export async function fetchRigRecords(unitId: string, cap = 2000): Promise<PickerRecord[]> {
  const { data, error } = await need().from('insp_records_expanded')
    .select('id,serial_number,type_name,part_name,category').eq('unit_id', unitId)
    .order('serial_number').limit(cap);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id), serialNumber: (r.serial_number as string) || null,
    equipmentType: (r.type_name as string) || null, equipmentPart: (r.part_name as string) || null,
    equipmentCategory: r.category ? CATEGORY_LABELS[r.category as InspCategory] ?? String(r.category) : null,
  }));
}

export async function downloadSetFile(doc: SetDocument): Promise<void> {
  const { data, error } = await need().storage.from(BUCKET).download(doc.storagePath);
  if (error) throw new Error(error.message);
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = doc.fileName;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
