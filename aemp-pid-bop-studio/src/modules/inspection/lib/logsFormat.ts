// ============================================================================
//  Pure helpers for the guide-parity features added in migration 0032:
//  change-log rendering (§5.9), upcoming-inspection urgency colours (§5.11.4)
//  and insp_* permission merging for the Users screen (§5.14).
// ============================================================================
import { APPROVE_STATUS_LABELS, WORKING_STATUS_LABELS } from '../types';
import { INSPECTION_PERMISSIONS } from './permissions';

const COLUMN_LABELS: Record<string, string> = {
  type_id: 'Equipment', part_id: 'Equipment Part', component_id: 'Part Component',
  unit_id: 'Unit', company_id: 'Company',
  component_description: 'Description', oem: 'OEM',
  inspection_company: 'Inspection Company', serial_number: 'Serial Number',
  part_number: 'Part Number', working_status: 'Working Status',
  manufacture_year: 'Manufacture Year',
  intermediate_date: 'Intermediate Inspection Date',
  intermediate_freq_months: 'Intermediate Frequency (months)',
  intermediate_due_date: 'Intermediate Due Date',
  major_date: 'Major Inspection Date',
  major_freq_months: 'Major Frequency (months)',
  major_due_date: 'Major Due Date',
  remarks: 'Remarks', specs: 'Specs',
  approve_status: 'Approve Status', approver_id: 'Approver',
  reject_reason: 'Reject Reason',
};

const VALUE_LABELS: Record<string, string> = {
  ...APPROVE_STATUS_LABELS, ...WORKING_STATUS_LABELS,
};

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${x ?? '—'}`).join('; ') || '—';
  }
  const s = String(v);
  return VALUE_LABELS[s] ?? s;
}

export interface ChangeRow { field: string; from: string; to: string }

/** {"col": [old, new], ...} → display rows, "Column: old value → new value". */
export function formatChanges(changes: Record<string, [unknown, unknown]>): ChangeRow[] {
  return Object.entries(changes).map(([col, [from, to]]) => ({
    field: COLUMN_LABELS[col] ?? col,
    from: renderValue(from),
    to: renderValue(to),
  }));
}

export type Urgency = 'red' | 'amber' | 'green';

/** Guide §5.11.4: red ≤ 7 days (or overdue), amber ≤ 14 days, green beyond. */
export function urgencyOf(daysUntilDue: number): Urgency {
  if (daysUntilDue <= 7) return 'red';
  if (daysUntilDue <= 14) return 'amber';
  return 'green';
}

/** set_user_permissions() replaces a user's FULL grant set (all modules), so the
 *  inspection Users screen must swap only the insp_* subset it owns. */
export function mergeModulePermissions(existing: string[], inspSelection: string[]): string[] {
  const inspSet = new Set<string>(INSPECTION_PERMISSIONS);
  return [...existing.filter((p) => !inspSet.has(p)), ...inspSelection];
}
