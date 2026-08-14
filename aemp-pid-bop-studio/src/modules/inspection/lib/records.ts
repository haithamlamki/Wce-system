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
    createdAt: (row.created_at as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    approvedAt: (row.approved_at as string) ?? null,
    approvedBy: (row.approved_by as string) ?? null,
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

/** Approver choices via SECURITY DEFINER RPC — works for non-privileged
 *  submitters too (profiles RLS only exposes their own row). */
export async function fetchApprovers(): Promise<{ id: string; name: string }[]> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_approver_choices');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

/**
 * Columns the dashboard aggregates over. Selecting these instead of `*` keeps
 * the jsonb `specs` and `spec_fields` payloads out of a 6k-row scan, which is
 * the difference between a snappy dashboard and a ~25s one.
 */
export const DASHBOARD_COLUMNS = [
  'id', 'unit_id', 'unit_name', 'company_name', 'category', 'type_name',
  'serial_number', 'oem', 'working_status', 'manufacture_year',
  'intermediate_date', 'intermediate_freq_months', 'intermediate_due_date',
  'major_date', 'major_freq_months', 'major_due_date',
  'approve_status', 'approver_id', 'approved_at', 'approved_by',
  'created_at', 'created_by',
].join(',');

/**
 * Columns the record TABLE renders — a projection, not `select *`.
 *
 * `specs` and `spec_fields` ARE included: they cost ~101 kB across all 6,426
 * rows but only ~160 bytes for a page of ten, and the Specifications columns
 * need them. What made them expensive was fetching every row, not the columns
 * themselves. `component_description` and `reject_reason` stay out — they are
 * detail-only and fetchRecordById supplies them.
 */
export const LIST_COLUMNS = [
  'specs', 'spec_fields',
  'id', 'unit_id', 'unit_name', 'company_name', 'category', 'type_id', 'type_name',
  'part_id', 'part_name', 'component_id', 'component_name',
  'serial_number', 'part_number', 'oem', 'inspection_company',
  'working_status', 'manufacture_year', 'remarks',
  'intermediate_date', 'intermediate_freq_months', 'intermediate_due_date',
  'major_date', 'major_freq_months', 'major_due_date',
  'approve_status', 'approver_id', 'approved_at', 'approved_by',
  'created_at', 'created_by',
].join(',');

export interface ListQuery {
  page: number;              // 1-based
  perPage: number;
  category?: InspCategory | '';
  unitId?: string;
  typeId?: string;
  partId?: string;
  workingStatus?: WorkingStatus | '';
  approveStatus?: InspectionRecord['approveStatus'] | '';
  /** Scopes the approval queue to one approver (non-privileged users). */
  approverId?: string | null;
  /** Free-text across serial, equipment, part and component. */
  search?: string;
  sortBy?: string;
  sortAsc?: boolean;
  /** Per-column filters, keyed by list column name. */
  columnFilters?: Record<string, string>;
}

export interface Page<T> { rows: T[]; total: number }

/** Escapes PostgREST `or=` reserved characters in a user-supplied term. */
function safeTerm(s: string): string {
  return s.replace(/[(),*"\\]/g, ' ').trim();
}

/**
 * ONE page of records, filtered, sorted and counted BY THE DATABASE.
 *
 * RLS still applies: this reads insp_records_expanded (security_invoker), so a
 * user can only page through rows they are already permitted to read, and the
 * count reflects only those rows.
 */
export async function fetchRecordsPage(q: ListQuery): Promise<Page<InspectionRecord>> {
  const sb = need();
  let query = sb
    .from('insp_records_expanded')
    .select(LIST_COLUMNS, { count: 'exact' });

  if (q.category) query = query.eq('category', q.category);
  if (q.unitId) query = query.eq('unit_id', q.unitId);
  if (q.typeId) query = query.eq('type_id', q.typeId);
  if (q.partId) query = query.eq('part_id', q.partId);
  if (q.workingStatus) query = query.eq('working_status', q.workingStatus);
  if (q.approveStatus) query = query.eq('approve_status', q.approveStatus);
  if (q.approverId) query = query.eq('approver_id', q.approverId);

  const term = safeTerm(q.search ?? '');
  if (term) {
    query = query.or(
      `serial_number.ilike.*${term}*,type_name.ilike.*${term}*,`
      + `part_name.ilike.*${term}*,component_name.ilike.*${term}*,unit_name.ilike.*${term}*`,
    );
  }

  for (const [col, raw] of Object.entries(q.columnFilters ?? {})) {
    const v = safeTerm(raw);
    if (v) query = query.ilike(col, `%${v}%`);
  }

  const sortBy = q.sortBy ?? 'created_at';
  query = query.order(sortBy, { ascending: q.sortAsc ?? false }).order('id');

  const from = (q.page - 1) * q.perPage;
  const { data, error, count } = await query.range(from, from + q.perPage - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { rows: rows.map(mapRow), total: count ?? 0 };
}

/** The approval queue: filtered in the database, never in the browser. */
export async function fetchApprovalQueue(
  q: Omit<ListQuery, 'approveStatus'> & { approverId?: string | null },
): Promise<Page<InspectionRecord>> {
  const base = await fetchRecordsPage({ ...q, approveStatus: 'pending_approval' });
  return base;
}

/** One complete record, including the heavy fields the list omits. */
export async function fetchRecordById(id: string): Promise<InspectionRecord | null> {
  const sb = need();
  const { data, error } = await sb
    .from('insp_records_expanded').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as unknown as Record<string, unknown>) : null;
}

/** Dashboard metrics, aggregated by Postgres (see migration 0036). */
export async function fetchDashboard(): Promise<Record<string, unknown>> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_dashboard');
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

/** Notification counts plus only the alerts the bell displays (migration 0036). */
export async function fetchNotificationSummary(): Promise<Record<string, unknown>> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_notification_summary');
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

/**
 * EVERY record the caller may read, paged through 1000 at a time.
 *
 * This is the EXPORT path and must not be used for page loading — it is what
 * made the dashboard, record list and approval queue each transfer ~1.8 MB.
 * Use fetchRecordsPage / fetchDashboard / fetchNotificationSummary instead.
 */
export async function fetchRecords(opts: {
  category?: InspCategory; typeId?: string; unitId?: string; columns?: string;
} = {}): Promise<InspectionRecord[]> {
  const sb = need();
  // Paginate: PostgREST caps every response at 1000 rows server-side, so a
  // plain .limit(10000) silently truncates once real data volumes arrive.
  const PAGE = 1000;
  const out: InspectionRecord[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('insp_records_expanded').select(opts.columns ?? '*');
    if (opts.category) q = q.eq('category', opts.category);
    if (opts.typeId) q = q.eq('type_id', opts.typeId);
    if (opts.unitId) q = q.eq('unit_id', opts.unitId);
    const { data, error } = await q
      .order('created_at', { ascending: false }).order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    // A runtime column list defeats supabase-js's select-string inference, so
    // the rows come back untyped and are narrowed by mapRow instead.
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows.map(mapRow));
    if (rows.length < PAGE) break;
  }
  return out;
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

/** Maps the 0032 unique-index violation to the source system's wording. */
function friendly(error: { code?: string; message: string }, draft?: Partial<RecordDraft>): Error {
  if (error.code === '23505' && error.message.includes('insp_records_unit_serial_key')) {
    return new Error(`A record with Serial Number "${draft?.serial_number ?? ''}" already exists for this Unit.`);
  }
  return new Error(error.message);
}

export async function insertRecord(draft: RecordDraft): Promise<string> {
  const sb = need();
  const { data, error } = await sb.from('insp_records').insert(draft).select('id').single();
  if (error) throw friendly(error, draft);
  return data.id;
}

export async function updateRecord(id: string, patch: Partial<RecordDraft>): Promise<void> {
  const sb = need();
  const { error } = await sb.from('insp_records').update(patch).eq('id', id);
  if (error) throw friendly(error, patch);
}

export async function deleteRecord(id: string): Promise<void> {
  const sb = need();
  const { error } = await sb.from('insp_records').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface InspRecordLog {
  id: number;
  action: 'created' | 'updated' | 'deleted';
  actor: string | null;
  changes: Record<string, [unknown, unknown]>;
  createdAt: string;
}

/** Field-level history for one record (0032 trigger), newest first. */
export async function fetchRecordLogs(recordId: string): Promise<InspRecordLog[]> {
  const sb = need();
  const { data, error } = await sb.from('insp_record_logs')
    .select('*').eq('record_id', recordId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    action: r.action as InspRecordLog['action'],
    actor: (r.actor as string) ?? null,
    changes: (r.changes as Record<string, [unknown, unknown]>) ?? {},
    createdAt: String(r.created_at),
  }));
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
