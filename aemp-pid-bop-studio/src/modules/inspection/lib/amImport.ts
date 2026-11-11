// ============================================================================
//  Annual Maintenance — Excel import of the "Maintenance Plan - Gantt Chart"
//  workbook. Reads the "Maintenance Plan" sheet as the office keeps it:
//    · header block   Project Name / Project Start / Project End
//    · header row     SN | Equipment Description | Inspection Category | …
//    · section rows   DRILLING / MECHANICAL / ELECTRICAL
//    · item rows      numbered SN, one per equipment line
//    · task rows      below an item: Scope of Work text + Done TRUE/FALSE
//  Column order is free (matched by header alias). parsePlanSheet() is pure; the
//  UI previews the result + diff before amApi.importPlan() writes it.
// ============================================================================
import { parseDate as parseDateBase } from './mohImport';
import {
  APPLICABILITY, ITEM_STATUSES, derivedStatus,
  type AmItem, type AmTask, type Applicability, type ItemStatus,
} from './am';

export type Cell = string | number | boolean | null | undefined;

type Field =
  | 'sn' | 'description' | 'category' | 'interval' | 'applicability' | 'sow' | 'done' | 'responsible'
  | 'start' | 'end' | 'status' | 'comments' | 'ganttSeq' | 'section';

const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES: Record<Field, string[]> = {
  sn: ['sn', 'sno', 'serial', 'no'],
  description: ['equipmentdescription', 'equipment', 'description'],
  category: ['inspectioncategory', 'category', 'cat'],
  interval: ['interval', 'frequency'],
  applicability: ['inspectionstatus', 'applicability', 'applicable'],
  sow: ['scopeofwork', 'sow', 'task', 'tasks'],
  done: ['done', 'completed', 'checked'],
  responsible: ['responsible', 'responsibleperson', 'owner'],
  start: ['startdate', 'start', 'plannedstart'],
  end: ['enddate', 'end', 'plannedend', 'finishdate'],
  status: ['status'],
  comments: ['comments', 'comment', 'remarks'],
  ganttSeq: ['ganttseqhelper', 'ganttseq'],
  section: ['sectionhelper', 'section', 'department'],
};
const ALIAS_TO_FIELD = new Map<string, Field>(
  (Object.entries(ALIASES) as [Field, string[]][]).flatMap(([f, as]) => as.map((a) => [a, f] as [string, Field])));

const text = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim());

export interface Header { row: number; cols: Partial<Record<Field, number>> }

/** Header row in the first 30 rows: needs Equipment Description; most matches wins. */
export function detectHeader(aoa: Cell[][]): Header | null {
  let best: Header | null = null, bestScore = 0;
  for (let i = 0; i < Math.min(aoa.length, 30); i += 1) {
    const cols: Partial<Record<Field, number>> = {};
    (aoa[i] ?? []).forEach((v, j) => {
      const f = ALIAS_TO_FIELD.get(key(v));
      if (f && cols[f] === undefined) cols[f] = j;
    });
    if (cols.description === undefined) continue;
    const score = Object.keys(cols).length;
    if (score >= 4 && score > bestScore) { best = { row: i, cols }; bestScore = score; }
  }
  return best;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** mohImport's parser plus the workbook's own `28-Oct-26` / `6/Nov/26` (two-digit year). */
export function parseDate(v: Cell): string | null {
  const base = parseDateBase(v);
  if (base) return base;
  const m = /^(\d{1,2})[\s/-]([a-z]{3})[a-z]*[\s/-](\d{2})$/i.exec(text(v));
  if (!m || !MONTHS.includes(m[2].toLowerCase())) return null;
  return parseDateBase(`${m[1]} ${m[2]} 20${m[3]}`);
}

function bool(v: Cell): boolean | null {
  if (typeof v === 'boolean') return v;
  const k = key(v);
  if (['true', 'yes', 'y', 'x', '1', 'done'].includes(k)) return true;
  if (['false', 'no', 'n', '0'].includes(k)) return false;
  return null;
}

const pick = <T extends string>(list: readonly T[], v: Cell): T | undefined => list.find((s) => key(s) === key(v));

/** `TDS Eng / RM/ Driller` → `TDS Eng/RM/Driller`, collapse spaces. */
export const cleanResponsible = (v: Cell) => text(v).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
const cleanSection = (v: Cell) => text(v).replace(/\s+/g, ' ').toUpperCase();

/** `3. Check towing frame…` → [3, 'Check towing frame…']. */
function splitNumbered(s: string, fallback: number): [number, string] {
  const m = /^(\d{1,3})[.)]\s*([\s\S]*)$/.exec(s.trim());
  return m && m[2].trim() ? [Number(m[1]), m[2].trim()] : [fallback, s.trim()];
}

export interface Warning { row: number; message: string }

export interface ParsedPlan {
  title: string; year: number | null; plannedStart: string | null; plannedEnd: string | null;
  items: AmItem[]; warnings: Warning[];
  /** Totals the workbook itself reports, for a cross-check against what was read. */
  reported: { totalTasks: number | null; completed: number | null };
}

/** Value to the right of a label cell in the header block (e.g. "Project Start"). */
function labelled(aoa: Cell[][], upto: number, label: string): Cell {
  for (let i = 0; i < upto; i += 1) {
    const row = aoa[i] ?? [];
    for (let j = 0; j < row.length; j += 1) {
      if (key(row[j]) !== label) continue;
      for (let k = j + 1; k < Math.min(row.length, j + 4); k += 1) if (text(row[k]) !== '') return row[k];
    }
  }
  return undefined;
}

export function parsePlanSheet(aoa: Cell[][]): ParsedPlan {
  const h = detectHeader(aoa);
  if (!h) throw new Error('Could not find the plan header row (it needs an "Equipment Description" column).');
  const c = h.cols;
  const get = (row: Cell[], f: Field): Cell => (c[f] === undefined ? undefined : row[c[f] as number]);
  const warnings: Warning[] = [];
  const items: AmItem[] = [];

  const title = text(labelled(aoa, h.row, 'projectname'));
  const plannedStart = parseDate(labelled(aoa, h.row, 'projectstart') ?? null);
  const plannedEnd = parseDate(labelled(aoa, h.row, 'projectend') ?? null);
  const ym = /(20\d{2})/.exec(title);
  const year = ym ? Number(ym[1]) : plannedStart ? Number(plannedStart.slice(0, 4)) : null;
  const num = (v: Cell) => (typeof v === 'number' ? v : /^\d+$/.test(text(v)) ? Number(text(v)) : null);

  let section = 'OTHER';
  let cur: AmItem | null = null;
  const sowMaster = new Map<AmItem, string>();
  const unstated = new Set<AmItem>();

  for (let i = h.row + 1; i < aoa.length; i += 1) {
    const row = aoa[i] ?? [];
    if (row.every((v) => text(v) === '')) continue;
    const rowNo = i + 1;
    const snCell = get(row, 'sn'), desc = text(get(row, 'description'));
    const sn = num(snCell);

    if (sn === null && text(snCell) && !desc) { section = cleanSection(snCell); cur = null; continue; }

    if (desc && (sn !== null || c.sn === undefined)) {
      const appText = text(get(row, 'applicability'));
      const applicability: Applicability = pick(APPLICABILITY, appText) ?? 'Applicable';
      if (appText && !pick(APPLICABILITY, appText)) warnings.push({ row: rowNo, message: `Unknown inspection status "${appText}" — treated as Applicable.` });
      const statusText = text(get(row, 'status'));
      const status: ItemStatus | undefined = pick(ITEM_STATUSES, statusText);
      if (statusText && !status) warnings.push({ row: rowNo, message: `Unknown status "${statusText}" — worked out from the checklist.` });
      const startText = text(get(row, 'start')), endText = text(get(row, 'end'));
      let startDate = parseDate(get(row, 'start') ?? null), endDate = parseDate(get(row, 'end') ?? null);
      if (startText && !startDate) warnings.push({ row: rowNo, message: `Start date "${startText}" is not a date — left blank.` });
      if (endText && !endDate) warnings.push({ row: rowNo, message: `End date "${endText}" is not a date — left blank.` });
      if (startDate && endDate && endDate < startDate) {
        warnings.push({ row: rowNo, message: 'End date is before start date — dates swapped.' });
        [startDate, endDate] = [endDate, startDate];
      }
      cur = {
        sn, section: cleanSection(get(row, 'section')) || section, description: desc,
        category: text(get(row, 'category')), intervalText: text(get(row, 'interval')), applicability,
        responsible: cleanResponsible(get(row, 'responsible')), startDate, endDate,
        status: status ?? 'Not Started', comments: text(get(row, 'comments')),
        ganttSeq: num(get(row, 'ganttSeq')), tasks: [],
      };
      if (applicability === 'Not applicable') cur.status = 'Not applicable';
      else if (!status) unstated.add(cur);
      items.push(cur);
      // The item row's own "Scope of Work" cell holds a "5 of 5 tasks done" counter;
      // older layouts put the whole SOW there — keep it as a fallback checklist.
      const sowText = text(get(row, 'sow'));
      if (sowText && !/^\d+\s+of\s+\d+/i.test(sowText)) sowMaster.set(cur, sowText);
      continue;
    }

    const sow = text(get(row, 'sow'));
    if (sow && cur) {
      const [seq, description] = splitNumbered(sow, cur.tasks.length + 1);
      cur.tasks.push({ seq, description, done: bool(get(row, 'done')) ?? false });
      continue;
    }
    if (sow || desc) warnings.push({ row: rowNo, message: 'Row is not under an equipment line — skipped.' });
  }

  for (const [item, sowText] of sowMaster) {
    if (item.tasks.length) continue;
    item.tasks = sowText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s, n): AmTask => {
      const [seq, description] = splitNumbered(s, n + 1);
      return { seq, description, done: item.status === 'Completed' };
    });
  }
  // a line with no readable status takes the one its checklist implies
  for (const item of unstated) item.status = derivedStatus(item);

  const n = (v: Cell) => (typeof v === 'number' ? v : null);
  return {
    title, year, plannedStart, plannedEnd, items, warnings,
    reported: { totalTasks: n(labelled(aoa, h.row, 'totaltasks')), completed: n(labelled(aoa, h.row, 'completed')) },
  };
}

/** Picks the plan sheet ("Maintenance Plan", else the first sheet with a plan header). */
export function choosePlanSheet(sheets: { name: string; aoa: Cell[][] }[]): Cell[][] {
  const named = sheets.find((s) => /maintenance\s*plan/i.test(s.name) && detectHeader(s.aoa));
  const any = named ?? sheets.find((s) => detectHeader(s.aoa));
  if (!any) throw new Error('No sheet in this workbook looks like a maintenance plan (no "Equipment Description" header).');
  return any.aoa;
}

/** Rig whose name carries the same number as the project name ("Rig305 AM-2026" → 305). */
export function guessRig<R extends { id: string; name: string }>(title: string, rigs: R[]): R | undefined {
  const t = key(title);
  const exact = rigs.filter((r) => key(r.name).length > 2 && t.startsWith(key(r.name)))
    .sort((a, b) => key(b.name).length - key(a.name).length)[0];
  if (exact) return exact;
  const m = /rig\s*-?\s*(\d{2,4})/i.exec(title) ?? /(?<!\d)(\d{2,3})(?!\d)/.exec(title);
  if (!m) return undefined;
  return rigs.find((r) => (r.name.match(/\d+/g) ?? ([] as string[])).includes(m[1]));
}

// ---- diff against the stored plan ----------------------------------------------

export interface PlanDiff { added: string[]; removed: string[]; changed: string[]; tasksDone: number; tasksUndone: number }

const itemKey = (i: AmItem) => `${key(i.section)}|${key(i.description)}`;

export function diffPlans(before: AmItem[], after: AmItem[]): PlanDiff {
  const old = new Map(before.map((i) => [itemKey(i), i]));
  const d: PlanDiff = { added: [], removed: [], changed: [], tasksDone: 0, tasksUndone: 0 };
  const seen = new Set<string>();
  for (const n of after) {
    const k = itemKey(n); seen.add(k);
    const o = old.get(k);
    if (!o) { d.added.push(n.description); continue; }
    if (o.status !== n.status || o.startDate !== n.startDate || o.endDate !== n.endDate
      || o.applicability !== n.applicability || o.responsible !== n.responsible || o.tasks.length !== n.tasks.length) {
      d.changed.push(n.description);
    }
    const was = new Map(o.tasks.map((t) => [key(t.description), t.done]));
    for (const t of n.tasks) {
      const w = was.get(key(t.description));
      if (w === false && t.done) d.tasksDone += 1;
      if (w === true && !t.done) d.tasksUndone += 1;
    }
  }
  for (const [k, o] of old) if (!seen.has(k)) d.removed.push(o.description);
  return d;
}

/** Reads every sheet as raw cells (numbers stay numbers so date serials are exact). */
export async function readWorkbook(file: File): Promise<{ name: string; aoa: Cell[][] }[]> {
  if (file.size > 15 * 1024 * 1024) throw new Error('Workbook too large (max 15 MB).');
  const buf = await file.arrayBuffer();
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    return wb.SheetNames.map((name) => ({
      name, aoa: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }).slice(0, 10000),
    }));
  } catch {
    throw new Error('Could not read this file — use .xlsx or .xls.');
  }
}
