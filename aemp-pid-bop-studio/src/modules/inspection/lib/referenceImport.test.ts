import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { isReferenceExport, parseReferenceExport, planCatalogAdditions,
  EQUIPMENT_CATEGORY_MAP, REFERENCE_HEADERS } from './referenceImport';
import type { Company, EquipmentPart, EquipmentType, InspUnit, PartComponent } from '../types';

function refWb(rows: (string | number)[][]): XLSX.WorkBook {
  const header = [...REFERENCE_HEADERS, 'Working Pressure(Psi)', 'Size(in)'];
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Equipment Inspection');
  return wb;
}

// Company, Unit, Equipment, Part, Component, Description, OEM, Status, Serial,
// PartNo, InspCo, iDate, iDue, iFreq, mDate, mDue, mFreq, Year, Remarks, WP, Size
const ROW = ['ABRAJ', 'Rig 103', 'Air pump', 'Air pump 1', '', 'Air pump', 'SARA SAE',
  'In Use', 'SN-1', 'N/A', 'BUREAU VERITAS', '2025-08-14', '2026-08-14', '1 Year',
  '2021-01-31', '2026-01-31', '5 Year', '24-Sep-2011', 'note', '5000', '3'];

describe('isReferenceExport', () => {
  it('detects the source export layout and rejects the template layout', () => {
    expect(isReferenceExport(refWb([ROW]))).toBe(true);
    const other = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(other,
      XLSX.utils.aoa_to_sheet([['Equipment', 'Equipment Part'], ['x', 'y']]), 'S');
    expect(isReferenceExport(other)).toBe(false);
  });
});

describe('parseReferenceExport', () => {
  it('normalises statuses, frequencies, years and spec columns', () => {
    const { rows } = parseReferenceExport(refWb([ROW]));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.status).toBe('in_use');
    expect(r.intermediateFreqMonths).toBe(12);
    expect(r.majorFreqMonths).toBe(60);
    expect(r.manufactureYear).toBe(2011);
    expect(r.specs).toEqual({ 'Working Pressure(Psi)': '5000', 'Size(in)': '3' });
    expect(r.inspectionCompany).toBe('BUREAU VERITAS');
  });

  it('treats out-of-range years (Excel artifacts like 1905) as unknown', () => {
    const artifact = [...ROW]; artifact[17] = '05/07/1905'; artifact[8] = 'SN-Y';
    const { rows } = parseReferenceExport(refWb([artifact]));
    expect(rows[0].manufactureYear).toBeNull();
  });

  it('maps unknown statuses to in_use and dash inspection company to empty', () => {
    const bad = [...ROW]; bad[7] = 'BUREAU VERITAS'; bad[10] = '-'; bad[8] = 'SN-2';
    const { rows } = parseReferenceExport(refWb([bad]));
    expect(rows[0].status).toBe('in_use');
    expect(rows[0].inspectionCompany).toBe('');
  });

  it('drops in-file Unit+Serial duplicates, first wins, case-insensitively', () => {
    const dupe = [...ROW]; dupe[1] = 'rig 103'; dupe[8] = 'sn-1';
    const other = [...ROW]; other[8] = 'SN-9';
    const { rows, skippedDuplicates } = parseReferenceExport(refWb([ROW, dupe, other]));
    expect(rows).toHaveLength(2);
    expect(skippedDuplicates).toBe(1);
  });
});

describe('planCatalogAdditions', () => {
  const ctx = {
    types: [{ id: 't1', category: 'well_control', name: 'Air pump', description: '',
      specFields: [], active: true }] as EquipmentType[],
    parts: [{ id: 'p1', typeId: 't1', name: 'Air pump 1', description: '', position: 1 }] as EquipmentPart[],
    components: [] as PartComponent[],
    units: [{ id: 'u1', name: 'Rig 103', unitType: 'rig' }] as InspUnit[],
    companies: [{ id: 'c1', name: 'Abraj Oman' }] as Company[],
  };

  it('plans only what is missing, with categories from the snapshot', () => {
    const mast = [...ROW]; mast[2] = 'Mast'; mast[3] = 'Crown'; mast[4] = 'Sheave'; mast[8] = 'SN-3';
    const { rows } = parseReferenceExport(refWb([ROW, mast]));
    const plan = planCatalogAdditions(rows, ctx);
    expect(plan.companies).toEqual(['ABRAJ']);
    expect(plan.types).toHaveLength(1);
    expect(plan.types[0]).toMatchObject({ name: 'Mast', category: 'drilling' });
    expect(plan.parts).toEqual([{ equipment: 'Mast', name: 'Crown' }]);
    expect(plan.components).toEqual([{ equipment: 'Mast', part: 'Crown', name: 'Sheave' }]);
    expect(plan.unknownUnits).toEqual([]);
  });

  it('reports unknown units instead of inventing them', () => {
    const far = [...ROW]; far[1] = 'Rig 999'; far[8] = 'SN-4';
    const { rows } = parseReferenceExport(refWb([far]));
    expect(planCatalogAdditions(rows, ctx).unknownUnits).toEqual(['Rig 999']);
  });

  it('snapshot map covers the seven system categories', () => {
    expect(EQUIPMENT_CATEGORY_MAP.get('annular bop')).toBe('well_control');
    expect(EQUIPMENT_CATEGORY_MAP.get('mud pump')).toBe('circulation');
    expect(EQUIPMENT_CATEGORY_MAP.get('rotary table')).toBe('rotary');
    expect(EQUIPMENT_CATEGORY_MAP.get('ac generator')).toBe('power');
    expect(EQUIPMENT_CATEGORY_MAP.get('draw works')).toBe('hoisting');
    expect(EQUIPMENT_CATEGORY_MAP.get('fire extinguisher')).toBe('others');
    expect(EQUIPMENT_CATEGORY_MAP.get('mast')).toBe('drilling');
  });
});
