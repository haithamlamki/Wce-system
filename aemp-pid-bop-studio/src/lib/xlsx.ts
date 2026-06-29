// ============================================================================
//  XLSX import (research report §5). Wraps SheetJS to produce the same
//  header-keyed row shape as parseCsv() so the import pipeline is format-blind.
//  SheetJS is large and only needed on import, so it is loaded on demand.
// ============================================================================

/** Parse the first worksheet of an .xlsx file into lower-cased header-keyed rows. */
export async function parseXlsx(data: ArrayBuffer): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  return raw
    .map((r) => {
      const o: Record<string, string> = {};
      for (const k of Object.keys(r)) o[k.trim().toLowerCase()] = String(r[k] ?? '').trim();
      return o;
    })
    .filter((o) => Object.values(o).some((v) => v !== ''));
}
