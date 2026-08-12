// ============================================================================
//  Inspection data access — catalog + records + RPCs. Reads go through RLS
//  (insp_records_expanded view); writes go through RLS-guarded inserts or the
//  SECURITY DEFINER RPCs from 0030. Cloud-only by design (like tubular).
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type {
  Company, EquipmentPart, EquipmentType, InspCategory, InspUnit,
  InspectionRecord, PartComponent, WorkingStatus,
} from '../types';

function need() {
  if (!supabase) throw new Error('Cloud not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return supabase;
}

export function mapRow(row: Record<string, unknown>): InspectionRecord {
  const s = (k: string) => (row[k] ?? '') as string;
  const n = (k: string) => (row[k] === null || row[k] === undefined ? null : Number(row[k]));
  return {
    id: s('id'), typeId: s('type_id'),
    partId: (row.part_id as string) ?? null, componentId: (row.component_id as string) ?? null,
    unitId: s('unit_id'), companyId: (row.company_id as string) ?? null,
    componentDescription: s('component_description'), oem: s('oem'),
    inspectionCompany: s('inspection_company'), serialNumber: s('serial_number'),
    partNumber: s('part_number'), workingStatus: s('working_status') as WorkingStatus,
    manufactureYear: n('manufacture_year'),
    intermediateDate: (row.intermediate_date as string) ?? null,
    intermediateFreqMonths: n('intermediate_freq_months'),
    intermediateDueDate: (row.intermediate_due_date as string) ?? null,
    majorDate: (row.major_date as string) ?? null,
    majorFreqMonths: n('major_freq_months'),
    majorDueDate: (row.major_due_date as string) ?? null,
    remarks: s('remarks'), specs: (row.specs as Record<string, string>) ?? {},
    approveStatus: s('approve_status') as InspectionRecord['approveStatus'],
    approverId: (row.approver_id as string) ?? null,
    rejectReason: (row.reject_reason as string) ?? null,
    category: s('category') as InspCategory, typeName: s('type_name'),
    specFields: (row.spec_fields as string[]) ?? [],
    partName: (row.part_name as string) ?? null,
    componentName: (row.component_name as string) ?? null,
    unitName: s('unit_name'), companyName: (row.company_name as string) ?? null,
  };
}

export async function fetchCatalog() {
  const sb = need();
  const [types, parts, components, units, companies] = await Promise.all([
    sb.from('insp_equipment_types').select('*').order('name'),
    sb.from('insp_equipment_parts').select('*').order('position'),
    sb.from('insp_part_components').select('*').order('position'),
    sb.from('units').select('id,name,unit_type').order('name'),
    sb.from('insp_companies').select('id,name').order('name'),
  ]);
  for (const r of [types, parts, components, units, companies]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    types: (types.data ?? []).map((t): EquipmentType => ({
      id: t.id, category: t.category, name: t.name, description: t.description,
      specFields: (t.spec_fields as string[]) ?? [], active: t.active,
    })),
    parts: (parts.data ?? []).map((p): EquipmentPart => ({
      id: p.id, typeId: p.type_id, name: p.name, description: p.description, position: p.position,
    })),
    components: (components.data ?? []).map((c): PartComponent => ({
      id: c.id, partId: c.part_id, name: c.name, description: c.description, position: c.position,
    })),
    units: (units.data ?? []).map((u): InspUnit => ({ id: u.id, name: u.name, unitType: u.unit_type })),
    companies: (companies.data ?? []) as Company[],
  };
}

/** Approver choices = privileged profiles; display name falls back gracefully. */
export async function fetchApprovers(): Promise<{ id: string; name: string }[]> {
  const sb = need();
  const { data, error } = await sb.from('profiles').select('*').in('role', ['admin', 'manager']);
  if (error) throw new Error(error.message);
  type P = Record<string, unknown>;
  return (data ?? []).map((p: P) => ({
    id: String(p.id ?? p.user_id),
    name: String(p.full_name ?? p.display_name ?? p.name ?? p.email ?? p.id),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchRecords(opts: {
  category?: InspCategory; typeId?: string; unitId?: string;
} = {}): Promise<InspectionRecord[]> {
  const sb = need();
  let q = sb.from('insp_records_expanded').select('*');
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.typeId) q = q.eq('type_id', opts.typeId);
  if (opts.unitId) q = q.eq('unit_id', opts.unitId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export interface RecordDraft {
  type_id: string; part_id?: string | null; component_id?: string | null;
  unit_id: string; company_id?: string | null; component_description?: string;
  oem?: string; inspection_company?: string; serial_number?: string; part_number?: string;
  working_status?: WorkingStatus; manufacture_year?: number | null;
  intermediate_date?: string | null; intermediate_freq_months?: number | null;
  major_date?: string | null; major_freq_months?: number | null;
  remarks?: string; specs?: Record<string, string>; approver_id?: string | null;
}

export type ImportRow = RecordDraft;

export async function insertRecord(draft: RecordDraft): Promise<string> {
  const sb = need();
  const { data, error } = await sb.from('insp_records').insert(draft).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateRecord(id: string, patch: Partial<RecordDraft>): Promise<void> {
  const sb = need();
  const { error } = await sb.from('insp_records').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function bulkUpdateDates(ids: string[], major: string | null, intermediate: string | null): Promise<number> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_bulk_update_dates',
    { p_ids: ids, p_major: major, p_intermediate: intermediate });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function setApproval(ids: string[], approve: boolean, reason?: string): Promise<number> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_set_approval',
    { p_ids: ids, p_approve: approve, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function importRecords(rows: ImportRow[]): Promise<number> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_import_records', { p_rows: rows });
  if (error) throw new Error(error.message);
  return data as number;
}
