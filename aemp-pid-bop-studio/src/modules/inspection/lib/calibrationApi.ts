// ============================================================================
//  Calibration Register — data access (tables from migration 0042). RLS scopes
//  every read/write to the user's units; this file only maps rows.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import {
  defaultDueDate, planRegisterImport, type CalInstrument, type CalRegister, type ImportPlan,
  type InstrumentField, type ParsedInstrument, type TmmdMapping,
} from './calibration';

const BUCKET = 'calibration-certificates';
const PAGE = 1000;

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

const COLS: Record<InstrumentField, string> = {
  sequenceNo: 'sequence_no', certificateNo: 'certificate_no', instrument: 'instrument', tmmd: 'tmmd',
  manufacturer: 'manufacturer', model: 'model', serialNumber: 'serial_number', range: 'measurement_range',
  location: 'location', grade: 'grade', acceptanceCriteria: 'acceptance_criteria',
  lastCalibration: 'last_calibration', dueDate: 'due_date', certifyingCompany: 'certifying_company',
  remarks: 'remarks',
};

const NULLABLE = new Set<InstrumentField>(['sequenceNo', 'tmmd', 'lastCalibration', 'dueDate']);

function mapRegister(r: Record<string, unknown>): CalRegister {
  return {
    id: r.id as string, unitId: r.unit_id as string, unitName: (r.unit_name as string) ?? '',
    title: r.title as string, registerDate: (r.register_date as string) ?? null,
    qualificationCode: (r.qualification_code as string) ?? '', revisionNo: (r.revision_no as string) ?? '',
    instrumentCount: Number(r.instrument_count ?? 0), overdueCount: Number(r.overdue_count ?? 0),
    dueSoonCount: Number(r.due_soon_count ?? 0),
  };
}

function mapInstrument(r: Record<string, unknown>): CalInstrument {
  const out: Record<string, unknown> = { id: r.id, registerId: r.register_id,
    certFilePath: r.cert_file_path ?? null, certFileName: r.cert_file_name ?? null };
  for (const [f, c] of Object.entries(COLS) as [InstrumentField, string][]) {
    out[f] = r[c] ?? (NULLABLE.has(f) ? null : '');
  }
  return out as unknown as CalInstrument;
}

/** Row for insert/update; `only` limits it to the columns an upload actually had. */
function toRow(i: Partial<ParsedInstrument>, only?: Set<InstrumentField>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [f, c] of Object.entries(COLS) as [InstrumentField, string][]) {
    if (!(f in i) || (only && !only.has(f))) continue;
    const v = i[f];
    row[c] = v === '' && NULLABLE.has(f) ? null : v;
  }
  return row;
}

export async function fetchRegisters(): Promise<CalRegister[]> {
  const { data, error } = await need().from('insp_cal_register_summary').select('*').order('unit_name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRegister);
}

export async function fetchRegister(id: string): Promise<CalRegister> {
  const { data, error } = await need().from('insp_cal_register_summary').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return mapRegister(data);
}

export async function saveRegister(r: Pick<CalRegister, 'unitId' | 'title' | 'registerDate'
  | 'qualificationCode' | 'revisionNo'> & { id?: string }): Promise<string> {
  const row = { unit_id: r.unitId, title: r.title, register_date: r.registerDate || null,
    qualification_code: r.qualificationCode, revision_no: r.revisionNo };
  const q = r.id
    ? need().from('insp_cal_registers').update(row).eq('id', r.id).select('id').single()
    : need().from('insp_cal_registers').insert(row).select('id').single();
  const { data, error } = await q;
  if (error) throw new Error(/insp_cal_registers_unit_id_key/.test(error.message)
    ? 'That rig already has a register.' : error.message);
  return data.id as string;
}

export async function deleteRegister(id: string): Promise<void> {
  const sb = need();
  const { data } = await sb.from('insp_cal_instruments').select('cert_file_path').eq('register_id', id)
    .not('cert_file_path', 'is', null);
  const { error } = await sb.from('insp_cal_registers').delete().eq('id', id);
  if (error) throw new Error(error.message);
  const paths = (data ?? []).map((d) => d.cert_file_path as string);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}

export async function fetchInstruments(registerId: string): Promise<CalInstrument[]> {
  const out: CalInstrument[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await need().from('insp_cal_instruments').select('*')
      .eq('register_id', registerId).order('sequence_no', { nullsFirst: false }).order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map(mapInstrument));
    if (!data || data.length < PAGE) return out;
  }
}

/** Earliest due date still in the past across the user's registers (worst lateness), or null. */
export async function fetchOldestOverdue(todayIso: string): Promise<string | null> {
  const { data, error } = await need().from('insp_cal_instruments').select('due_date')
    .lt('due_date', todayIso).order('due_date').limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0]?.due_date as string | undefined) ?? null;
}

export async function fetchTmmdMap(title: string): Promise<TmmdMapping[]> {
  const { data, error } = await need().from('insp_cal_tmmd_map').select('instrument,tmmd').eq('title', title);
  if (error) throw new Error(error.message);
  return (data ?? []) as TmmdMapping[];
}

const identityError = (m: string) => (/insp_cal_instruments_identity/.test(m)
  ? 'An instrument with this certificate and serial number is already in the register.' : m);

/** Insert or update one row; the due date fills in when left blank. */
export async function saveInstrument(registerId: string, i: CalInstrument, isNew: boolean): Promise<CalInstrument> {
  const row = toRow({ ...i, dueDate: i.dueDate || defaultDueDate(i.lastCalibration) });
  const q = isNew
    ? need().from('insp_cal_instruments').insert({ ...row, register_id: registerId }).select('*').single()
    : need().from('insp_cal_instruments').update(row).eq('id', i.id).select('*').single();
  const { data, error } = await q;
  if (error) throw new Error(identityError(error.message));
  return mapInstrument(data);
}

export async function deleteInstrument(i: CalInstrument): Promise<void> {
  const sb = need();
  const { error } = await sb.from('insp_cal_instruments').delete().eq('id', i.id);
  if (error) throw new Error(error.message);
  if (i.certFilePath) await sb.storage.from(BUCKET).remove([i.certFilePath]);
}

export async function applyRenumber(changes: { id: string; sequenceNo: number }[]): Promise<void> {
  for (const c of changes) {
    const { error } = await need().from('insp_cal_instruments').update({ sequence_no: c.sequenceNo }).eq('id', c.id);
    if (error) throw new Error(error.message);
  }
}

export function previewImport(parsed: ParsedInstrument[], existing: CalInstrument[]): ImportPlan {
  return planRegisterImport(parsed, existing);
}

/** Apply a planned upload: updates touch only the sheet's columns; nothing is deleted. */
export async function applyImport(registerId: string, plan: ImportPlan, present: Set<InstrumentField>,
  onProgress?: (msg: string) => void): Promise<void> {
  const sb = need();
  const BATCH = 200;
  for (let k = 0; k < plan.inserts.length; k += BATCH) {
    const rows = plan.inserts.slice(k, k + BATCH).map((p) => ({ ...toRow(p), register_id: registerId }));
    const { error } = await sb.from('insp_cal_instruments').insert(rows);
    if (error) throw new Error(identityError(error.message));
    onProgress?.(`Added ${Math.min(k + BATCH, plan.inserts.length)} / ${plan.inserts.length}…`);
  }
  for (let k = 0; k < plan.updates.length; k++) {
    const u = plan.updates[k];
    const { error } = await sb.from('insp_cal_instruments').update(toRow(u, present)).eq('id', u.id);
    if (error) throw new Error(identityError(error.message));
    if (k % 25 === 24) onProgress?.(`Updated ${k + 1} / ${plan.updates.length}…`);
  }
}

// ---- certificate (one file per instrument) ----------------------------------------

export async function uploadCertificate(i: CalInstrument, file: File): Promise<CalInstrument> {
  const sb = need();
  const safe = file.name.replace(/[^\w.\-() ]+/g, '_');
  const path = `${i.registerId}/${i.id}/${Date.now()}-${safe}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await sb.from('insp_cal_instruments')
    .update({ cert_file_path: path, cert_file_name: file.name }).eq('id', i.id).select('*').single();
  if (error) { await sb.storage.from(BUCKET).remove([path]); throw new Error(error.message); }
  if (i.certFilePath) await sb.storage.from(BUCKET).remove([i.certFilePath]); // replaced
  return mapInstrument(data);
}

/** Take the certificate off the instrument without deleting the instrument. */
export async function detachCertificate(i: CalInstrument): Promise<CalInstrument> {
  const sb = need();
  const { data, error } = await sb.from('insp_cal_instruments')
    .update({ cert_file_path: null, cert_file_name: null }).eq('id', i.id).select('*').single();
  if (error) throw new Error(error.message);
  if (i.certFilePath) await sb.storage.from(BUCKET).remove([i.certFilePath]);
  return mapInstrument(data);
}

export async function certificateUrl(path: string, download = false): Promise<string> {
  const { data, error } = await need().storage.from(BUCKET)
    .createSignedUrl(path, 600, download ? { download: true } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
