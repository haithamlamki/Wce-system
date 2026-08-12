// ============================================================================
//  Inspection compliance — pure date math. RAG status is DERIVED, never stored
//  (enhancement over the source system, which shows status but lets it drift).
//  computeDueDate mirrors the 0030 DB trigger exactly (month-end clamping).
// ============================================================================
import type { InspFile, InspectionRecord } from '../types';
import { FILE_KIND_LABELS } from '../types';

export type ComplianceStatus = 'overdue' | 'due_soon' | 'compliant' | 'unknown';

export const DUE_SOON_DAYS = 30;

const MS_PER_DAY = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysUntil(dueIso: string | null | undefined, todayIso: string): number | null {
  if (!dueIso) return null;
  return Math.round((toUtc(dueIso) - toUtc(todayIso)) / MS_PER_DAY);
}

export function complianceStatus(dueIso: string | null | undefined, todayIso: string): ComplianceStatus {
  const days = daysUntil(dueIso, todayIso);
  if (days === null) return 'unknown';
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due_soon';
  return 'compliant';
}

/** date + N months with Postgres-style month-end clamping; null-safe. */
export function computeDueDate(dateIso: string | null | undefined, freqMonths: number | null | undefined): string | null {
  if (!dateIso || !freqMonths) return null;
  const [y, m, d] = dateIso.split('-').map(Number);
  const targetMonth = m - 1 + freqMonths;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const due = new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay)));
  return due.toISOString().slice(0, 10);
}

const SEVERITY_RANK: Record<ComplianceStatus, number> = {
  overdue: 0, due_soon: 1, compliant: 2, unknown: 3,
};

export function recordCompliance(
  rec: Pick<InspectionRecord, 'intermediateDueDate' | 'majorDueDate'>,
  todayIso: string,
): ComplianceStatus {
  const a = complianceStatus(rec.intermediateDueDate, todayIso);
  const b = complianceStatus(rec.majorDueDate, todayIso);
  if (a === 'unknown' && b === 'unknown') return 'unknown';
  const known = [a, b].filter((s) => s !== 'unknown');
  return known.sort((x, y) => SEVERITY_RANK[x] - SEVERITY_RANK[y])[0];
}

export interface AlertItem {
  id: string;
  recordId: string;
  severity: 'overdue' | 'due_soon';
  kind: 'intermediate' | 'major' | 'certificate';
  label: string;       // e.g. "SN-A — Major inspection" / "SN-A — Inspection Certificate expiry"
  dueDate: string;
  daysUntil: number;
}

/** Overdue + due-soon inspections and expiring certificates, worst first. */
export function buildAlerts(
  records: InspectionRecord[],
  files: InspFile[],
  todayIso: string,
): AlertItem[] {
  const alerts: AlertItem[] = [];
  const push = (recordId: string, kind: AlertItem['kind'], label: string, due: string) => {
    const status = complianceStatus(due, todayIso);
    if (status !== 'overdue' && status !== 'due_soon') return;
    alerts.push({
      id: `${recordId}:${kind}:${due}`, recordId, kind, label,
      severity: status, dueDate: due, daysUntil: daysUntil(due, todayIso) ?? 0,
    });
  };
  for (const r of records) {
    if (r.intermediateDueDate) push(r.id, 'intermediate', `${r.serialNumber || r.typeName} — Intermediate inspection`, r.intermediateDueDate);
    if (r.majorDueDate) push(r.id, 'major', `${r.serialNumber || r.typeName} — Major inspection`, r.majorDueDate);
  }
  const bySerial = new Map(records.map((r) => [r.id, r.serialNumber || r.typeName]));
  for (const f of files) {
    if (f.expiryDate) {
      push(f.recordId, 'certificate',
        `${bySerial.get(f.recordId) ?? f.fileName} — ${FILE_KIND_LABELS[f.kind]} expiry`, f.expiryDate);
    }
  }
  return alerts.sort((x, y) =>
    x.severity === y.severity ? x.daysUntil - y.daysUntil : x.severity === 'overdue' ? -1 : 1);
}
