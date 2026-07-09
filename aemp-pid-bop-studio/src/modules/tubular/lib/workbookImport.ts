// ============================================================================
//  Multi-sheet workbook importer — parses the REAL "Tubular_Monitoring and
//  data entry.xlsx" layout (verified cell-by-cell during discovery):
//    - 24 "Rig N" + 5 "Hoist N" unit sheets, identical A1:P55 layout
//      row 2: B=unit number, D=Date of Update, G=unit of measure
//      category bands: DP rows 7-19 · HWDP 21-26 · DC 28-35 · PUP 37-49
//      columns: B desc · C contract · D on-board · E premium · F class2 ·
//                G class3 · H scrap · I needs-insp · J damaged · K to-repair ·
//               L to-other-rig · M from-rig · N rental date · O less · P remarks
//    - hidden "Lists" sheet = the controlled catalog (42 descriptions)
//    - "Dashboard"/"Master" are DERIVED and never imported; "Reference" is
//      reference material, not inventory.
//  Rules enforced here (workbook + approved decisions):
//    - duplicate descriptions are PRESERVED (occurrence index keeps re-import
//      identity stable);
//    - a typed On Board that differs from Premium+C2+C3+Scrap becomes
//      onBoardReported (+ warning) — never recomputed away, never trusted as
//      the computed total;
//    - invalid numbers are ERRORS that block the row — never coerced to 0;
//    - unknown descriptions are ERRORS; unknown sheets are WARNINGS.
//  SheetJS is lazy-loaded (same pattern/caps as src/lib/xlsx.ts — F14).
// ============================================================================
import { MAX_XLSX_BYTES } from '../../../lib/xlsx';
import type { TubularCategory } from './records';

export interface ImportIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

export interface ParsedRow {
  rowNum: number;              // Excel row (1-based) in the source sheet
  category: TubularCategory;
  description: string;
  occurrenceIndex: number;     // 1-based among identical (category, description) in this sheet
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
  /** The typed D value when it differs from the class sum (85 legacy rows). */
  onBoardReported: number | null;
  rentalDate: string | null;   // YYYY-MM-DD
  remarks: string | null;
  issues: ImportIssue[];
}

export interface ParsedUnitSheet {
  sheetName: string;
  dateOfUpdate: string | null; // YYYY-MM-DD
  unitOfMeasure: string | null;
  contractRef: string | null;
  rows: ParsedRow[];
  issues: ImportIssue[];
}

export interface ParsedWorkbook {
  units: ParsedUnitSheet[];
  /** Lists-sheet catalog entries, for validation against the DB catalog. */
  lists: Array<{ description: string; category: string }>;
  globalIssues: ImportIssue[];
  stats: {
    unitSheets: number;
    dataRows: number;
    errorRows: number;
    overrideRows: number;
    totals: { onContract: number; premium: number; class2: number; class3: number; scrap: number; needsInspection: number };
  };
}

const CATEGORY_BANDS: Array<{ cat: TubularCategory; from: number; to: number }> = [
  { cat: 'drill_pipe', from: 7, to: 19 },
  { cat: 'hwdp', from: 21, to: 26 },
  { cat: 'drill_collar', from: 28, to: 35 },
  { cat: 'pup_joint', from: 37, to: 49 },
];

const DERIVED_SHEETS = new Set(['Dashboard', 'Master']);
const NON_UNIT_SHEETS = new Set(['Dashboard', 'Master', 'Reference', 'Lists']);
const UNIT_SHEET_RE = /^(Rig|Hoist) .+$/;
export const MAX_UNIT_SHEETS = 100;

function toIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Use LOCAL calendar components: toISOString() shifts the date back a day
    // for timezones east of UTC (SheetJS materialises serials as local dates).
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
  }
  return null;
}

/** Strict cell → non-negative int. Blank = 0 (an empty sheet cell). */
function cellQty(v: unknown, label: string, issues: ImportIssue[]): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'string' && v.trim() === '') return 0; // whitespace-only cell = blank (real case: Rig 303!C9)
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'number' && v >= 0) {
    issues.push({ level: 'error', message: `${label}: ${v} is not a whole number` });
    return 0;
  }
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  issues.push({ level: 'error', message: `${label}: "${String(v).trim().slice(0, 40)}" is not a non-negative whole number` });
  return 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Grid = any[][];

function parseUnitSheet(sheetName: string, grid: Grid, catalogByDesc: Map<string, TubularCategory>): ParsedUnitSheet {
  const issues: ImportIssue[] = [];
  const cell = (r1: number, c0: number) => (grid[r1 - 1] ?? [])[c0]; // r1 = Excel 1-based row

  const dateOfUpdate = toIsoDate(cell(2, 3));
  if (!dateOfUpdate) issues.push({ level: 'warning', message: 'Date of Update (D2) missing or unreadable' });
  const uomRaw = cell(2, 6);
  const unitOfMeasure = uomRaw == null || uomRaw === '' ? null : String(uomRaw);

  let contractRef: string | null = null;
  for (let r = 50; r <= 55; r++) {
    const v = cell(r, 0);
    if (typeof v === 'string' && /contract/i.test(v)) { contractRef = v.trim(); break; }
  }

  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();

  for (const band of CATEGORY_BANDS) {
    for (let r = band.from; r <= band.to; r++) {
      const desc = cell(r, 1);
      if (desc == null || String(desc).trim() === '') continue;
      const description = String(desc).trim();
      const rowIssues: ImportIssue[] = [];

      const catalogCat = catalogByDesc.get(description);
      if (!catalogCat) {
        rowIssues.push({ level: 'error', message: `"${description}" is not in the tubular catalog (Lists)` });
      } else if (catalogCat !== band.cat) {
        rowIssues.push({ level: 'warning', message: `"${description}" sits in the ${band.cat} band but the catalog says ${catalogCat}; catalog category used` });
      }

      const q = (c0: number, label: string) => cellQty(cell(r, c0), label, rowIssues);
      const onContract = q(2, 'On Contract');
      const premium = q(4, 'Premium');
      const class2 = q(5, 'Class 2');
      const class3 = q(6, 'Class 3');
      const scrap = q(7, 'Scrap');
      const needsInspection = q(8, 'Needs Inspection');
      const damagedOnLocation = q(9, 'Damaged on Location');
      const sendToRepair = q(10, 'Send to Repair');
      const toOtherRig = q(11, 'To Other Rig');
      const receiveFromRig = q(12, 'Receive From Rig');

      // D column: formula rows read back as the computed sum; manually typed
      // totals may differ — preserve them as "reported" and flag.
      const dRaw = cell(r, 3);
      let onBoardReported: number | null = null;
      const classSum = premium + class2 + class3 + scrap;
      if (typeof dRaw === 'number' && Number.isFinite(dRaw) && Math.round(dRaw) !== classSum) {
        onBoardReported = Math.round(dRaw);
        rowIssues.push({
          level: 'warning',
          message: `On Board typed as ${onBoardReported} but classes sum to ${classSum} (kept as reported total; review classification)`,
        });
      }

      const cat = catalogCat ?? band.cat;
      const dupKey = `${cat}|${description}`;
      const occurrenceIndex = (seen.get(dupKey) ?? 0) + 1;
      seen.set(dupKey, occurrenceIndex);
      if (occurrenceIndex === 2) {
        rowIssues.push({ level: 'info', message: `duplicate description in this sheet — kept as a separate row (see Remarks/variant)` });
      }

      const remarksRaw = cell(r, 15);
      rows.push({
        rowNum: r, category: cat, description, occurrenceIndex,
        onContract, premium, class2, class3, scrap, needsInspection,
        damagedOnLocation, sendToRepair, toOtherRig, receiveFromRig,
        onBoardReported,
        rentalDate: toIsoDate(cell(r, 13)),
        remarks: remarksRaw == null || remarksRaw === '' ? null : String(remarksRaw),
        issues: rowIssues,
      });
    }
  }

  if (rows.length === 0) issues.push({ level: 'info', message: 'sheet has no data rows' });
  return { sheetName, dateOfUpdate, unitOfMeasure, contractRef, rows, issues };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function parseTubularWorkbook(data: ArrayBuffer): Promise<ParsedWorkbook> {
  if (data.byteLength > MAX_XLSX_BYTES) throw new Error('Spreadsheet too large (max 15 MB).');

  const XLSX = await import('xlsx');
  let wb: import('xlsx').WorkBook;
  try {
    // Uint8Array works in both the CJS and ESM SheetJS builds (a bare
    // ArrayBuffer silently mis-parses in the ESM build).
    wb = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true });
  } catch {
    throw new Error('Could not read this spreadsheet — it may be corrupt or not a valid .xlsx file.');
  }

  const globalIssues: ImportIssue[] = [];

  // Lists (hidden) → catalog reference
  const lists: Array<{ description: string; category: string }> = [];
  const listsSheet = wb.Sheets['Lists'];
  if (!listsSheet) {
    globalIssues.push({ level: 'warning', message: 'hidden "Lists" sheet not found — descriptions validated against the database catalog only' });
  } else {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(listsSheet, { header: 1, raw: true }) as Grid;
    for (let i = 1; i < grid.length; i++) {
      const [d, c] = grid[i] ?? [];
      if (d && c) lists.push({ description: String(d).trim(), category: String(c).trim() });
    }
  }

  const catMap: Record<string, TubularCategory> = {
    'DRILL PIPE': 'drill_pipe', HWDP: 'hwdp', 'DRILL COLLAR': 'drill_collar', 'PUP JOINT': 'pup_joint',
  };
  const catalogByDesc = new Map<string, TubularCategory>();
  for (const l of lists) {
    const c = catMap[l.category.toUpperCase()];
    if (c) catalogByDesc.set(l.description, c);
  }

  const unitSheetNames = wb.SheetNames.filter((n) => UNIT_SHEET_RE.test(n));
  if (unitSheetNames.length === 0) throw new Error('No Rig/Hoist sheets found — is this the Tubular Monitoring workbook?');
  if (unitSheetNames.length > MAX_UNIT_SHEETS) throw new Error(`Too many unit sheets (${unitSheetNames.length}).`);

  for (const n of wb.SheetNames) {
    if (!UNIT_SHEET_RE.test(n) && !NON_UNIT_SHEETS.has(n)) {
      globalIssues.push({ level: 'warning', message: `unexpected sheet "${n}" ignored` });
    }
  }
  for (const n of wb.SheetNames.filter((s) => DERIVED_SHEETS.has(s))) {
    globalIssues.push({ level: 'info', message: `"${n}" is derived data — not imported (the app computes it live)` });
  }

  const units = unitSheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null }) as Grid;
    return parseUnitSheet(name, grid, catalogByDesc);
  });

  const all = units.flatMap((u) => u.rows);
  const totals = { onContract: 0, premium: 0, class2: 0, class3: 0, scrap: 0, needsInspection: 0 };
  for (const r of all) {
    totals.onContract += r.onContract; totals.premium += r.premium; totals.class2 += r.class2;
    totals.class3 += r.class3; totals.scrap += r.scrap; totals.needsInspection += r.needsInspection;
  }

  return {
    units, lists, globalIssues,
    stats: {
      unitSheets: units.length,
      dataRows: all.length,
      errorRows: all.filter((r) => r.issues.some((i) => i.level === 'error')).length,
      overrideRows: all.filter((r) => r.onBoardReported != null).length,
      totals,
    },
  };
}

/** Rows in the shape stage_import() expects (jsonb array). */
export function toStageRows(parsed: ParsedWorkbook) {
  return parsed.units.flatMap((u) =>
    u.rows.map((r) => ({
      sheet_name: u.sheetName,
      row_num: r.rowNum,
      unit_name: u.sheetName,
      category: r.category,
      description: r.description,
      occurrence_index: r.occurrenceIndex,
      on_contract: r.onContract,
      premium: r.premium,
      class2: r.class2,
      class3: r.class3,
      scrap: r.scrap,
      needs_inspection: r.needsInspection,
      damaged_on_location: r.damagedOnLocation,
      send_to_repair: r.sendToRepair,
      to_other_rig: r.toOtherRig,
      receive_from_rig: r.receiveFromRig,
      on_board_reported: r.onBoardReported,
      rental_date: r.rentalDate,
      remarks: r.remarks,
      entry_date: u.dateOfUpdate,
      contract_ref: u.contractRef,
      issues: r.issues,
      has_error: r.issues.some((i) => i.level === 'error'),
    })),
  );
}
