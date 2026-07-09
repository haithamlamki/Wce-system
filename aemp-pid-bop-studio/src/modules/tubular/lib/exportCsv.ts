// ============================================================================
//  CSV export with spreadsheet-formula-injection hardening: any field starting
//  with = + - @ (or tab/CR) is prefixed with a single quote so Excel treats it
//  as text, and fields are RFC-4180 quoted. Values come from user-entered
//  remarks/descriptions, so they are untrusted for export purposes.
// ============================================================================

export function csvField(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  const blob = new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
