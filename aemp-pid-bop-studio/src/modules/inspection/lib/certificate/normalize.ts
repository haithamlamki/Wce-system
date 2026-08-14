// ============================================================================
//  Generic field normalisation — issuer-independent by design.
//
//  Dates are the delicate part. A named month is unambiguous in any locale;
//  an all-numeric date is only unambiguous when one part exceeds 12. When both
//  parts could be a month the reading is genuinely undecidable from the text,
//  so the value is still parsed (day-first, as the issuing houses write it) but
//  flagged ambiguous, which lowers its confidence and keeps it a suggestion.
// ============================================================================
import { INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES } from '../../types';
import type { CertField } from './model';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** Which spelling produced a date — useful when auditing a wrong reading. */
export type DateFormat =
  | 'iso' | 'day-named-month' | 'named-month-day' | 'day-first' | 'month-first';

export interface ParsedDate {
  iso: string;
  format: DateFormat;
  /** Both leading parts could be a month: the reading is not decidable. */
  ambiguous: boolean;
}

/**
 * Parses the date spellings these certificates actually use — including
 * `13--OCT-25` (double hyphen), `14-April-2025`, `13 October 2026` and
 * `09-Jul-25`.
 *
 * Only formats seen in real documents are supported; nothing is invented for
 * layouts that have not been inspected.
 */
export function parseDate(raw: string): ParsedDate | null {
  const s = raw.trim();

  const iso = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) {
      return { iso: `${y}-${pad(+m)}-${pad(+d)}`, format: 'iso', ambiguous: false };
    }
  }

  // 13--OCT-25 / 14-April-2025 / 13 October 2026 / 09-Jul-25
  const named = s.match(/\b(\d{1,2})[\s.\-/]+([A-Za-z]{3,9})[\s.\-/]+(\d{2,4})\b/);
  if (named) {
    const [, d, name, y] = named;
    const m = MONTHS[name.slice(0, 3).toLowerCase()];
    if (m && +d >= 1 && +d <= 31) {
      const year = y.length === 2 ? 2000 + +y : +y;
      return {
        iso: `${year}-${pad(m)}-${pad(+d)}`, format: 'day-named-month', ambiguous: false,
      };
    }
  }

  // July 17, 2025
  const monthFirst = s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthFirst) {
    const [, name, d, y] = monthFirst;
    const m = MONTHS[name.slice(0, 3).toLowerCase()];
    if (m && +d >= 1 && +d <= 31) {
      return { iso: `${y}-${pad(m)}-${pad(+d)}`, format: 'named-month-day', ambiguous: false };
    }
  }

  const numeric = s.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (numeric) {
    const [, a, b, y] = numeric;
    const year = y.length === 2 ? 2000 + +y : +y;
    const aCouldBeMonth = +a >= 1 && +a <= 12;
    const bCouldBeMonth = +b >= 1 && +b <= 12;

    // Only the second part can be a month, so this is day-first and decided.
    if (bCouldBeMonth && !aCouldBeMonth && +a <= 31) {
      return { iso: `${year}-${pad(+b)}-${pad(+a)}`, format: 'day-first', ambiguous: false };
    }
    // Only the first part can be a month (5/28/2020 on the US OEM certificate).
    if (aCouldBeMonth && !bCouldBeMonth && +b <= 31) {
      return { iso: `${year}-${pad(+a)}-${pad(+b)}`, format: 'month-first', ambiguous: false };
    }
    // Both could be a month. Read day-first, as the issuing houses write it,
    // but say so: the reviewer decides, not the parser.
    if (aCouldBeMonth && bCouldBeMonth) {
      return { iso: `${year}-${pad(+b)}-${pad(+a)}`, format: 'day-first', ambiguous: true };
    }
  }

  return null;
}

/** ISO date only, for callers that do not care how it was spelled. */
export function parseCertificateDate(raw: string): string | null {
  return parseDate(raw)?.iso ?? null;
}

export function monthsBetween(fromIso: string, toIso: string): number {
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

export function clean(v: string): string {
  return v.replace(/\s+/g, ' ').replace(/^[\s:•\-–—|]+/, '').replace(/[\s:|]+$/, '').trim();
}

const DATE_FIELDS = new Set<CertField>(['inspectionDate', 'nextDueDate']);

export function valueLooksValid(field: CertField, value: string): boolean {
  if (!value || value.length > 120) return false;
  if (/^(n\/a|na|-+|—)$/i.test(value)) return false;
  if (DATE_FIELDS.has(field)) return parseDate(value) !== null;
  if (field === 'manufactureYear') return /\b(19|20)\d{2}\b/.test(value);
  return true;
}

export function normaliseValue(field: CertField, value: string): string {
  if (DATE_FIELDS.has(field)) return parseDate(value)?.iso ?? value;
  if (field === 'manufactureYear') return value.match(/\b(19|20)\d{2}\b/)?.[0] ?? value;
  return value;
}

/** True when this field's value form leaves more than one reading open. */
export function valueIsAmbiguous(field: CertField, value: string): boolean {
  if (!DATE_FIELDS.has(field)) return false;
  return parseDate(value)?.ambiguous === true;
}
