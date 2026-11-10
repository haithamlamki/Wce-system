// ============================================================================
//  Major Overhaul — multi-sheet Excel export (the HTML's "Export Excel").
//  Sheet builders are pure (array-of-arrays) so they are unit-tested; only
//  writeWorkbook() loads SheetJS, on demand, like the other xlsx paths.
// ============================================================================
import {
  currencyText, projectKey, summarize,
  type CostSummary, type Currency, type MohProject, type PlanRow, type Rig, type RigMeta,
} from './moh';

export type Aoa = (string | number)[][];
export interface Sheet { name: string; rows: Aoa }

const interval = (r: PlanRow) => (r.item.interval
  ? r.item.basis === 'hours' ? `${r.item.interval} h` : `${r.item.interval} yr` : '');
const SOURCE = { manual: 'Manual', inspection: 'Inspection', none: '' } as const;

export const STATUS_TEXT: Record<string, string> = {
  OVERDUE: 'Overdue', 'DUE THIS YEAR': 'Due this year', 'DUE NEXT YEAR': 'Due next year', PLANNED: 'Planned',
  'NOT DUE IN PLAN': 'Not due in plan', 'NO LAST MOH DATA': 'No last MOH data', 'NOT APPLICABLE': 'Not applicable',
};

/** One line per plan row; year cells show the project status (or `MOH`). */
export function planSheet(rows: PlanRow[], years: number[], projects: ReadonlyMap<string, MohProject>, withRig: boolean): Aoa {
  const head = [...(withRig ? ['Rig'] : []), 'S.No.', 'Equipment', 'Category', 'Asset No.', 'Equipment No.', 'Interval',
    'Source', 'Last MOH', 'Next MOH', 'Status', 'Status detail', ...years.map(String), 'Remarks'];
  return [head, ...rows.map((r) => [
    ...(withRig ? [r.rigName] : []), r.item.sno, r.item.description, r.item.category,
    r.unit?.assetNumber ?? '', r.unit?.equipmentNumber ?? '', interval(r), SOURCE[r.source], r.lastLabel,
    r.calc.nextDue, STATUS_TEXT[r.calc.status], r.calc.detail,
    ...years.map((y) => (r.calc.years.includes(y)
      ? projects.get(projectKey(r.rigId, r.item.id, r.unit?.id ?? null, y))?.status ?? 'MOH' : '')),
    r.unit?.remarks ?? '',
  ])];
}

/** Every planned occurrence (applicable rows, plan years) with project details and cost. */
export function projectsSheet(
  rows: PlanRow[], years: number[], projects: ReadonlyMap<string, MohProject>, currencyOf: (rigId: string) => Currency,
): Aoa {
  const body: Aoa = [];
  for (const r of rows) {
    if (!r.applicable) continue;
    for (const y of r.calc.years) {
      if (!years.includes(y)) continue;
      const p = projects.get(projectKey(r.rigId, r.item.id, r.unit?.id ?? null, y));
      body.push([r.rigName, y, r.item.description, r.unit?.assetNumber || r.unit?.equipmentNumber || '',
        p?.status ?? 'Not Started', p?.plannedMonth ?? '', p?.startDate ?? '', p?.durationDays ?? '', p?.vendor ?? '',
        p?.responsible ?? '', p?.prNumber ?? '', p?.poNumber ?? '', currencyOf(r.rigId), p?.estimatedCost ?? '', p?.comments ?? '']);
    }
  }
  body.sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }) || Number(a[1]) - Number(b[1]));
  return [['Rig', 'Year', 'Equipment', 'Asset No.', 'Status', 'Planned month', 'Start date', 'Duration (days)',
    'Vendor / workshop', 'Responsible', 'PR number', 'PO number', 'Currency', 'Estimated cost', 'Comments'], ...body];
}

/** Year → MOH count + budget per currency. */
export function annualSheet(rows: PlanRow[], years: number[], cost: CostSummary): Aoa {
  const s = summarize(rows, years);
  return [['Year', 'Planned MOHs', 'Estimated cost'],
    ...years.map((y) => [y, s.annual[y], currencyText(cost.byYear[y] ?? {})]),
    ['Total', s.projects, currencyText(cost.total)]];
}

/** Rig × year counts with totals, plus each rig's budget. */
export function matrixSheet(rigs: Rig[], rows: PlanRow[], years: number[], cost: CostSummary): Aoa {
  const all = summarize(rows, years);
  const out: Aoa = [['Rig', ...years.map(String), 'Total', 'Estimated cost']];
  for (const rig of rigs) {
    const s = summarize(rows.filter((r) => r.rigId === rig.id), years);
    out.push([rig.name, ...years.map((y) => s.annual[y]), s.projects, currencyText(cost.byRig[rig.id] ?? {})]);
  }
  out.push(['All rigs', ...years.map((y) => all.annual[y]), all.projects, currencyText(cost.total)]);
  return out;
}

export function rigSummarySheet(
  rigs: Rig[], rows: PlanRow[], years: number[], meta: ReadonlyMap<string, RigMeta>, clientOf: (rigId: string) => string,
): Aoa {
  const out: Aoa = [['Rig', 'Client', 'Location', 'Equipment units', 'Overdue', 'Due this year', 'Due next year',
    'Missing last MOH', `MOH ${years[0]}–${years[years.length - 1]}`]];
  for (const rig of rigs) {
    const s = summarize(rows.filter((r) => r.rigId === rig.id), years);
    out.push([rig.name, clientOf(rig.id), meta.get(rig.id)?.location ?? '',
      s.units, s.overdue, s.dueThis, s.dueNext, s.missing, s.projects]);
  }
  return out;
}

/** Report header lines placed above a sheet's table. */
export function withTitle(title: string, lines: string[], rows: Aoa): Aoa {
  return [[title], ...lines.map((l) => [l]), [], ...rows];
}

const safeName = (n: string) => n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

export async function writeWorkbook(fileName: string, sheets: Sheet[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    const widths: number[] = [];
    for (const r of sh.rows) {
      if (r.length < 2) continue; // title lines would blow up column A
      r.forEach((c, i) => { widths[i] = Math.min(48, Math.max(widths[i] ?? 8, String(c ?? '').length + 2)); });
    }
    ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, safeName(sh.name));
  }
  XLSX.writeFile(wb, fileName);
}
