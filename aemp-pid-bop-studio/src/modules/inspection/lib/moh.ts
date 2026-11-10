// ============================================================================
//  Major Overhaul (MOH) planning — pure logic ported from the standalone
//  "MOH Multi-Rig 10-Year Planner" HTML (calcYears / calcHours / aggregate).
//  Data comes from migration 0053; this file never touches the network.
//  Dates are ISO `YYYY-MM-DD` and handled in UTC so no timezone drift.
// ============================================================================

export const MOH_CATEGORIES = [
  'Engines / Power Generation', 'Drilling Equipment', 'Well Control', 'Hoisting Equipment',
  'Hydraulic Systems', 'Tanks', 'Handling Equipment', 'Well Services', 'Electrical Equipment', 'Other',
] as const;
export type MohCategory = typeof MOH_CATEGORIES[number];

export const PROJECT_STATUSES = [
  'Not Started', 'Planning', 'PR Raised', 'PO Issued', 'Equipment Sent',
  'Under Overhaul', 'Testing', 'Completed', 'Deferred',
] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

export const MOH_STATUSES = [
  'OVERDUE', 'DUE THIS YEAR', 'DUE NEXT YEAR', 'PLANNED', 'NOT DUE IN PLAN', 'NO LAST MOH DATA', 'NOT APPLICABLE',
] as const;
export type MohStatus = typeof MOH_STATUSES[number];

export const DEFAULT_HORIZON = 10;
export const MAX_HORIZON = 20;

export type IntervalBasis = 'years' | 'hours';

export interface MohItem {
  id: string; sno: number; description: string; category: MohCategory;
  basis: IntervalBasis; interval: number | null; active: boolean; typeIds: string[];
}

/** A manually entered unit (insp_moh_units). */
export interface MohUnit {
  id: string; rigId: string; itemId: string; assetNumber: string; equipmentNumber: string;
  lastMohDate: string | null; lastMohYear: number | null; lastMohHours: number | null;
  currentHours: number | null; avgHoursPerYear: number | null; remarks: string;
}

/** Auto-fill aggregate from insp_moh_inspection_dates(). */
export interface InspectionDate {
  rigId: string; itemId: string; lastMajor: string | null; nextMajorDue: string | null;
  components: number; overdueComponents: number;
}

export interface MohProject {
  id?: string; rigId: string; itemId: string; mohUnitId: string | null; year: number;
  plannedMonth: number | null; startDate: string | null; durationDays: number | null;
  vendor: string; poNumber: string; prNumber: string; responsible: string;
  status: ProjectStatus; comments: string;
  /** Budget in the rig's currency (insp_moh_rig_meta.currency); null = not estimated. */
  estimatedCost: number | null;
}

export const CURRENCIES = ['OMR', 'USD', 'SAR', 'AED', 'EUR', 'GBP'] as const;
export type Currency = typeof CURRENCIES[number];

/** Per-rig planner details (insp_moh_rig_meta, migration 0054). */
export interface RigMeta {
  rigId: string; location: string; currency: Currency; preparedBy: string; remarks: string;
}

export function blankRigMeta(rigId: string): RigMeta {
  return { rigId, location: '', currency: 'OMR', preparedBy: '', remarks: '' };
}

export interface Rig { id: string; name: string }

export interface Calc {
  status: MohStatus;
  detail: string;
  /** Next due as a label: `12 Mar 2027`, `2027` or `24,000 h`. */
  nextDue: string;
  /** Plan years in which an MOH falls. */
  years: number[];
}

export type RowSource = 'manual' | 'inspection' | 'none';

export interface PlanRow {
  key: string; rigId: string; rigName: string; item: MohItem; applicable: boolean;
  source: RowSource; unit: MohUnit | null; insp: InspectionDate | null;
  /** The last MOH as displayed (date, year or hours). */
  lastLabel: string; calc: Calc;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MS_YEAR = 365.25 * 24 * 3600 * 1000;

export function clampHorizon(v: unknown, def = DEFAULT_HORIZON): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_HORIZON) : def;
}

export function planYears(start: number, horizon: number): number[] {
  return Array.from({ length: clampHorizon(horizon) }, (_, i) => start + i);
}

export function parseISO(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

export function fmtDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Adds whole years, clamping 29 Feb → 28 Feb like the HTML's addYearsSafe. */
export function addYears(d: Date, years: number): Date {
  const y = d.getUTCFullYear() + years, m = d.getUTCMonth();
  const r = new Date(Date.UTC(y, m, d.getUTCDate()));
  return r.getUTCMonth() === m ? r : new Date(Date.UTC(y, m + 1, 0));
}

function monthsBetween(from: Date, to: Date): string {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  const y = Math.floor(months / 12), m = months % 12, parts: string[] = [];
  if (y) parts.push(`${y} Year${y === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} Month${m === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : 'Less than 1 Month';
}

const hrs = (n: number) => `${Math.round(n).toLocaleString('en-US')} h`;

function bucket(dueYear: number, todayYear: number, inPlan: boolean): MohStatus {
  if (dueYear === todayYear) return 'DUE THIS YEAR';
  if (dueYear === todayYear + 1) return 'DUE NEXT YEAR';
  return inPlan ? 'PLANNED' : 'NOT DUE IN PLAN';
}

/** Calendar-interval MOH from a last date (preferred) or a last year. */
export function calcYears(
  last: { date: string | null; year: number | null }, interval: number | null, today: Date, years: number[],
): Calc {
  const none: Calc = { status: 'NO LAST MOH DATA', detail: '', nextDue: '—', years: [] };
  const freq = Math.trunc(Number(interval) || 0);
  if (freq <= 0) return { ...none, detail: 'Set MOH interval in calendar years' };
  const start = years[0], end = years[years.length - 1], tYear = today.getUTCFullYear();
  const exact = parseISO(last.date);
  const yOnly = exact ? exact.getUTCFullYear() : Math.trunc(Number(last.year));
  if (!exact && !(Number.isInteger(yOnly) && yOnly >= 1900 && yOnly <= 2200)) {
    return { ...none, detail: 'Enter Last MOH Date or Year' };
  }
  const occ: number[] = [];
  if (exact) {
    const first = addYears(exact, freq);
    for (let d = first, g = 0; d.getUTCFullYear() <= end && g < 200; d = addYears(d, freq), g += 1) {
      if (d.getUTCFullYear() >= start) occ.push(d.getUTCFullYear());
    }
    if (first < today) {
      return { status: 'OVERDUE', detail: `Overdue: ${monthsBetween(first, today)}`, nextDue: fmtDate(first), years: occ };
    }
    return { status: bucket(first.getUTCFullYear(), tYear, occ.length > 0), detail: fmtDate(first), nextDue: fmtDate(first), years: occ };
  }
  const first = yOnly + freq;
  for (let y = first, g = 0; y <= end && g < 200; y += freq, g += 1) if (y >= start) occ.push(y);
  if (first < tYear) {
    const n = tYear - first;
    return { status: 'OVERDUE', detail: `Overdue: ${n} Year${n === 1 ? '' : 's'}`, nextDue: String(first), years: occ };
  }
  return { status: bucket(first, tYear, occ.length > 0), detail: String(first), nextDue: String(first), years: occ };
}

/** Operating-hours MOH; plan years are estimated from the average hours/year. */
export function calcHours(
  u: { lastHours: number | null; currentHours: number | null; avgPerYear: number | null },
  interval: number | null, today: Date, years: number[],
): Calc {
  const none: Calc = { status: 'NO LAST MOH DATA', detail: '', nextDue: '—', years: [] };
  const step = Math.trunc(Number(interval) || 0);
  if (step <= 0) return { ...none, detail: 'Set MOH interval hours' };
  if (u.lastHours === null || !Number.isFinite(u.lastHours)) return { ...none, detail: 'Enter Last MOH Hour Meter' };
  const due = u.lastHours + step;
  if (u.currentHours === null || !Number.isFinite(u.currentHours)) {
    return { ...none, nextDue: hrs(due), detail: `Next MOH at ${hrs(due)} • enter Current Hour Meter` };
  }
  const cur = u.currentHours;
  if (cur < u.lastHours) return { ...none, nextDue: hrs(due), detail: 'Current Hour Meter is lower than Last MOH Hour Meter' };
  const avg = Math.max(0, Number(u.avgPerYear) || 0);
  const start = years[0], end = years[years.length - 1], tYear = today.getUTCFullYear();
  const occ: number[] = [];
  if (avg > 0) {
    for (let h = due, g = 0; g < 200; h += step, g += 1) {
      const delta = h - cur;
      const yr = new Date(today.getTime() + (delta / avg) * MS_YEAR).getUTCFullYear();
      if (yr > end && delta >= 0) break;
      if (delta >= 0 && yr >= start && yr <= end) occ.push(yr);
    }
  }
  if (cur > due) return { status: 'OVERDUE', detail: `Overdue by ${hrs(cur - due)}`, nextDue: hrs(due), years: occ };
  if (cur === due) return { status: 'DUE THIS YEAR', detail: `Due now at ${hrs(due)}`, nextDue: hrs(due), years: occ };
  const remaining = due - cur;
  if (avg <= 0) {
    return { status: 'PLANNED', detail: `${hrs(remaining)} remaining • enter Avg Hrs/Year to estimate plan year`, nextDue: hrs(due), years: occ };
  }
  const est = new Date(today.getTime() + (remaining / avg) * MS_YEAR);
  const ey = est.getUTCFullYear();
  return {
    status: bucket(ey, tYear, ey >= start && ey <= end),
    detail: `${hrs(remaining)} remaining • est. ${fmtDate(est)}`, nextDue: hrs(due), years: occ,
  };
}

const NA: Calc = { status: 'NOT APPLICABLE', detail: 'Excluded from forecast', nextDue: '—', years: [] };

function calcUnit(item: MohItem, u: MohUnit, today: Date, years: number[]): Calc {
  return item.basis === 'hours'
    ? calcHours({ lastHours: u.lastMohHours, currentHours: u.currentHours, avgPerYear: u.avgHoursPerYear }, item.interval, today, years)
    : calcYears({ date: u.lastMohDate, year: u.lastMohYear }, item.interval, today, years);
}

function unitLast(item: MohItem, u: MohUnit): string {
  if (item.basis === 'hours') return u.lastMohHours === null ? '—' : hrs(u.lastMohHours);
  const d = parseISO(u.lastMohDate);
  return d ? fmtDate(d) : u.lastMohYear ? String(u.lastMohYear) : '—';
}

/**
 * Expands rigs × active items into plan rows. Per rig+item: every manual unit is
 * a row; with none, the inspection auto-fill (calendar items only) or a blank
 * "no data" row stands in. Not-applicable items still appear, flagged.
 */
export function buildPlanRows(input: {
  rigs: Rig[]; items: MohItem[]; units: MohUnit[]; inspection: InspectionDate[];
  notApplicable: ReadonlySet<string>; today: Date; years: number[];
}): PlanRow[] {
  const { rigs, items, units, inspection, notApplicable, today, years } = input;
  const byRigItem = new Map<string, MohUnit[]>();
  for (const u of units) {
    const k = `${u.rigId}|${u.itemId}`;
    byRigItem.set(k, [...(byRigItem.get(k) ?? []), u]);
  }
  const insp = new Map(inspection.map((i) => [`${i.rigId}|${i.itemId}`, i]));
  const active = items.filter((i) => i.active).sort((a, b) => a.sno - b.sno);
  const rows: PlanRow[] = [];
  for (const rig of rigs) {
    for (const item of active) {
      const k = `${rig.id}|${item.id}`;
      const applicable = !notApplicable.has(k);
      const base = { rigId: rig.id, rigName: rig.name, item, applicable };
      const manual = byRigItem.get(k);
      if (manual?.length) {
        for (const u of manual) {
          rows.push({ ...base, key: `${k}|${u.id}`, source: 'manual', unit: u, insp: insp.get(k) ?? null,
            lastLabel: unitLast(item, u), calc: applicable ? calcUnit(item, u, today, years) : NA });
        }
        continue;
      }
      const auto = item.basis === 'years' ? insp.get(k) ?? null : null;
      const lastDate = auto?.lastMajor ?? null;
      const d = parseISO(lastDate);
      rows.push({
        ...base, key: k, source: auto && d ? 'inspection' : 'none', unit: null, insp: auto,
        lastLabel: d ? fmtDate(d) : '—',
        calc: !applicable ? NA : item.basis === 'hours'
          ? calcHours({ lastHours: null, currentHours: null, avgPerYear: null }, item.interval, today, years)
          : calcYears({ date: lastDate, year: null }, item.interval, today, years),
      });
    }
  }
  return rows;
}

export interface Summary {
  units: number; overdue: number; dueThis: number; dueNext: number; missing: number;
  projects: number; annual: Record<number, number>;
  byStatus: Record<MohStatus, number>; byCategory: Record<string, number>;
  highest: number | null;
}

/** KPIs over applicable rows, as the HTML's aggregateWorkspace (qty removed in v8). */
export function summarize(rows: PlanRow[], years: number[]): Summary {
  const annual: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
  const byStatus = Object.fromEntries(MOH_STATUSES.map((s) => [s, 0])) as Record<MohStatus, number>;
  const byCategory: Record<string, number> = {};
  let units = 0, projects = 0;
  for (const r of rows) {
    byStatus[r.calc.status] += 1;
    if (!r.applicable) continue;
    units += 1;
    for (const y of r.calc.years) {
      if (y in annual) {
        annual[y] += 1; projects += 1;
        byCategory[r.item.category] = (byCategory[r.item.category] ?? 0) + 1;
      }
    }
  }
  const highest = projects ? years.reduce((b, y) => (annual[y] > annual[b] ? y : b), years[0]) : null;
  return {
    units, overdue: byStatus.OVERDUE, dueThis: byStatus['DUE THIS YEAR'], dueNext: byStatus['DUE NEXT YEAR'],
    missing: byStatus['NO LAST MOH DATA'], projects, annual, byStatus, byCategory, highest,
  };
}

export function projectKey(rigId: string, itemId: string, mohUnitId: string | null, year: number): string {
  return `${rigId}|${itemId}|${mohUnitId ?? ''}|${year}`;
}

export function blankProject(row: PlanRow, year: number): MohProject {
  return {
    rigId: row.rigId, itemId: row.item.id, mohUnitId: row.unit?.id ?? null, year,
    plannedMonth: null, startDate: null, durationDays: null, vendor: '', poNumber: '', prNumber: '',
    responsible: '', status: 'Not Started', comments: '', estimatedCost: null,
  };
}

export const STATUS_TONE: Record<MohStatus, 'danger' | 'warning' | 'success' | 'info' | 'neutral'> = {
  OVERDUE: 'danger', 'DUE THIS YEAR': 'warning', 'DUE NEXT YEAR': 'success', PLANNED: 'info',
  'NOT DUE IN PLAN': 'neutral', 'NO LAST MOH DATA': 'neutral', 'NOT APPLICABLE': 'neutral',
};

/** `OMR 12,500.000` — OMR uses 3 decimals (baisa), others 2, as the HTML's moneyFor. */
export function money(v: number, currency: string): string {
  const d = currency === 'OMR' ? 3 : 2;
  return `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

export type CurrencyTotals = Partial<Record<Currency, number>>;

/** `OMR 1,000.000 + USD 500.00`, or `—` when nothing is estimated. */
export function currencyText(t: CurrencyTotals): string {
  const parts = CURRENCIES.filter((c) => (t[c] ?? 0) > 0).map((c) => money(t[c] as number, c));
  return parts.length ? parts.join(' + ') : '—';
}

export interface CostSummary { total: CurrencyTotals; byYear: Record<number, CurrencyTotals>; byRig: Record<string, CurrencyTotals> }

/**
 * Estimated MOH budget: the cost of every planned occurrence (applicable row,
 * year inside the plan) that has project details, in its rig's currency.
 * Currencies are never converted or mixed — totals stay per currency.
 */
export function costSummary(
  rows: PlanRow[], years: number[], projects: ReadonlyMap<string, MohProject>,
  currencyOf: (rigId: string) => Currency,
): CostSummary {
  const out: CostSummary = { total: {}, byYear: Object.fromEntries(years.map((y) => [y, {}])), byRig: {} };
  const add = (t: CurrencyTotals, c: Currency, v: number) => { t[c] = (t[c] ?? 0) + v; };
  for (const r of rows) {
    if (!r.applicable) continue;
    for (const y of r.calc.years) {
      if (!(y in out.byYear)) continue;
      const cost = projects.get(projectKey(r.rigId, r.item.id, r.unit?.id ?? null, y))?.estimatedCost;
      if (!cost || cost <= 0) continue;
      const c = currencyOf(r.rigId);
      add(out.total, c, cost); add(out.byYear[y], c, cost);
      add((out.byRig[r.rigId] ??= {}), c, cost);
    }
  }
  return out;
}
