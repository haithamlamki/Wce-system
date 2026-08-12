import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, type ImportContext } from './workbookImport';
import { TEMPLATE_HEADERS } from './template';

const ctx: ImportContext = {
  category: 'well_control',
  types: [{ id: 'T1', category: 'well_control', name: 'Air pump', description: '', specFields: [], active: true }],
  parts: [{ id: 'P1', typeId: 'T1', name: 'Air pump 1', description: '', position: 1 }],
  components: [],
  units: [{ id: 'U1', name: 'Rig 103', unitType: 'rig' }],
  companies: [{ id: 'C1', name: 'Abraj Oman' }],
};

function wbOf(rows: (string | number)[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]), 'Data');
  return wb;
}

describe('parseWorkbook', () => {
  it('resolves names to ids and parses labels', () => {
    const { rows, errors } = parseWorkbook(wbOf([[
      'Air pump', 'Air pump 1', '', 'Air pump', 'Rig 103', 'Abraj Oman', 'SARA SAE',
      'BUREAU VERITAS', 'AP-1', 'N/A', 'In Use', 2011,
      '2025-08-14', '1 Year', '2021-01-31', '5 Year', 'ok',
    ]]), ctx);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type_id: 'T1', part_id: 'P1', unit_id: 'U1', company_id: 'C1',
      working_status: 'in_use', manufacture_year: 2011,
      intermediate_date: '2025-08-14', intermediate_freq_months: 12,
      major_date: '2021-01-31', major_freq_months: 60,
    });
  });
  it('reports row-numbered errors for unknown names and bad dates', () => {
    const { rows, errors } = parseWorkbook(wbOf([
      ['Nope', '', '', '', 'Rig 103', '', '', '', '', '', 'In Use', '', '', '', '', '', ''],
      ['Air pump', '', '', '', 'Rig 999', '', '', '', '', '', 'In Use', '', '14/08/2025', '1 Year', '', '', ''],
    ]), ctx);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.includes('Row 2') && e.includes('Nope'))).toBe(true);
    expect(errors.some((e) => e.includes('Row 3') && e.includes('Rig 999'))).toBe(true);
    expect(errors.some((e) => e.includes('Row 3') && e.includes('date'))).toBe(true);
  });
  it('skips fully empty rows', () => {
    const { rows, errors } = parseWorkbook(wbOf([['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]), ctx);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});
