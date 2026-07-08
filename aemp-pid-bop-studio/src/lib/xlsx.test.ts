import { describe, expect, it } from 'vitest';
import { MAX_XLSX_BYTES, parseXlsx } from './xlsx';

async function buildWorkbook(rows: Record<string, string | number>[]): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

describe('parseXlsx', () => {
  it('parses a valid workbook into lower-cased header-keyed rows', async () => {
    const buf = await buildWorkbook([{ Tag: 'V1', Serial: 'SN1' }, { Tag: 'V2', Serial: 'SN2' }]);
    const rows = await parseXlsx(buf);
    expect(rows).toEqual([
      { tag: 'V1', serial: 'SN1' },
      { tag: 'V2', serial: 'SN2' },
    ]);
  });

  it('rejects an oversized ArrayBuffer with a clean size error', async () => {
    const buf = new ArrayBuffer(MAX_XLSX_BYTES + 1);
    await expect(parseXlsx(buf)).rejects.toThrow('Spreadsheet too large (max 15 MB).');
  });

  it('rejects a garbage/non-xlsx ArrayBuffer with a clean corrupt-file error, not a raw error', async () => {
    // A truncated ZIP local-file-header signature: looks enough like an .xlsx (a ZIP
    // container) for SheetJS to attempt to unzip it, but it is corrupt and fails.
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(0)]);
    let caught: unknown;
    try {
      await parseXlsx(bytes.buffer);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      'Could not read this spreadsheet — it may be corrupt or not a valid .xlsx file.'
    );
  });
});
