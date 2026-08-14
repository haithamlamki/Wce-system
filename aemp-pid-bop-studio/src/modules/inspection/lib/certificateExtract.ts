// ============================================================================
//  Certificate field extraction — pure text → candidate field values.
//
//  Deliberately NOT an AI call. All four sample certificates carry a real PDF
//  text layer, so label-based extraction is free, offline, deterministic and
//  auditable. Every candidate carries the source line it came from so a human
//  can check it before anything is saved.
//
//  Shaped by the real documents (Bureau Veritas MPI reports and a GAI-Tronics
//  certificate of conformance), which differ from the textbook layout in three
//  ways this module has to handle:
//
//   1. A single line carries TWO label/value pairs, with no colons:
//        "Report Number BV.OMA.IVS.32168.021 Date of Inspection 14-April-2025"
//      so a value runs only until the next known label, not to end of line.
//   2. The inspected equipment is in an "INSPECTED ITEMS DETAILS" table. The
//      "Equipment Details" table higher up lists the INSPECTOR'S OWN tools
//      (AC YOKE, DC YOKE, WEIGHT BAR) and must never be read as the subject.
//   3. One PDF page = one certificate, so a multi-page file yields many.
//
//  This module never writes anything.
// ============================================================================
import { INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES } from '../types';

export type CertField =
  | 'serialNumber' | 'certificateNumber' | 'oem' | 'inspectionCompany'
  | 'equipmentDescription' | 'partNumber' | 'unit' | 'customer'
  | 'inspectionDate' | 'nextDueDate' | 'inspectionType'
  | 'workingPressure' | 'testPressure' | 'manufactureYear';

export type Confidence = 'high' | 'medium' | 'low';

export interface Candidate {
  field: CertField;
  value: string;
  confidence: Confidence;
  /** The line the value was read from, shown to the user for verification. */
  source: string;
}

/** A row of the INSPECTED ITEMS DETAILS table — the equipment actually tested. */
export interface InspectedItem {
  serial: string;
  description: string;
  raw: string;
}

export interface ExtractionResult {
  candidates: Candidate[];
  items: InspectedItem[];
  /** Months between inspection and next-due, snapped to an allowed frequency. */
  inferredFrequencyMonths: number | null;
  /** True when the text is too sparse to be a real certificate text layer. */
  looksEmpty: boolean;
}

/** Label synonyms per field, lowercase. Longest are matched first. */
const LABELS: Record<CertField, string[]> = {
  certificateNumber: ['report number', 'certificate number', 'certificate no', 'cert no',
    'report no', 'job no.', 'job no'],
  serialNumber: ['serial number', 'serial no', 'serial #', 's/n', 'ser no', 'serial'],
  oem: ['manufacturer', 'maker', 'oem', 'make'],
  inspectionCompany: ['inspection company', 'test house', 'issued by', 'certifying authority'],
  customer: ['customer name', 'end user', 'customer'],
  // No bare "rig": it matches inside its own value ("Rig /Unit RIG 304") and
  // inside prose such as "Rigs 106 & 107".
  unit: ['rig/hoist number', 'rig /unit', 'rig/unit', 'rig number', 'rig no', 'unit number'],
  equipmentDescription: ['equipment description', 'description of equipment',
    'item description', 'description'],
  partNumber: ['part number', 'part no', 'p/n', 'model number', 'model no'],
  inspectionDate: ['date of inspection', 'date of test', 'inspection date', 'test date',
    'date of examination', 'date tested', 'examination date'],
  nextDueDate: ['date of expiry', 'next inspection date', 'next inspection due',
    'next due date', 'expiry date', 'next due', 'next test date', 'valid until',
    're-test date', 'retest date', 'next examination', 'due date'],
  inspectionType: ['inspection type', 'inspection category'],
  workingPressure: ['max working pressure', 'working pressure', 'mawp'],
  testPressure: ['hydrostatic test pressure', 'test pressure', 'tested at'],
  manufactureYear: ['year of manufacture', 'manufacture year', 'date of manufacture',
    'year built', 'mfg year'],
};

/** Every (label, field) pair, longest label first so "serial number" wins over "serial". */
const LABEL_INDEX: { label: string; field: CertField }[] = Object
  .entries(LABELS)
  .flatMap(([field, syns]) => syns.map((label) => ({ label, field: field as CertField })))
  .sort((a, b) => b.label.length - a.label.length);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string { return String(n).padStart(2, '0'); }

/**
 * Parses the date spellings these certificates actually use — including
 * `13--OCT-25` (double hyphen), `14-April-2025`, `13 October 2026` and
 * `09-Jul-25` — and returns ISO `YYYY-MM-DD`.
 *
 * Ambiguous all-numeric dates are day-first (`15/07/2025`), matching the
 * issuing houses; a value that can only be month-first (`5/28/2020`, from the
 * US-issued OEM certificate) is detected by its out-of-range second part.
 */
export function parseCertificateDate(raw: string): string | null {
  const s = raw.trim();

  const iso = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return `${y}-${pad(+m)}-${pad(+d)}`;
  }

  // 13--OCT-25 / 14-April-2025 / 13 October 2026 / 09-Jul-25
  const named = s.match(/\b(\d{1,2})[\s.\-/]+([A-Za-z]{3,9})[\s.\-/]+(\d{2,4})\b/);
  if (named) {
    const [, d, name, y] = named;
    const m = MONTHS[name.slice(0, 3).toLowerCase()];
    if (m && +d >= 1 && +d <= 31) {
      const year = y.length === 2 ? 2000 + +y : +y;
      return `${year}-${pad(m)}-${pad(+d)}`;
    }
  }

  // July 17, 2025
  const monthFirst = s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthFirst) {
    const [, name, d, y] = monthFirst;
    const m = MONTHS[name.slice(0, 3).toLowerCase()];
    if (m && +d >= 1 && +d <= 31) return `${y}-${pad(m)}-${pad(+d)}`;
  }

  const numeric = s.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (numeric) {
    const [, a, b, y] = numeric;
    const year = y.length === 2 ? 2000 + +y : +y;
    if (+a >= 1 && +a <= 31 && +b >= 1 && +b <= 12) return `${year}-${pad(+b)}-${pad(+a)}`;
    // The second part cannot be a month, so this must be month/day/year.
    if (+b >= 1 && +b <= 31 && +a >= 1 && +a <= 12) return `${year}-${pad(+a)}-${pad(+b)}`;
  }

  return null;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td - fd > 15 ? 1 : 0);
}

const ALLOWED_FREQUENCIES = [...new Set<number>([
  ...INTERMEDIATE_FREQUENCIES, ...MAJOR_FREQUENCIES,
])].sort((a, b) => a - b);

/** Snaps a raw month gap to a frequency the schema accepts, or null if far off. */
export function snapFrequency(months: number): number | null {
  let best: number | null = null;
  let bestGap = Infinity;
  for (const f of ALLOWED_FREQUENCIES) {
    const gap = Math.abs(f - months);
    if (gap < bestGap) { bestGap = gap; best = f; }
  }
  return bestGap <= 1 ? best : null;
}

function clean(v: string): string {
  return v.replace(/\s+/g, ' ').replace(/^[\s:•\-–—|]+/, '').replace(/[\s:|]+$/, '').trim();
}

function valueLooksValid(field: CertField, value: string): boolean {
  if (!value || value.length > 120) return false;
  if (/^(n\/a|na|-+|—)$/i.test(value)) return false;
  if (field === 'inspectionDate' || field === 'nextDueDate') {
    return parseCertificateDate(value) !== null;
  }
  if (field === 'manufactureYear') return /\b(19|20)\d{2}\b/.test(value);
  return true;
}

function normaliseValue(field: CertField, value: string): string {
  if (field === 'inspectionDate' || field === 'nextDueDate') {
    return parseCertificateDate(value) ?? value;
  }
  if (field === 'manufactureYear') return value.match(/\b(19|20)\d{2}\b/)?.[0] ?? value;
  return value;
}

/** Occurrences of known labels in a line, non-overlapping, left to right. */
function labelHits(line: string): { at: number; end: number; field: CertField }[] {
  const lc = line.toLowerCase();
  const hits: { at: number; end: number; field: CertField }[] = [];
  const taken: boolean[] = new Array(line.length).fill(false);

  for (const { label, field } of LABEL_INDEX) {
    let from = 0;
    for (;;) {
      const at = lc.indexOf(label, from);
      if (at === -1) break;
      from = at + 1;
      const end = at + label.length;
      // Whole-word only, and not inside a longer label already claimed.
      const before = at === 0 ? '' : line[at - 1];
      const after = line[end] ?? '';
      if (before && /[A-Za-z]/.test(before)) continue;
      if (after && /[A-Za-z]/.test(after)) continue;
      if (taken.slice(at, end).some(Boolean)) continue;
      for (let i = at; i < end; i += 1) taken[i] = true;
      hits.push({ at, end, field });
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

/** Extracts a serial from the start of an inspected-items row. */
function splitItemRow(row: string): InspectedItem | null {
  const tokens = row.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const serialParts: string[] = [];
  let i = 0;
  for (; i < tokens.length; i += 1) {
    const tk = tokens[i];
    const hasDigit = /\d/.test(tk);
    const shortCode = /^[A-Z]{1,3}$/.test(tk);
    if (hasDigit || (shortCode && serialParts.length === 0)) serialParts.push(tk);
    else break;
  }
  if (serialParts.length === 0) return null;
  const description = tokens.slice(i)
    .filter((tk) => !/^(satisfactory|acceptable|pass|passed|-+|—+)$/i.test(tk))
    .join(' ')
    .trim();
  // Trailing inch marks bleed in from the adjacent Size column ("AN3503546''").
  const serial = serialParts.join(' ').replace(/["'’”]+$/, '').trim();
  return { serial, description, raw: row };
}

const ITEMS_HEADING = /inspected items details/i;
const ITEMS_COLUMNS = /^serial\s*number\b.*\bdescription\b/i;
const SECTION_END = /^(pictures|remarks|comments|inspected by|inspection parameters)\b/i;

/** Extracts candidate field values from ONE certificate (one PDF page). */
export function extractCertificate(text: string): ExtractionResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const looksEmpty = lines.join('').replace(/\s/g, '').length < 40;

  const found = new Map<CertField, Candidate>();
  const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
  const consider = (c: Candidate) => {
    const existing = found.get(c.field);
    if (!existing || rank[c.confidence] < rank[existing.confidence]) found.set(c.field, c);
  };

  // --- header label/value pairs, several per line -----------------------------
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const hits = labelHits(line);

    for (let h = 0; h < hits.length; h += 1) {
      const { end, field } = hits[h];
      const stop = hits[h + 1]?.at ?? line.length;
      const value = clean(line.slice(end, stop));

      if (valueLooksValid(field, value)) {
        consider({ field, value: normaliseValue(field, value), confidence: 'high', source: line });
        continue;
      }
      // Label alone on its line: the value is usually the next line.
      if (!value && hits.length === 1) {
        const next = lines[i + 1] ? clean(lines[i + 1]) : '';
        if (next && valueLooksValid(field, next)) {
          consider({
            field,
            value: normaliseValue(field, next),
            confidence: 'medium',
            source: `${line} ⏎ ${lines[i + 1]}`,
          });
        }
      }
    }
  }

  // --- the inspected-items table ----------------------------------------------
  const items: InspectedItem[] = [];
  const start = lines.findIndex((l) => ITEMS_HEADING.test(l));
  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (SECTION_END.test(line)) break;
      if (ITEMS_COLUMNS.test(line)) continue;
      const item = splitItemRow(line);
      if (item && item.description) items.push(item);
    }
  }

  // The first inspected item is the certificate's subject.
  if (items.length > 0) {
    const first = items[0];
    consider({ field: 'serialNumber', value: first.serial, confidence: 'high', source: first.raw });
    consider({
      field: 'equipmentDescription', value: first.description, confidence: 'high', source: first.raw,
    });
  }

  // --- issuing company, printed in the footer ----------------------------------
  if (!found.has('inspectionCompany')) {
    const issuer = lines.find((l) => /\b(LLC|L\.L\.C|Ltd|Limited|Co\.|Corporation|Inc\.)\b/i.test(l)
      && l.length < 80 && !/^(customer|address|phone|email)/i.test(l));
    if (issuer) {
      consider({
        field: 'inspectionCompany', value: clean(issuer), confidence: 'medium', source: issuer,
      });
    }
  }

  const candidates = [...found.values()];
  const inspection = candidates.find((c) => c.field === 'inspectionDate')?.value;
  const due = candidates.find((c) => c.field === 'nextDueDate')?.value;
  const inferredFrequencyMonths = inspection && due
    ? snapFrequency(monthsBetween(inspection, due))
    : null;

  return { candidates, items, inferredFrequencyMonths, looksEmpty };
}

/**
 * One PDF page is one certificate in these documents, so a multi-page file
 * yields one result per page. Pages with no usable text are dropped.
 */
export function extractCertificatePages(pages: string[]): ExtractionResult[] {
  return pages.map(extractCertificate).filter((r) => !r.looksEmpty);
}

/**
 * True when no page carried usable text — the file is a scan or photograph, so
 * the fields cannot be read without OCR. Lives here rather than beside the
 * pdf.js reader so it stays testable without the browser PDF runtime.
 */
export function isScanned(pages: string[]): boolean {
  return pages.every((p) => p.replace(/\s/g, '').length < 40);
}

/** Convenience lookup for callers prefilling a form. */
export function valueOf(result: ExtractionResult, field: CertField): string | null {
  return result.candidates.find((c) => c.field === field)?.value ?? null;
}

/**
 * The only shape this module will ever write to a record.
 *
 * Deliberately narrow: there is no member for `*_due_date` or `approve_status`,
 * so a certificate can never hand the client authority over a calculated due
 * date (migration 0030's trigger owns those) nor move a record through the
 * approval workflow. Widening this type is the one change that would break
 * those guarantees, which is why it is stated here rather than left implicit
 * inside a component.
 */
export interface CertificatePatch {
  serial_number?: string;
  oem?: string;
  inspection_company?: string;
  part_number?: string;
  manufacture_year?: number;
  major_date?: string | null;
  major_freq_months?: number;
  intermediate_date?: string | null;
  intermediate_freq_months?: number;
}

export type Schedule = 'major' | 'intermediate';

/**
 * Builds the record patch from the fields the user ticked. Pure, so the safety
 * invariants above are testable without rendering anything.
 */
export function buildRecordPatch(
  result: ExtractionResult,
  picked: ReadonlySet<CertField>,
  schedule: Schedule,
): CertificatePatch {
  const patch: CertificatePatch = {};
  const take = (f: CertField) => (picked.has(f) ? valueOf(result, f) : null);

  const serial = take('serialNumber');
  if (serial) patch.serial_number = serial;

  const oem = take('oem');
  if (oem) patch.oem = oem;

  const company = take('inspectionCompany');
  if (company) patch.inspection_company = company;

  const part = take('partNumber');
  if (part) patch.part_number = part;

  const year = Number(take('manufactureYear'));
  if (Number.isInteger(year) && year > 0) patch.manufacture_year = year;

  const date = take('inspectionDate');
  if (date) {
    const months = result.inferredFrequencyMonths;
    if (schedule === 'major') {
      patch.major_date = date;
      if (months) patch.major_freq_months = months;
    } else {
      patch.intermediate_date = date;
      if (months) patch.intermediate_freq_months = months;
    }
  }

  return patch;
}
