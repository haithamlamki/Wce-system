import { describe, expect, it } from 'vitest';
import { applyColumnSearch, filterByCompliance, paginate } from './filters';
import type { InspectionRecord } from '../types';

function rec(over: Partial<InspectionRecord>): InspectionRecord {
  return {
    id: Math.random().toString(36).slice(2), typeId: 't', partId: null, componentId: null,
    unitId: 'u', companyId: null, componentDescription: '', oem: 'SARA SAE',
    inspectionCompany: 'BUREAU VERITAS', serialNumber: 'A/81/2/1027', partNumber: 'N/A',
    workingStatus: 'in_use', manufactureYear: 2011,
    intermediateDate: '2025-08-14', intermediateFreqMonths: 12, intermediateDueDate: '2026-08-14',
    majorDate: '2021-01-31', majorFreqMonths: 60, majorDueDate: '2026-01-31',
    remarks: '', specs: {}, approveStatus: 'approved', approverId: null, rejectReason: null,
    category: 'well_control', typeName: 'Air pump', specFields: [],
    partName: 'Air pump 1', componentName: null, unitName: 'Rig 103', companyName: 'Abraj Oman',
    ...over,
  };
}

describe('applyColumnSearch', () => {
  const rows = [rec({ unitName: 'Rig 103' }), rec({ unitName: 'Rig 202', oem: 'Haulotte' })];
  it('matches case-insensitively per column, ANDing columns', () => {
    expect(applyColumnSearch(rows, { unit: 'rig 1' })).toHaveLength(1);
    expect(applyColumnSearch(rows, { unit: 'rig', oem: 'haul' })).toHaveLength(1);
    expect(applyColumnSearch(rows, {})).toHaveLength(2);
  });
});

describe('filterByCompliance', () => {
  const today = '2026-08-12';
  const rows = [
    rec({ majorDueDate: '2026-01-31', intermediateDueDate: null }),   // overdue
    rec({ majorDueDate: '2026-08-20', intermediateDueDate: null }),   // due soon
    rec({ majorDueDate: '2027-08-20', intermediateDueDate: null }),   // compliant
  ];
  it('buckets by worst-of record compliance', () => {
    expect(filterByCompliance(rows, 'overdue', today)).toHaveLength(1);
    expect(filterByCompliance(rows, 'due_soon', today)).toHaveLength(1);
    expect(filterByCompliance(rows, 'compliant', today)).toHaveLength(1);
    expect(filterByCompliance(rows, 'all', today)).toHaveLength(3);
  });
});

describe('paginate', () => {
  it('slices pages and reports totals', () => {
    const rows = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(rows, 1, 10).pageRows).toHaveLength(10);
    expect(paginate(rows, 3, 10).pageRows).toHaveLength(3);
    expect(paginate(rows, 3, 10).pages).toBe(3);
    expect(paginate(rows, 99, 10).pageRows).toHaveLength(0);
    expect(paginate(rows, 1, 10).total).toBe(23);
  });
});
