import { describe, expect, it } from 'vitest';
import {
  buildAlerts, complianceStatus, computeDueDate, daysUntil, recordCompliance,
} from './compliance';
import type { InspectionRecord, InspFile } from '../types';

const TODAY = '2026-08-12';

function rec(over: Partial<InspectionRecord>): InspectionRecord {
  return {
    id: 'r1', typeId: 't', partId: null, componentId: null, unitId: 'u', companyId: null,
    componentDescription: '', oem: '', inspectionCompany: '', serialNumber: 'SN-1',
    partNumber: '', workingStatus: 'in_use', manufactureYear: null,
    intermediateDate: null, intermediateFreqMonths: null, intermediateDueDate: null,
    majorDate: null, majorFreqMonths: null, majorDueDate: null,
    remarks: '', specs: {}, approveStatus: 'approved', approverId: null, rejectReason: null,
    category: 'well_control', typeName: 'Air pump', specFields: [],
    partName: null, componentName: null, unitName: 'Rig 103', companyName: null,
    ...over,
  };
}

describe('computeDueDate', () => {
  it('adds frequency months (mirrors DB trigger)', () => {
    expect(computeDueDate('2026-01-31', 12)).toBe('2027-01-31');
    expect(computeDueDate('2025-08-14', 12)).toBe('2026-08-14');
    expect(computeDueDate('2021-01-31', 60)).toBe('2026-01-31');
  });
  it('clamps to month end like Postgres make_interval', () => {
    expect(computeDueDate('2026-08-31', 6)).toBe('2027-02-28');
  });
  it('returns null when date or frequency missing', () => {
    expect(computeDueDate(null, 12)).toBeNull();
    expect(computeDueDate('2026-01-31', null)).toBeNull();
  });
});

describe('complianceStatus', () => {
  it('overdue when due date is in the past', () => {
    expect(complianceStatus('2026-08-11', TODAY)).toBe('overdue');
  });
  it('due_soon within 30 days inclusive', () => {
    expect(complianceStatus('2026-08-12', TODAY)).toBe('due_soon');
    expect(complianceStatus('2026-09-11', TODAY)).toBe('due_soon');
  });
  it('compliant beyond 30 days', () => {
    expect(complianceStatus('2026-09-12', TODAY)).toBe('compliant');
  });
  it('unknown when no due date', () => {
    expect(complianceStatus(null, TODAY)).toBe('unknown');
  });
});

describe('daysUntil', () => {
  it('negative when overdue, matches source system display', () => {
    expect(daysUntil('2026-08-10', TODAY)).toBe(-2);
    expect(daysUntil('2026-08-22', TODAY)).toBe(10);
    expect(daysUntil(null, TODAY)).toBeNull();
  });
});

describe('recordCompliance', () => {
  it('takes the worst of intermediate and major', () => {
    const r = rec({ intermediateDueDate: '2027-01-01', majorDueDate: '2026-01-01' });
    expect(recordCompliance(r, TODAY)).toBe('overdue');
  });
  it('unknown only when both dates missing', () => {
    expect(recordCompliance(rec({}), TODAY)).toBe('unknown');
    expect(recordCompliance(rec({ intermediateDueDate: '2027-01-01' }), TODAY)).toBe('compliant');
  });
});

describe('buildAlerts', () => {
  it('emits overdue + due_soon inspection alerts and expiring certificate alerts, overdue first', () => {
    const records = [
      rec({ id: 'a', serialNumber: 'SN-A', majorDueDate: '2026-08-01' }),          // overdue
      rec({ id: 'b', serialNumber: 'SN-B', intermediateDueDate: '2026-08-20' }),   // due soon
      rec({ id: 'c', serialNumber: 'SN-C', majorDueDate: '2027-08-01' }),          // compliant → none
    ];
    const files: InspFile[] = [{
      id: 'f1', recordId: 'a', kind: 'inspection_certificate',
      storagePath: 'records/a/inspection_certificate/cert.pdf', fileName: 'cert.pdf',
      fileSize: 1000, expiryDate: '2026-08-25', createdAt: '2026-01-01',
    }];
    const alerts = buildAlerts(records, files, TODAY);
    expect(alerts).toHaveLength(3);
    expect(alerts[0]).toMatchObject({ recordId: 'a', severity: 'overdue', kind: 'major' });
    expect(alerts.map((a) => a.kind)).toContain('certificate');
    expect(alerts.every((a) => a.daysUntil <= 30)).toBe(true);
  });
});
