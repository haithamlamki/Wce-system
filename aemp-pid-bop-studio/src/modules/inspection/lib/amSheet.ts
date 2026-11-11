// ============================================================================
//  Annual Maintenance — the "Maintenance Plan" sheet as an in-system form.
//  Pure model for views/AmSheetView: the sheet's own formulas (tasks done,
//  progress, status, duration, header totals), the edits a planner makes
//  (lines, checklist rows, sections) and the checks the workbook's data
//  validation enforced. Saving goes through insp_am_import like a re-import.
// ============================================================================
import { AM_SECTIONS, daysBetween, type AmItem, type AmTask, type Applicability, type ItemStatus } from './am';

export interface SheetDraft {
  rigId: string; title: string; plannedStart: string | null; plannedEnd: string | null; items: AmItem[];
}

// ---- the sheet's formulas -----------------------------------------------------

/** L: COUNTIF(done)/COUNTA(tasks); null when the line has no checklist (the sheet shows blank). */
export function sheetProgress(i: AmItem): number | null {
  return i.tasks.length ? i.tasks.filter((t) => t.done).length / i.tasks.length : null;
}

/** M: Not applicable → Completed (offline or all ticked) → In Progress → Not Started. */
export function sheetStatus(i: AmItem): ItemStatus {
  if (i.applicability === 'Not applicable') return 'Not applicable';
  const p = sheetProgress(i) ?? 0;
  if (i.applicability === 'Completed Offline' || p >= 1) return 'Completed';
  return p > 0 ? 'In Progress' : 'Not Started';
}

/** G (master row): "x of y tasks done". */
export const tasksDoneText = (i: AmItem) => `${i.tasks.filter((t) => t.done).length} of ${i.tasks.length} tasks done`;

/** N: inclusive days, blank when not applicable or a date is missing. */
export const sheetDuration = (i: AmItem) => (i.applicability === 'Not applicable' ? null : daysBetween(i.startDate, i.endDate));

export interface SheetTotals { totalTasks: number; completed: number; inProgress: number; notStarted: number; progress: number; duration: number | null }

/** The header block (D2:D5, K2, M4). Progress is the workbook's Overall Progress formula. */
export function sheetTotals(d: SheetDraft): SheetTotals {
  const active = d.items.filter((i) => i.applicability !== 'Not applicable');
  const status = d.items.map(sheetStatus);
  const sum = active.reduce((s, i) => s + (i.applicability === 'Completed Offline' ? 1 : sheetProgress(i) ?? 0), 0);
  return {
    totalTasks: active.length,
    completed: status.filter((s) => s === 'Completed').length,
    inProgress: status.filter((s) => s === 'In Progress').length,
    notStarted: status.filter((s) => s === 'Not Started').length,
    progress: active.length ? sum / active.length : 0,
    duration: daysBetween(d.plannedStart, d.plannedEnd),
  };
}

/** The plan year: from the project name ("Rig305 AM-2026"), else the start date, else this year. */
export function sheetYear(d: SheetDraft, today: string): number {
  const m = d.title.match(/(?:^|\D)(20\d{2})(?!\d)/);
  return m ? Number(m[1]) : Number((d.plannedStart ?? today).slice(0, 4));
}

/** Every line with its status recomputed, ready for insp_am_import. */
export function finalizeItems(items: AmItem[]): AmItem[] {
  return items.map((i) => {
    const out: AmItem = {
      ...i, description: i.description.trim(), responsible: i.responsible.trim(),
      startDate: i.applicability === 'Not applicable' ? null : i.startDate,
      endDate: i.applicability === 'Not applicable' ? null : i.endDate,
      tasks: i.tasks.filter((t) => t.description.trim()).map((t, n) => ({ ...t, seq: n + 1, description: t.description.trim() })),
    };
    // Status after blank checklist rows are dropped, so they don't count as undone tasks.
    return { ...out, status: sheetStatus(out) };
  });
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The workbook's number formats: d-mmm-yy on the lines, d/mmm/yy in the header. */
export function sheetDate(iso: string | null, sep: '-' | '/'): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)}${sep}${MON[Number(m) - 1]}${sep}${y.slice(2)}`;
}

// ---- edits --------------------------------------------------------------------

export function blankItem(section: string, sn: number | null): AmItem {
  return {
    sn, section, description: '', category: '', intervalText: '', applicability: 'Applicable', responsible: '',
    startDate: null, endDate: null, status: 'Not Started', comments: '', ganttSeq: null,
    tasks: [{ seq: 1, description: '', done: false }],
  };
}

/** Sections in sheet order: the workbook's three first, then any others as they appear. */
export function sheetSections(items: AmItem[]): string[] {
  const out: string[] = [...AM_SECTIONS];
  for (const i of items) if (!out.includes(i.section)) out.push(i.section);
  return out;
}

const nextSn = (items: AmItem[]) => items.reduce((m, i) => Math.max(m, i.sn ?? 0), 0) + 1;

/** Adds a line at the end of its section (sections stay grouped, in sheet order). */
export function addItem(items: AmItem[], section: string): AmItem[] {
  const sections = sheetSections(items);
  const rank = (s: string) => (sections.indexOf(s) < 0 ? sections.length : sections.indexOf(s));
  const at = items.findIndex((i) => rank(i.section) > rank(section));
  const item = blankItem(section, nextSn(items));
  return at < 0 ? [...items, item] : [...items.slice(0, at), item, ...items.slice(at)];
}

export const removeItem = (items: AmItem[], index: number) => items.filter((_, n) => n !== index);

/** Moves a line up/down within its own section. */
export function moveItem(items: AmItem[], index: number, dir: -1 | 1): AmItem[] {
  const j = index + dir;
  if (j < 0 || j >= items.length || items[j].section !== items[index].section) return items;
  const out = [...items];
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}

export function patchItem(items: AmItem[], index: number, patch: Partial<AmItem>): AmItem[] {
  return items.map((i, n) => {
    if (n !== index) return i;
    const next = { ...i, ...patch };
    // As the sheet's validation: no dates and no ticks on a not-applicable line.
    if (patch.applicability === 'Not applicable') {
      next.startDate = null; next.endDate = null; next.tasks = next.tasks.map((t) => ({ ...t, done: false }));
    }
    return next;
  });
}

export function patchTask(items: AmItem[], index: number, t: number, patch: Partial<AmTask>): AmItem[] {
  return items.map((i, n) => (n === index ? { ...i, tasks: i.tasks.map((x, k) => (k === t ? { ...x, ...patch } : x)) } : i));
}

export function addTask(items: AmItem[], index: number, after: number): AmItem[] {
  return items.map((i, n) => {
    if (n !== index) return i;
    const tasks = [...i.tasks];
    tasks.splice(after + 1, 0, { seq: 0, description: '', done: false });
    return { ...i, tasks: tasks.map((x, k) => ({ ...x, seq: k + 1 })) };
  });
}

export function removeTask(items: AmItem[], index: number, t: number): AmItem[] {
  return items.map((i, n) => (n === index
    ? { ...i, tasks: i.tasks.filter((_, k) => k !== t).map((x, k) => ({ ...x, seq: k + 1 })) } : i));
}

// ---- checks (the workbook's data validation) -----------------------------------

export interface SheetIssue { line: number | null; message: string }

const MIN_DATE = '2020-01-01';

export function validateSheet(d: SheetDraft): SheetIssue[] {
  const out: SheetIssue[] = [];
  if (!d.rigId) out.push({ line: null, message: 'Choose the rig.' });
  if (!d.title.trim()) out.push({ line: null, message: 'Enter the project name.' });
  if (d.title.trim().length > 120) out.push({ line: null, message: 'Project name is longer than 120 characters.' });
  if (d.plannedStart && d.plannedEnd && d.plannedEnd < d.plannedStart) out.push({ line: null, message: 'Project End is before Project Start.' });
  if (!d.items.length) out.push({ line: null, message: 'Add at least one equipment line.' });
  if (d.items.length > 2000) out.push({ line: null, message: 'Too many equipment lines (max 2,000).' });
  d.items.forEach((i, n) => {
    const line = n + 1;
    if (!i.description.trim()) out.push({ line, message: 'Equipment description is empty.' });
    for (const [label, v] of [['Start', i.startDate], ['End', i.endDate]] as const) {
      if (v && v < MIN_DATE) out.push({ line, message: `${label} Date must be on or after 1 Jan 2020.` });
    }
    if (i.startDate && i.endDate && i.endDate < i.startDate) out.push({ line, message: 'End Date is before Start Date.' });
    if (i.tasks.some((t) => t.done && !t.description.trim())) out.push({ line, message: 'A ticked task has no description.' });
  });
  return out;
}

export const APPLICABILITY_OPTIONS: readonly Applicability[] = ['Applicable', 'Not applicable', 'Completed Offline'];
