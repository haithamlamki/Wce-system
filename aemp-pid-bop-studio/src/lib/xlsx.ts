// ============================================================================
//  XLSX import (research report §5). Wraps SheetJS to produce the same
//  header-keyed row shape as parseCsv() so the import pipeline is format-blind.
//  SheetJS is large and only needed on import, so it is loaded on demand.
//  This parses untrusted user-supplied files, so inputs are capped and any
//  parser failure is normalised into a clean, user-facing Error (F14).
// ============================================================================
import { MAX_IMPORT_ROWS } from './importMap';

/** Reject spreadsheets above this size before handing them to SheetJS. */
export const MAX_XLSX_BYTES = 15 * 1024 * 1024; // 15 MB

/** Parse the first worksheet of an .xlsx file into lower-cased header-keyed rows. */
export async function parseXlsx(data: ArrayBuffer): Promise<Record<string, string>[]> {
  if (data.byteLength > MAX_XLSX_BYTES) throw new Error('Spreadsheet too large (max 15 MB).');

  let raw: Record<string, unknown>[];
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  } catch {
    throw new Error('Could not read this spreadsheet — it may be corrupt or not a valid .xlsx file.');
  }

  if (raw.length > MAX_IMPORT_ROWS) throw new Error(`Spreadsheet has too many rows (max ${MAX_IMPORT_ROWS}).`);

  return raw
    .map((r) => {
      const o: Record<string, string> = {};
      for (const k of Object.keys(r)) o[k.trim().toLowerCase()] = String(r[k] ?? '').trim();
      return o;
    })
    .filter((o) => Object.values(o).some((v) => v !== ''));
}
