// ============================================================================
//  CSV export of inspection records — column order matches the source
//  system's register export.
// ============================================================================
import type { InspectionRecord } from '../types';
import { APPROVE_STATUS_LABELS, CATEGORY_LABELS, WORKING_STATUS_LABELS, frequencyLabel } from '../types';

const COLUMNS: [string, (r: InspectionRecord) => string][] = [
  ['Company', (r) => r.companyName ?? ''],
  ['Unit', (r) => r.unitName],
  ['Equipment Category', (r) => CATEGORY_LABELS[r.category]],
  ['Equipment', (r) => r.typeName],
  ['Equipment Part', (r) => r.partName ?? ''],
  ['Equipment Part Component', (r) => r.componentName ?? ''],
  ['Description', (r) => r.componentDescription],
  ['OEM', (r) => r.oem],
  ['Serial Number', (r) => r.serialNumber],
  ['Part Number', (r) => r.partNumber],
  ['Working Status', (r) => WORKING_STATUS_LABELS[r.workingStatus]],
  ['Manufacture Year', (r) => r.manufactureYear?.toString() ?? ''],
  ['Intermediate Inspection Date', (r) => r.intermediateDate ?? ''],
  ['Intermediate Inspection Frequency', (r) => r.intermediateFreqMonths ? frequencyLabel(r.intermediateFreqMonths) : ''],
  ['Intermediate Inspection Due Date', (r) => r.intermediateDueDate ?? ''],
  ['Major Inspection Date', (r) => r.majorDate ?? ''],
  ['Major Inspection Frequency', (r) => r.majorFreqMonths ? frequencyLabel(r.majorFreqMonths) : ''],
  ['Major Inspection Due Date', (r) => r.majorDueDate ?? ''],
  ['Inspection Company', (r) => r.inspectionCompany],
  ['Approve Status', (r) => APPROVE_STATUS_LABELS[r.approveStatus]],
  ['Remarks', (r) => r.remarks],
  ['Specs', (r) => Object.entries(r.specs).map(([k, v]) => `${k}: ${v}`).join('; ')],
];

function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function recordsToCsv(rows: InspectionRecord[]): string {
  const header = COLUMNS.map(([h]) => esc(h)).join(',');
  const lines = rows.map((r) => COLUMNS.map(([, get]) => esc(get(r))).join(','));
  return [header, ...lines].join('\n') + '\n';
}

export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}
