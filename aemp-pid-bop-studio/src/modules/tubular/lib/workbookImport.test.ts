// ============================================================================
//  Fixture test against the REAL operational workbook (copied verbatim to
//  __fixtures__/tubular-workbook.xlsx). The assertions below ARE the migration
//  acceptance baseline from the approved plan — if parsing ever drifts from
//  these numbers, the initial data migration must not proceed.
// ============================================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTubularWorkbook, toStageRows, type ParsedWorkbook } from './workbookImport';

let parsedPromise: Promise<ParsedWorkbook> | null = null;
function load(): Promise<ParsedWorkbook> {
  if (!parsedPromise) {
    const buf = readFileSync(join(__dirname, '__fixtures__', 'tubular-workbook.xlsx'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    parsedPromise = parseTubularWorkbook(ab as ArrayBuffer);
  }
  return parsedPromise;
}

describe('real workbook — reconciliation baseline (approved plan §3)', () => {
  it('reads all 29 unit sheets (24 rigs + 5 hoists) and the 42-item Lists catalog', async () => {
    const p = await load();
    expect(p.stats.unitSheets).toBe(29);
    expect(p.units.filter((u) => u.sheetName.startsWith('Rig ')).length).toBe(24);
    expect(p.units.filter((u) => u.sheetName.startsWith('Hoist ')).length).toBe(5);
    expect(p.lists.length).toBe(42);
  });

  it('imports exactly 265 data rows with ZERO error rows (nothing silently dropped)', async () => {
    const p = await load();
    expect(p.stats.dataRows).toBe(265);
    expect(p.stats.errorRows).toBe(0);
  });

  it('fleet totals reconcile: contract 13054 · premium 12229 · c2 12 · c3 0 · scrap 601 · needsInsp 193', async () => {
    const { totals } = (await load()).stats;
    expect(totals).toEqual({
      onContract: 13054, premium: 12229, class2: 12, class3: 0, scrap: 601, needsInspection: 193,
    });
  });

  it('flags exactly the 85 manually-typed On Board overrides as reported totals', async () => {
    const p = await load();
    expect(p.stats.overrideRows).toBe(85);
    // spot-check the discovery examples
    const rig103 = p.units.find((u) => u.sheetName === 'Rig 103');
    const hwdp = rig103?.rows.find((r) => r.rowNum === 21);
    expect(hwdp?.onBoardReported).toBe(30); // classes sum 10, damaged 20
    const rig109 = p.units.find((u) => u.sheetName === 'Rig 109');
    expect(rig109?.rows.find((r) => r.rowNum === 29)?.onBoardReported).toBe(4); // < class sum
  });

  it('preserves duplicate descriptions with stable occurrence indexes', async () => {
    const p = await load();
    const rig202 = p.units.find((u) => u.sheetName === 'Rig 202');
    const dups = rig202?.rows.filter((r) => r.description === '5" HWDP, NC50, 49.3 ppf') ?? [];
    expect(dups.length).toBe(3);
    expect(dups.map((d) => d.occurrenceIndex)).toEqual([1, 2, 3]);
    const rig103pups = p.units.find((u) => u.sheetName === 'Rig 103')
      ?.rows.filter((r) => r.description === '5" PUP, G-105, NC50, 19.5 ppf') ?? [];
    expect(rig103pups.length).toBe(3);
    expect(rig103pups.map((r) => r.remarks)).toEqual(['1.5m', '3m', '4.5m']);
  });

  it('reads sheet metadata: dates (incl. stale Rig 103 2024-06-11) and contract refs', async () => {
    const p = await load();
    expect(p.units.find((u) => u.sheetName === 'Rig 103')?.dateOfUpdate).toBe('2024-06-11');
    expect(p.units.find((u) => u.sheetName === 'Rig 105')?.dateOfUpdate).toBe('2026-05-10');
    expect(p.units.find((u) => u.sheetName === 'Rig 103')?.contractRef).toContain('C3100000659');
    expect(p.units.find((u) => u.sheetName === 'Rig 110')?.contractRef).toContain('AB/2019-053');
    expect(p.units.every((u) => u.unitOfMeasure === 'Joints')).toBe(true);
  });

  it('empty sheets (Rig 206/209/302) come through with zero rows, not errors', async () => {
    const p = await load();
    for (const name of ['Rig 206', 'Rig 209', 'Rig 302']) {
      const u = p.units.find((x) => x.sheetName === name);
      expect(u?.rows.length).toBe(0);
    }
  });

  it('Dashboard/Master are flagged as derived and never contribute rows', async () => {
    const p = await load();
    expect(p.globalIssues.some((i) => i.message.includes('"Dashboard" is derived'))).toBe(true);
    expect(p.globalIssues.some((i) => i.message.includes('"Master" is derived'))).toBe(true);
  });

  it('stage rows carry everything the server needs, one per data row', async () => {
    const p = await load();
    const rows = toStageRows(p);
    expect(rows.length).toBe(265);
    expect(rows.every((r) => r.unit_name && r.description && r.category)).toBe(true);
    expect(rows.filter((r) => r.has_error).length).toBe(0);
    expect(rows.filter((r) => r.on_board_reported != null).length).toBe(85);
  });
});
