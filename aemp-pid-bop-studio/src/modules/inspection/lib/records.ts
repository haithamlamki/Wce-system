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

/**
 * True when two queries would fetch the same page. List views hold their query
 * in state and refetch whenever its identity changes, so a repeated control
 * emission carrying identical values must not be stored — replacing the state
 * with an equal-but-new object would restart the fetch and loop indefinitely.
 */
export function sameQuery(a: ListQuery, b: ListQuery): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ListQuery>;
  for (const k of keys) {
    if (k === 'columnFilters') continue;
    if (a[k] !== b[k]) return false;
  }
  const fa = a.columnFilters ?? {};
  const fb = b.columnFilters ?? {};
  const fkeys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  for (const k of fkeys) if (fa[k] !== fb[k]) return false;
  return true;
}

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
/**
 * Applies every predicate that decides WHICH rows match — and nothing that
 * decides how they are ordered or paged.
 *
 * The rows query and the count query both go through here, so the count can
 * never describe a different result set than the rows it is displayed beside.
 * Ordering and range stay out deliberately: they do not change cardinality, and
 * that is exactly why a count may be reused across paging and sorting.
 *
 * This is a filter, not a security boundary. `insp_records_expanded` is
 * `security_invoker`, so RLS on `insp_records` is applied by Postgres to the
 * calling user on both queries regardless of what is passed here.
 */
function applyScope<T>(query: T, q: ListQuery): T {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let x = query as any;
  if (q.category) x = x.eq('category', q.category);
  if (q.unitId) x = x.eq('unit_id', q.unitId);
  if (q.typeId) x = x.eq('type_id', q.typeId);
  if (q.partId) x = x.eq('part_id', q.partId);
  if (q.workingStatus) x = x.eq('working_status', q.workingStatus);
  if (q.approveStatus) x = x.eq('approve_status', q.approveStatus);
  if (q.approverId) x = x.eq('approver_id', q.approverId);

  const term = safeTerm(q.search ?? '');
  if (term) {
    x = x.or(
      `serial_number.ilike.*${term}*,type_name.ilike.*${term}*,`
      + `part_name.ilike.*${term}*,component_name.ilike.*${term}*,unit_name.ilike.*${term}*`,
    );
  }

  for (const [col, raw] of Object.entries(q.columnFilters ?? {})) {
    const v = safeTerm(raw);
    if (v) x = x.ilike(col, `%${v}%`);
  }
  return x as T;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * The authoritative number of rows matching a scope, counted by Postgres.
 *
 * Kept separate from the rows query because an exact count over this view costs
 * ~1.3 s while a page of rows costs ~235 ms — measured in the browser, not
 * inferred. Paging and sorting reuse the answer (see countKey); filters and
 * search recompute it. `head: true` asks PostgREST for the count alone, with no
 * row payload.
 */
export async function fetchRecordsCount(q: ListQuery): Promise<number> {
  const sb = need();
  const query = applyScope(
    sb.from('insp_records_expanded').select('id', { count: 'exact', head: true }),
    q,
  );
  const { error, count } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Identity of a RESULT SET, for deciding when a cached count is still valid.
 *
 * Includes every row-restricting predicate and the caller's identity. Excludes
 * page, page size and sort order — none of them change how many rows match, and
 * excluding them is the whole point of the cache.
 *
 * `scopeId` is the authenticated user id. A count is a fact about what one user
 * is allowed to see, so a change of user must invalidate it; without this a
 * cached total could outlive the authorization scope it was computed under.
 */
export function countKey(q: ListQuery, scopeId: string): string {
  const filters = Object.entries(q.columnFilters ?? {})
    .filter(([, v]) => v.trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    scopeId,
    q.category ?? null, q.unitId ?? null, q.typeId ?? null, q.partId ?? null,
    q.workingStatus ?? null, q.approveStatus ?? null, q.approverId ?? null,
    (q.search ?? '').trim(),
    filters,
  ]);
}

/** One page of rows. Deliberately does NOT count — see fetchRecordsCount. */
export async function fetchRecordsRows(q: ListQuery): Promise<InspectionRecord[]> {
  const sb = need();
  let query = applyScope(sb.from('insp_records_expanded').select(LIST_COLUMNS), q);
  const sortBy = q.sortBy ?? 'created_at';
  query = query.order(sortBy, { ascending: q.sortAsc ?? false }).order('id');
  const from = (q.page - 1) * q.perPage;
  const { data, error } = await query.range(from, from + q.perPage - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map(mapRow);
}


/**
 * Columns the record DETAIL view renders: everything the list shows plus the
 * fields it deliberately omits. Named explicitly rather than `select *` so a
 * column added to the view later does not silently start arriving here.
 *
 * `company_id` matters for correctness, not just completeness. The edit form
 * prefills from this row and writes every field back on save, so a company_id
 * that never arrives is a company the form cannot show and would otherwise
 * clear. The list has no such risk — it renders `company_name` and never writes
 * — so the id stays out of LIST_COLUMNS.
 *
 * Any field mapRow() reads must appear here; anything missing silently becomes
 * null on a round trip through the form.
 */
export const DETAIL_COLUMNS = [
  LIST_COLUMNS, 'company_id', 'component_description', 'reject_reason',
].join(',');

/** One complete record, including the heavy fields the list omits. */
export async function fetchRecordById(id: string): Promise<InspectionRecord | null> {
  const sb = need();
  const { data, error } = await sb
    .from('insp_records_expanded').select(DETAIL_COLUMNS).eq('id', id).maybeSingle();
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
 * Use fetchRecordsRows + fetchRecordsCount / fetchDashboard /
 * fetchNotificationSummary instead.
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
