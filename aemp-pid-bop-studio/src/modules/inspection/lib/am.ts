// ============================================================================
//  Annual Maintenance (AM) — types and pure calculations for the per-rig
//  maintenance plan that used to live in "Maintenance Plan - Gantt Chart.xlsx"
//  (migration 0055). Progress follows the workbook: a line's progress is its
//  checklist done-ratio, the plan's is the average over every line that is
//  not "Not applicable". Payment follows the rig's contract terms.
// ============================================================================

export const AM_SECTIONS = ['DRILLING', 'MECHANICAL', 'ELECTRICAL'] as const;
export const APPLICABILITY = ['Applicable', 'Not applicable', 'Completed Offline'] as const;
export const ITEM_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Not applicable'] as const;
export const PLAN_STATUSES = ['Planning', 'In Progress', 'Completed', 'Cancelled'] as const;
export const RATE_BASES = ['full', 'reduced', 'breakdown'] as const;
export const AM_CURRENCIES = ['OMR', 'USD', 'SAR', 'AED', 'EUR', 'GBP'] as const;

export type Applicability = typeof APPLICABILITY[number];
export type ItemStatus = typeof ITEM_STATUSES[number];
export type PlanStatus = typeof PLAN_STATUSES[number];
export type RateBasis = typeof RATE_BASES[number];
export type AmCurrency = typeof AM_CURRENCIES[number];

export const RATE_BASIS_LABEL: Record<RateBasis, string> = {
  full: 'Full rate', reduced: 'Reduced rate', breakdown: 'Breakdown rate',
};

export interface AmTask { id?: string; seq: number; description: string; done: boolean }

export interface AmItem {
  id?: string; sn: number | null; section: string; description: string; category: string;
  intervalText: string; applicability: Applicability; responsible: string;
  startDate: string | null; endDate: string | null; status: ItemStatus; comments: string;
  ganttSeq: number | null; tasks: AmTask[];
}

export interface AmTerms {
  allowedDays: number; rateBasis: RateBasis; ratePercent: number; overrunRatePercent: number;
  dailyRate: number | null; currency: AmCurrency;
}

export interface AmPlan extends AmTerms {
  id: string; rigId: string; title: string; year: number; status: PlanStatus;
  plannedStart: string | null; plannedEnd: string | null; actualStart: string | null; actualEnd: string | null;
  includesCatIv: boolean; notes: string; revision: number; sourceFile: string;
  lastImportedAt: string | null; finalizedAt: string | null;
}

export interface AmContract {
  rigId: string; client: string; contractRef: string; amDaysAllowed: number; rateBasis: RateBasis;
  ratePercent: number; overrunRatePercent: number; dailyRate: number | null; currency: AmCurrency;
  catIvCycleYears: number; lastCatIvDate: string | null; notes: string;
}

export interface AmRevision { id: string; revision: number; fileName: string; importedAt: string; summary: Record<string, unknown> }

export function blankContract(rigId: string): AmContract {
  return {
    rigId, client: '', contractRef: '', amDaysAllowed: 5, rateBasis: 'full', ratePercent: 100,
    overrunRatePercent: 0, dailyRate: null, currency: 'OMR', catIvCycleYears: 10, lastCatIvDate: null, notes: '',
  };
}

/** The rate % a basis implies by default (reduced keeps whatever was entered). */
export function defaultRatePercent(basis: RateBasis, current: number): number {
  return basis === 'full' ? 100 : basis === 'breakdown' ? 0 : current;
}

// ---- progress ------------------------------------------------------------------

/**
 * 0..1. As the workbook's Overall Progress formula: a "Completed Offline" line
 * counts as done, otherwise the checklist ratio (no checklist → by status).
 */
export function itemProgress(i: AmItem): number {
  if (i.applicability === 'Completed Offline') return 1;
  if (i.tasks.length) return i.tasks.filter((t) => t.done).length / i.tasks.length;
  return i.status === 'Completed' ? 1 : 0;
}

/** Status implied by the checklist (keeps "Not applicable"). */
export function derivedStatus(i: AmItem): ItemStatus {
  if (i.applicability === 'Not applicable' || i.status === 'Not applicable') return 'Not applicable';
  if (!i.tasks.length) return i.status;
  const done = i.tasks.filter((t) => t.done).length;
  return done === 0 ? 'Not Started' : done === i.tasks.length ? 'Completed' : 'In Progress';
}

export const isActive = (i: AmItem) => i.status !== 'Not applicable' && i.applicability !== 'Not applicable';

export interface Breakdown {
  total: number; completed: number; inProgress: number; notStarted: number; notApplicable: number;
  /** 0..1, average line progress over active lines. */
  progress: number; tasks: number; tasksDone: number;
}

export function breakdown(items: AmItem[]): Breakdown {
  const active = items.filter(isActive);
  const b: Breakdown = {
    total: active.length, completed: 0, inProgress: 0, notStarted: 0,
    notApplicable: items.length - active.length, progress: 0, tasks: 0, tasksDone: 0,
  };
  let sum = 0;
  for (const i of active) {
    if (i.status === 'Completed') b.completed += 1;
    else if (i.status === 'In Progress') b.inProgress += 1;
    else b.notStarted += 1;
    sum += itemProgress(i);
    b.tasks += i.tasks.length;
    b.tasksDone += i.tasks.filter((t) => t.done).length;
  }
  b.progress = active.length ? sum / active.length : 0;
  return b;
}

/** Breakdown per section, workbook sections first, then any others in file order. */
export function bySection(items: AmItem[]): { section: string; b: Breakdown }[] {
  const order: string[] = [...AM_SECTIONS];
  for (const i of items) if (!order.includes(i.section)) order.push(i.section);
  return order.map((section) => ({ section, b: breakdown(items.filter((i) => i.section === section)) }))
    .filter((s) => s.b.total + s.b.notApplicable > 0);
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

// ---- dates ---------------------------------------------------------------------

const DAY = 86400000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Inclusive day count, null when either end is missing or reversed. */
export function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const d = Math.round((ms(end) - ms(start)) / DAY) + 1;
  return d > 0 ? d : null;
}

export function addDays(iso: string, n: number): string {
  return new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(ms(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
}

// ---- payment -------------------------------------------------------------------

export interface Payment {
  /** Days the rig is (or was planned to be) down for the AM. */
  days: number | null; source: 'actual' | 'planned' | null;
  withinDays: number; overrunDays: number;
  /** Revenue at the contract terms, and what full operating rate would have paid. */
  earned: number | null; fullRate: number | null; loss: number | null;
}

/**
 * Days inside the allowance are paid at ratePercent, days beyond it at
 * overrunRatePercent. Actual dates win over planned; an AM still running
 * counts up to `today`.
 */
export function payment(p: AmPlan, today: string): Payment {
  let days: number | null = null, source: Payment['source'] = null;
  if (p.actualStart) {
    const end = p.actualEnd ?? (today >= p.actualStart ? today : p.actualStart);
    days = daysBetween(p.actualStart, end); source = 'actual';
  } else if (p.plannedStart && p.plannedEnd) {
    days = daysBetween(p.plannedStart, p.plannedEnd); source = 'planned';
  }
  const d = days ?? 0;
  const withinDays = Math.min(d, p.allowedDays), overrunDays = Math.max(0, d - p.allowedDays);
  if (p.dailyRate === null || days === null) {
    return { days, source, withinDays, overrunDays, earned: null, fullRate: null, loss: null };
  }
  const earned = p.dailyRate * (withinDays * p.ratePercent + overrunDays * p.overrunRatePercent) / 100;
  const fullRate = p.dailyRate * d;
  return { days, source, withinDays, overrunDays, earned, fullRate, loss: fullRate - earned };
}

export function money(v: number | null, currency: string): string {
  if (v === null) return '—';
  return `${currency} ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// ---- CAT IV --------------------------------------------------------------------

/** Year the next CAT IV falls due, from the last one and the contract cycle. */
export function nextCatIvYear(c: AmContract): number | null {
  return c.lastCatIvDate ? Number(c.lastCatIvDate.slice(0, 4)) + c.catIvCycleYears : null;
}

/** "due" when the plan year has reached the next CAT IV year. */
export function catIvState(c: AmContract | undefined, year: number): 'due' | 'ok' | 'unknown' {
  const next = c ? nextCatIvYear(c) : null;
  if (next === null) return 'unknown';
  return year >= next ? 'due' : 'ok';
}
