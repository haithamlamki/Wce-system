// ============================================================================
//  Minimal CSV parser (PRD FR-28 round-trip). Handles quoted fields, escaped
//  quotes ("") and commas/newlines inside quotes. Returns header-keyed rows.
// ============================================================================

/** Parse CSV text into an array of objects keyed by the (lower-cased) header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text.replace(/^﻿/, '')); // strip BOM
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
      return o;
    });
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** First header (case-insensitively) present in the row, else ''. */
export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
  return '';
}
