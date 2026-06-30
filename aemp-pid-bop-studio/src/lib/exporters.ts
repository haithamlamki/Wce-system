// ============================================================================
//  Export helpers shared by the File menu and the Equipment Sheet.
//  CSV (no dep) here; the combined Excel workbook lives in xlsxExport.ts.
// ============================================================================
import type { Component, Project } from '../types';
import { STATUS_LABEL, statusOf } from './status';

export function download(content: BlobPart, filename: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Build the AEMP-compatible equipment register CSV (FR-28). */
export function buildEquipmentCsv(nodes: Component[], refDate: Date): string {
  const head = ['tag', 'description', 'system', 'rwp', 'size', 'manufacturer', 'serial', 'int_due', 'maj_due', 'status', 'on_rig'];
  const lines = [head.join(',')];
  for (const n of nodes) {
    lines.push([
      n.tag, n.description, n.section, n.rwp, n.size, n.manufacturer, n.serial,
      n.int_due, n.maj_due, STATUS_LABEL[statusOf(n, refDate)], n.removed ? 'removed' : 'installed',
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}

export const fileBase = (project: Project) => project.meta.rig.replace(/\s+/g, '_');

/** Download the equipment register as CSV. */
export function exportEquipmentCsv(project: Project, nodes: Component[], refDate: Date): void {
  download(buildEquipmentCsv(nodes, refDate), `${fileBase(project)}_register.csv`, 'text/csv');
}
