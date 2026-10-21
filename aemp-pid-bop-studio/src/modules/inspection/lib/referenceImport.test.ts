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

  it('keeps records sharing a Unit+Serial when equipment or part differ', () => {
    const otherPart = [...ROW]; otherPart[3] = 'Air pump 2';
    const { rows, skippedDuplicates } = parseReferenceExport(refWb([ROW, otherPart]));
    expect(rows).toHaveLength(2);
    expect(skippedDuplicates).toBe(0);
  });
});

// Oct-2026 layout: Category column, reordered base columns, renamed
// "Manufacture Year", extra non-spec columns and the approval workflow block.
const V2_HEADER = ['Company', 'Unit', 'Category', 'Equipment', 'Equipment Part', 'Component',
  'Component Description', 'Serial Number', 'Part Number', 'OEM', 'Inspection Company', 'Status',
  'Intermediate Inspection Date', 'Intermediate Inspection Due Date', 'Intermediate Inspection Frequency',
  'Major Inspection Date', 'Major Inspection Due Date', 'Major Inspection Frequency',
  'Manufacture Year', 'Working Pressure(Psi)', 'Grade()', 'Elastomer Description',
  'Inspection Report', 'Remarks', 'Approve Status', 'Approval Requested By',
  'Approval Requested Date', 'Approval Requested For', 'Approved By', 'Approved Date'];
const V2_ROW = ['Abraj ', 'hoist 2', 'Power System', 'Air pump', 'Air pump 1', 'Valve',
  'desc', 'SN-7', 'PN-1', 'SARA SAE', 'BUREAU VERITAS', 'Defected',
  '2025-08-14', '2026-08-14', '6 Months', '', '', '',
  '2015', '5000', 'G105', 'NBR', 'RPT-1', 'note', 'Pending Approval', 'Requester A',
  '2026-09-29', 'Approver B', '', ''];

function v2Wb(rows: (string | number)[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([V2_HEADER, ...rows]), 'Equipment Inspection');
  return wb;
}

describe('reference export, Oct-2026 layout', () => {
  it('is detected by header names, not position', () => {
    expect(isReferenceExport(v2Wb([V2_ROW]))).toBe(true);
  });

  it('reads columns by name, keeps category and only true spec columns', () => {
    const { rows } = parseReferenceExport(v2Wb([V2_ROW]));
    const r = rows[0];
    expect(r).toMatchObject({
      company: 'Abraj', unit: 'hoist 2', equipment: 'Air pump', part: 'Air pump 1',
      component: 'Valve', description: 'desc', serial: 'SN-7', partNumber: 'PN-1',
      oem: 'SARA SAE', status: 'defected', category: 'power',
      intermediateDate: '2025-08-14', intermediateFreqMonths: 6,
      majorDate: null, majorFreqMonths: null, manufactureYear: 2015,
      remarks: 'note', elastomer: 'NBR', inspectionReport: 'RPT-1',
    });
    expect(r.specs).toEqual({ 'Working Pressure(Psi)': '5000', 'Grade()': 'G105' });
  });

  it('carries the approval workflow block', () => {
    const approved = [...V2_ROW]; approved[7] = 'SN-8';
    approved[24] = 'Approved'; approved[28] = '20465'; approved[29] = '2026-10-11';
    const { rows } = parseReferenceExport(v2Wb([V2_ROW, approved]));
    expect(rows[0].approval).toEqual({
      status: 'pending_approval', requestedBy: 'Requester A', requestedAt: '2026-09-29',
      requestedFor: 'Approver B', approvedBy: null, approvedAt: null,
    });
    expect(rows[1].approval).toMatchObject({
      status: 'approved', approvedBy: '20465', approvedAt: '2026-10-11',
    });
  });

  it('defaults approval to approved and category to null for the Aug layout', () => {
    const { rows } = parseReferenceExport(refWb([ROW]));
    expect(rows[0].category).toBeNull();
    expect(rows[0].approval.status).toBe('approved');
  });

  it('uses the file category for new equipment types', () => {
    const { rows } = parseReferenceExport(v2Wb([V2_ROW]));
    const plan = planCatalogAdditions(rows, {
      types: [], parts: [], components: [], units: [], companies: [],
    });
    expect(plan.types[0]).toMatchObject({ name: 'Air pump', category: 'power' });
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
