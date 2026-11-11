// ============================================================================
//  Annual Maintenance — Excel export in the office workbook's own layout, so a
//  plan can go back out to Excel, be edited by the planners and re-imported
//  (amImport reads this layout). Plus a department summary sheet.
// ============================================================================
import { breakdown, bySection, itemProgress, type AmItem, type AmPlan } from './am';

type Cell = string | number | boolean;
export type Aoa = Cell[][];

export const PLAN_HEADER = ['', 'SN', 'Equipment Description', 'Inspection Category', 'Interval', 'Inspection Status',
  'Scope of Work', 'Done', 'Responsible', 'Start Date', 'End Date', 'Progress', 'Status', 'Duration', 'Comments'];

const d = (iso: string | null) => iso ?? '';
const days = (i: AmItem) => (i.startDate && i.endDate
  ? Math.round((Date.parse(i.endDate) - Date.parse(i.startDate)) / 86400000) + 1 : '');

/** Header block + column header + section / item / task rows (dates as YYYY-MM-DD). */
export function planSheetAoa(plan: AmPlan, items: AmItem[]): Aoa {
  const b = breakdown(items);
  const rows: Aoa = [
    ['', '', 'Project Name', plan.title],
    ['', '', 'TOTAL TASKS', b.total, '', '', '', '', '', 'Duration', plan.allowedDays],
    ['', '', 'Completed', b.completed, '', '', '', '', '', 'Project Start', d(plan.plannedStart)],
    ['', '', 'In progress', b.inProgress, '', '', '', '', '', 'Project End', d(plan.plannedEnd), '', Math.round(b.progress * 100) / 100],
    ['', '', 'Not Started', b.notStarted],
    [],
    PLAN_HEADER,
  ];
  let section = '';
  for (const i of items) {
    if (i.section !== section) { section = i.section; rows.push(['', section]); }
    rows.push(['', i.sn ?? '', i.description, i.category, i.intervalText, i.applicability,
      `${i.tasks.filter((t) => t.done).length} of ${i.tasks.length} tasks done`, '', i.responsible,
      d(i.startDate), d(i.endDate), Math.round(itemProgress(i) * 100) / 100, i.status, days(i), i.comments]);
    for (const t of i.tasks) rows.push(['', '', '', '', '', '', `${t.seq}. ${t.description}`, t.done]);
  }
  return rows;
}

export function summaryAoa(plan: AmPlan, items: AmItem[]): Aoa {
  const all = breakdown(items);
  const line = (name: string, x: ReturnType<typeof breakdown>): Cell[] =>
    [name, x.total, x.completed, x.inProgress, x.notStarted, Math.round(x.progress * 100) / 100];
  return [
    ['MAINTENANCE PROGRESS DASHBOARD'],
    ['Project', plan.title, 'Project Start', d(plan.plannedStart), 'Project End', d(plan.plannedEnd)],
    [],
    ['By Department', 'Active Tasks', 'Completed', 'In Progress', 'Not Started', 'Progress %'],
    ...bySection(items).map((s) => line(s.section, s.b)),
    line('Total', all),
  ];
}

export async function downloadPlanWorkbook(plan: AmPlan, items: AmItem[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(planSheetAoa(plan, items));
  ws['!cols'] = [2, 6, 48, 12, 12, 16, 60, 7, 18, 12, 12, 9, 13, 9, 30].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Maintenance Plan');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa(plan, items)), 'Summary');
  const safe = plan.title.replace(/[^\w\- ]+/g, '').trim() || 'Maintenance Plan';
  XLSX.writeFile(wb, `${safe}.xlsx`);
}
