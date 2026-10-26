// ============================================================================
//  Calibration Register (TMMDE) — pure model: one register per rig listing its
//  calibrated instruments (reference `/calibration`). An instrument is
//  identified by certificate + serial together (one certificate covers several
//  instruments; a serial can sit under two certificates). Workbook parse/build
//  mirror the source's "Callibration Log" sheet so an export uploads straight
//  back. Data access lives in calibrationApi.ts.
// ============================================================================
import * as XLSX from 'xlsx';
import { parseDate } from './certificate/normalize';

export const TMMD_VALUES = ['Testing', 'Measuring', 'Monitoring', 'Detecting'] as const;
export type Tmmd = (typeof TMMD_VALUES)[number];

export const REGISTER_TITLES = [
  'Mechanical TMMDE calibration Register',
  'Electrical TMMDE calibration Register',
  'Workshop TMMDE calibration Register',
  'Operations TMMDE calibration Register',
] as const;

export interface CalRegister {
  id: string; unitId: string; unitName: string; title: string; registerDate: string | null;
  qualificationCode: string; revisionNo: string;
  instrumentCount: number; overdueCount: number; dueSoonCount: number;
}

export interface CalInstrument {
  id: string; registerId: string; sequenceNo: number | null; certificateNo: string;
  instrument: string; tmmd: Tmmd | null; manufacturer: string; model: string;
  serialNumber: string; range: string; location: string; grade: string;
  acceptanceCriteria: string; lastCalibration: string | null; dueDate: string | null;
  certifyingCompany: string; remarks: string;
  certFilePath: string | null; certFileName: string | null;
}

export type InstrumentField = Exclude<keyof CalInstrument, 'id' | 'registerId' | 'certFilePath' | 'certFileName'>;

/** Columns in the register sheet's left-to-right order, with its headings. */
export const CAL_COLUMNS: { field: InstrumentField; label: string; header: string; date?: boolean }[] = [
  { field: 'sequenceNo', label: 'S.N', header: 'S.N' },
  { field: 'certificateNo', label: 'Certificate', header: 'Certificate' },
  { field: 'instrument', label: 'Instrument', header: 'Description of Instrument' },
  { field: 'tmmd', label: 'TMMD', header: 'T/M/M/D' },
  { field: 'manufacturer', label: 'Manufacturer', header: 'Manufacturer' },
  { field: 'model', label: 'Model', header: 'Model' },
  { field: 'serialNumber', label: 'Serial no.', header: 'Serial No' },
  { field: 'range', label: 'Range', header: 'Rangs (psi/bar/kpa)' },
  { field: 'location', label: 'Location', header: 'Location of Use/Store' },
  { field: 'grade', label: 'Grade', header: 'Grade' },
  { field: 'acceptanceCriteria', label: 'Acceptance', header: 'Acceptance Criteria' },
  { field: 'lastCalibration', label: 'Last calibration', header: 'Date of Last Calibration', date: true },
  { field: 'dueDate', label: 'Due', header: 'Calibration Due Date', date: true },
  { field: 'certifyingCompany', label: 'Certifying company', header: 'Certifying company' },
  { field: 'remarks', label: 'Remarks', header: 'Remarks' },
];

export const REQUIRED_FIELDS: InstrumentField[] = ['instrument', 'serialNumber', 'certificateNo', 'tmmd', 'manufacturer'];

/** One year less a day after the last calibration (what the real registers hold). */
export function defaultDueDate(lastIso: string | null | undefined): string | null {
  if (!lastIso) return null;
  const [y, m, d] = lastIso.split('-').map(Number);
  const due = new Date(Date.UTC(y + 1, m - 1, d));
  // Feb 29 → Mar 1 the next year; step back from there so the day-before rule holds.
  if (due.getUTCMonth() !== m - 1) due.setUTCDate(0);
  due.setUTCDate(due.getUTCDate() - 1);
  return due.toISOString().slice(0, 10);
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function instrumentKey(certificateNo: string, serialNumber: string): string {
  return `${norm(certificateNo)}|${norm(serialNumber)}`;
}

export interface TmmdMapping { instrument: string; tmmd: Tmmd }

/** Exact name wins; else a partial match when one or two lines fit; else null. */
export function suggestTmmd(description: string, map: TmmdMapping[]): Tmmd | null {
  const q = norm(description);
  if (!q) return null;
  const exact = map.find((m) => norm(m.instrument) === q);
  if (exact) return exact.tmmd;
  const partial = map.filter((m) => norm(m.instrument).includes(q) || q.includes(norm(m.instrument)));
  return partial.length >= 1 && partial.length <= 2 ? partial[0].tmmd : null;
}

export function validateInstrument(i: CalInstrument): Partial<Record<InstrumentField, string>> {
  const errs: Partial<Record<InstrumentField, string>> = {};
  for (const f of REQUIRED_FIELDS) {
    const v = i[f];
    if (v === null || (typeof v === 'string' && !v.trim())) {
      errs[f] = `${CAL_COLUMNS.find((c) => c.field === f)!.label} is required.`;
    }
  }
  if (i.lastCalibration && i.dueDate && i.dueDate < i.lastCalibration) {
    errs.dueDate = 'Due date is before the last calibration.';
  }
  return errs;
}

/** New S.N for rows in their current order; only rows whose number changes. */
export function renumber(rows: Pick<CalInstrument, 'id' | 'sequenceNo'>[]): { id: string; sequenceNo: number }[] {
  return rows.flatMap((r, i) => (r.sequenceNo === i + 1 ? [] : [{ id: r.id, sequenceNo: i + 1 }]));
}

// ---- Workbook ---------------------------------------------------------------

export interface RegisterHeader {
  title: string; location: string; registerDate: string | null; revisionNo: string; qualificationCode: string;
}

export interface ParseError { row: number; column: string; message: string }

export type ParsedInstrument = Omit<CalInstrument, 'id' | 'registerId' | 'certFilePath' | 'certFileName'>;

export interface ParsedRegister {
  header: RegisterHeader;
  rows: ParsedInstrument[];
  errors: ParseError[];
  /** Fields the sheet has a column for — an upload leaves the others alone. */
  present: Set<InstrumentField>;
}

const cellText = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

function excelSerialToIso(n: number): string {
  return new Date(Math.round((n - 25569) * 86_400_000)).toISOString().slice(0, 10);
}

/** Excel serial, Date, or unambiguous text; throws on anything it would have to guess. */
function readDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return excelSerialToIso(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const p = parseDate(String(v));
  if (!p) throw new Error(`"${cellText(v)}" is not a date.`);
  if (p.ambiguous) throw new Error(`"${cellText(v)}" could be day/month or month/day — write it as 17-Mar-2026.`);
  return p.iso;
}

const HEADER_LABELS: Record<string, keyof RegisterHeader> = {
  location: 'location', date: 'registerDate', 'revision no': 'revisionNo',
  'qualification code': 'qualificationCode',
};

export function parseRegisterWorkbook(wb: XLSX.WorkBook): ParsedRegister {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
  const byHeader = new Map(CAL_COLUMNS.map((c) => [norm(c.header), c]));
  const headRow = aoa.findIndex((r) => r.filter((v) => byHeader.has(norm(cellText(v)))).length >= 3);
  if (headRow < 0) throw new Error('No heading row found — expected "Certificate", "Serial No", "Description of Instrument"…');

  const header: RegisterHeader = { title: '', location: '', registerDate: null, revisionNo: '', qualificationCode: '' };
  for (const r of aoa.slice(0, headRow)) {
    r.forEach((v, i) => {
      const key = HEADER_LABELS[norm(cellText(v))];
      if (key) {
        const val = r[i + 1];
        if (key === 'registerDate') { try { header.registerDate = readDate(val); } catch { /* left blank */ } }
        else header[key] = cellText(val);
      } else if (!header.title && /tmmde|calibration register/i.test(cellText(v))) header.title = cellText(v);
    });
  }

  const colIdx = new Map<InstrumentField, number>();
  aoa[headRow].forEach((v, i) => { const c = byHeader.get(norm(cellText(v))); if (c) colIdx.set(c.field, i); });

  const rows: ParsedInstrument[] = [];
  const errors: ParseError[] = [];
  aoa.slice(headRow + 1).forEach((r, k) => {
    const rowNo = headRow + 2 + k;
    if (r.every((v) => cellText(v) === '')) return;
    const get = (f: InstrumentField) => (colIdx.has(f) ? r[colIdx.get(f)!] : '');
    const out: ParsedInstrument = {
      sequenceNo: null, certificateNo: '', instrument: '', tmmd: null, manufacturer: '', model: '',
      serialNumber: '', range: '', location: '', grade: '', acceptanceCriteria: '',
      lastCalibration: null, dueDate: null, certifyingCompany: '', remarks: '',
    };
    let drop = false;
    for (const c of CAL_COLUMNS) {
      if (!colIdx.has(c.field)) continue;
      const raw = get(c.field);
      if (c.date) {
        try { (out[c.field] as string | null) = readDate(raw); }
        catch (e) { errors.push({ row: rowNo, column: c.header, message: (e as Error).message }); drop = true; }
      } else if (c.field === 'sequenceNo') {
        const n = Number(cellText(raw));
        out.sequenceNo = cellText(raw) && Number.isFinite(n) ? n : null;
      } else if (c.field === 'tmmd') {
        const t = TMMD_VALUES.find((x) => norm(x) === norm(cellText(raw)));
        if (!t && cellText(raw)) errors.push({ row: rowNo, column: c.header, message: `Unknown T/M/M/D "${cellText(raw)}" — left empty.` });
        out.tmmd = t ?? null;
      } else {
        (out[c.field] as string) = cellText(raw).replace(/\r\n/g, '\n');
      }
    }
    if (drop) return;
    if (!out.certificateNo && !out.serialNumber) {
      errors.push({ row: rowNo, column: 'Certificate', message: 'No certificate or serial number — row skipped.' });
      return;
    }
    if (!out.dueDate) out.dueDate = defaultDueDate(out.lastCalibration);
    rows.push(out);
  });
  return { header, rows, errors, present: new Set(colIdx.keys()) };
}

/** The register sheet, header block included — the same file the upload accepts. */
export function buildRegisterWorkbook(header: RegisterHeader, rows: ParsedInstrument[]): XLSX.WorkBook {
  const blank = () => Array<unknown>(CAL_COLUMNS.length).fill('');
  const r2 = blank(); r2[6] = header.title; r2[12] = 'Location'; r2[13] = header.location;
  const r3 = blank(); r3[12] = 'Date'; r3[13] = header.registerDate ?? '';
  const r4 = blank(); r4[12] = 'Revision No'; r4[13] = header.revisionNo;
  const r1 = blank(); r1[12] = 'Qualification Code'; r1[13] = header.qualificationCode;
  const aoa: unknown[][] = [r1, r2, r3, r4, CAL_COLUMNS.map((c) => c.header)];
  for (const i of rows) aoa.push(CAL_COLUMNS.map((c) => i[c.field] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [XLSX.utils.decode_range('G2:L3')];
  ws['!cols'] = CAL_COLUMNS.map((c) => ({ wch: c.field === 'acceptanceCriteria' || c.field === 'remarks' ? 36 : 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Callibration Log');
  return wb;
}

export interface ImportPlan {
  inserts: ParsedInstrument[];
  updates: (ParsedInstrument & { id: string })[];
  untouched: number;
}

/** Match on certificate + serial: update what's there, add the rest, delete nothing. */
export function planRegisterImport(parsed: ParsedInstrument[], existing: CalInstrument[]): ImportPlan {
  const byKey = new Map(existing.map((e) => [instrumentKey(e.certificateNo, e.serialNumber), e.id]));
  const touched = new Set<string>();
  const inserts: ParsedInstrument[] = [];
  const updates: (ParsedInstrument & { id: string })[] = [];
  for (const p of parsed) {
    const id = byKey.get(instrumentKey(p.certificateNo, p.serialNumber));
    if (id && !touched.has(id)) { touched.add(id); updates.push({ ...p, id }); } else inserts.push(p);
  }
  return { inserts, updates, untouched: existing.length - touched.size };
}
