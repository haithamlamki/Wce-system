// ============================================================================
//  Combined Excel export (FR — "extract P&ID and equipment in one workbook").
//  Equipment register tab + a P&ID tab (equipment placements + piping).
//  SheetJS is lazy-loaded (heavy) like the import path.
// ============================================================================
import type { Project } from '../types';
import { STATUS_LABEL, statusOf } from './status';
import { SYM, type SymbolKey } from './symbols';
import { fileBase } from './exporters';

export async function exportWorkbook(project: Project, refDate: Date): Promise<void> {
  const XLSX = await import('xlsx');
  const nm = (n: { type: string }) => SYM[n.type as SymbolKey]?.name ?? n.type;

  // ---- Equipment tab ----
  const equipment = project.nodes.map((n) => ({
    Tag: n.tag, Symbol: nm(n), Description: n.description, System: n.section,
    RWP: n.rwp, Size: n.size, Manufacturer: n.manufacturer, Serial: n.serial,
    'Interm. due': n.int_due, 'Major due': n.maj_due,
    Status: STATUS_LABEL[statusOf(n, refDate)], 'On rig': n.removed ? 'removed' : 'installed',
  }));

  // ---- P&ID tab (placements + piping, stacked) ----
  const aoa: Array<Array<string | number>> = [];
  aoa.push([`P&ID — ${project.meta.rig}`, '', '', `Ref ${project.meta.date || '—'}`]);
  aoa.push([]);
  aoa.push(['EQUIPMENT PLACEMENTS']);
  aoa.push(['Tag', 'Symbol', 'Description', 'System', 'X', 'Y', 'Status']);
  for (const n of project.nodes) {
    aoa.push([n.tag, nm(n), n.description, n.section, Math.round(n.x), Math.round(n.y), STATUS_LABEL[statusOf(n, refDate)]]);
  }
  aoa.push([]);
  aoa.push([`PIPING (${project.pipes.length} runs)`]);
  aoa.push(['#', 'X1', 'Y1', 'X2', 'Y2', 'Colour']);
  project.pipes.forEach((p, i) => aoa.push([i + 1, p[0], p[1], p[2], p[3], p[4]]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(equipment), 'Equipment');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'P&ID');
  XLSX.writeFile(wb, `${fileBase(project)}_pid_equipment.xlsx`);
}
