import { describe, expect, it } from 'vitest';
import { recordsToCsv } from './exportCsv';
import type { InspectionRecord } from '../types';

const base: InspectionRecord = {
  id: 'x', typeId: 't', partId: null, componentId: null, unitId: 'u', companyId: null,
  componentDescription: 'Air pump', oem: 'SARA, SAE', inspectionCompany: 'BV',
  serialNumber: 'A"1', partNumber: 'N/A', workingStatus: 'in_use', manufactureYear: 2011,
  intermediateDate: '2025-08-14', intermediateFreqMonths: 12, intermediateDueDate: '2026-08-14',
  majorDate: '2021-01-31', majorFreqMonths: 60, majorDueDate: '2026-01-31',
  remarks: '', specs: { 'Size (in)': '8.5' }, approveStatus: 'approved',
  approverId: null, rejectReason: null, category: 'well_control', typeName: 'Air pump',
  specFields: [], partName: 'Air pump 1', componentName: null,
  unitName: 'Rig 103', companyName: 'Abraj Oman',
};

describe('recordsToCsv', () => {
  it('emits a header and one line per record', () => {
    const csv = recordsToCsv([base]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Serial Number');
    expect(lines[1]).toContain('Rig 103');
  });
  it('escapes commas and quotes RFC-4180 style', () => {
    const csv = recordsToCsv([base]);
    expect(csv).toContain('"SARA, SAE"');
    expect(csv).toContain('"A""1"');
  });
});
