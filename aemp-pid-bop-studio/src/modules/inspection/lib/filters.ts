// ============================================================================
//  Pure client-side filtering for the inspection tables: per-column contains
//  search (the source system's under-header search boxes), RAG compliance
//  bucket filter, and simple pagination.
// ============================================================================
import { APPROVE_STATUS_LABELS, CATEGORY_LABELS, WORKING_STATUS_LABELS,
  frequencyLabel, type InspectionRecord } from '../types';
import { recordCompliance, type ComplianceStatus } from './compliance';

export const SEARCHABLE_COLUMNS: Record<string, (r: InspectionRecord) => string> = {
  company: (r) => r.companyName ?? '',
  unit: (r) => r.unitName,
  category: (r) => CATEGORY_LABELS[r.category],
  equipment: (r) => r.typeName,
  part: (r) => r.partName ?? '',
  component: (r) => r.componentName ?? '',
  description: (r) => r.componentDescription,
  oem: (r) => r.oem,
  status: (r) => WORKING_STATUS_LABELS[r.workingStatus],
  serial: (r) => r.serialNumber,
  partNumber: (r) => r.partNumber,
  inspectionCompany: (r) => r.inspectionCompany,
  approveStatus: (r) => APPROVE_STATUS_LABELS[r.approveStatus],
  intermediateDate: (r) => r.intermediateDate ?? '',
  intermediateDue: (r) => r.intermediateDueDate ?? '',
  intermediateFreq: (r) => r.intermediateFreqMonths ? frequencyLabel(r.intermediateFreqMonths) : '',
  majorDate: (r) => r.majorDate ?? '',
  majorDue: (r) => r.majorDueDate ?? '',
  majorFreq: (r) => r.majorFreqMonths ? frequencyLabel(r.majorFreqMonths) : '',
  year: (r) => r.manufactureYear?.toString() ?? '',
  remarks: (r) => r.remarks,
};

export function applyColumnSearch(
  rows: InspectionRecord[],
  search: Record<string, string>,
): InspectionRecord[] {
  const active = Object.entries(search).filter(([, v]) => v.trim() !== '');
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every(([key, needle]) => {
      const get = SEARCHABLE_COLUMNS[key];
      return get ? get(r).toLowerCase().includes(needle.trim().toLowerCase()) : true;
    }));
}

export function filterByCompliance(
  rows: InspectionRecord[],
  status: ComplianceStatus | 'all',
  todayIso: string,
): InspectionRecord[] {
  if (status === 'all') return rows;
  return rows.filter((r) => recordCompliance(r, todayIso) === status);
}

export function paginate<T>(rows: T[], page: number, perPage: number) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  return { pageRows: rows.slice(start, start + perPage), total, pages };
}
