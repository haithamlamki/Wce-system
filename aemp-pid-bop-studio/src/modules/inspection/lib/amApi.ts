// ============================================================================
//  Annual Maintenance — data access for migration 0055. RLS scopes every read
//  and write to the caller's rigs; this file maps snake_case rows to lib/am.ts.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import {
  AM_CURRENCIES, RATE_BASES,
  type AmContract, type AmCurrency, type AmItem, type AmPlan, type AmRevision, type Applicability,
  type ItemStatus, type PlanStatus, type RateBasis,
} from './am';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown): string => (v as string | null) ?? '';
const date = (v: unknown): string | null => (v as string | null) ?? null;
const cur = (v: unknown): AmCurrency => ((AM_CURRENCIES as readonly string[]).includes(v as string) ? v as AmCurrency : 'OMR');
const basis = (v: unknown): RateBasis => ((RATE_BASES as readonly string[]).includes(v as string) ? v as RateBasis : 'full');

/** Pages through a query so large plans are never silently truncated at 1000 rows. */
async function all(table: string, cols: string, filter?: { col: string; values: string[] }): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = need().from(table).select(cols);
    if (filter) q = q.in(filter.col, filter.values);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function mapPlan(r: Row): AmPlan {
  return {
    id: r.id as string, rigId: r.unit_id as string, title: str(r.title), year: Number(r.plan_year),
    status: (r.status as PlanStatus) ?? 'Planning',
    plannedStart: date(r.planned_start), plannedEnd: date(r.planned_end),
    actualStart: date(r.actual_start), actualEnd: date(r.actual_end),
    allowedDays: Number(r.allowed_days ?? 0), rateBasis: basis(r.rate_basis), ratePercent: Number(r.rate_percent ?? 100),
    overrunRatePercent: Number(r.overrun_rate_percent ?? 0), dailyRate: num(r.daily_rate), currency: cur(r.currency),
    includesCatIv: r.includes_cat_iv === true, notes: str(r.notes), revision: Number(r.revision ?? 0),
    sourceFile: str(r.source_file), lastImportedAt: date(r.last_imported_at), finalizedAt: date(r.finalized_at),
  };
}

function mapContract(r: Row): AmContract {
  return {
    rigId: r.unit_id as string, client: str(r.client), contractRef: str(r.contract_ref),
    amDaysAllowed: Number(r.am_days_allowed ?? 5), rateBasis: basis(r.rate_basis), ratePercent: Number(r.rate_percent ?? 100),
    overrunRatePercent: Number(r.overrun_rate_percent ?? 0), dailyRate: num(r.daily_rate), currency: cur(r.currency),
    catIvCycleYears: Number(r.cat_iv_cycle_years ?? 10), lastCatIvDate: date(r.last_cat_iv_date), notes: str(r.notes),
  };
}

export interface PlanSummary {
  active: number; completed: number; inProgress: number; notStarted: number; notApplicable: number; progress: number;
}

export interface AmOverview { plans: AmPlan[]; contracts: Map<string, AmContract>; summary: Map<string, PlanSummary> }

export async function fetchOverview(): Promise<AmOverview> {
  const [plans, contracts, summary] = await Promise.all([
    all('insp_am_plans', '*'), all('insp_am_contracts', '*'), all('insp_am_plan_summary', '*'),
  ]);
  return {
    plans: plans.map(mapPlan),
    contracts: new Map(contracts.map((r) => { const c = mapContract(r); return [c.rigId, c]; })),
    summary: new Map(summary.map((r) => [r.plan_id as string, {
      active: Number(r.active), completed: Number(r.completed), inProgress: Number(r.in_progress),
      notStarted: Number(r.not_started), notApplicable: Number(r.not_applicable), progress: Number(r.progress),
    }])),
  };
}

export interface PlanDetail { plan: AmPlan; items: AmItem[]; revisions: AmRevision[]; contract: AmContract | null }

export async function fetchPlan(id: string): Promise<PlanDetail> {
  const db = need();
  const { data: p, error } = await db.from('insp_am_plans').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) throw new Error('This maintenance plan does not exist or is outside your access.');
  const plan = mapPlan(p as Row);
  const [itemRows, revRows, conRes] = await Promise.all([
    all('insp_am_items', '*', { col: 'plan_id', values: [id] }),
    all('insp_am_revisions', 'id,revision,file_name,summary,imported_at', { col: 'plan_id', values: [id] }),
    db.from('insp_am_contracts').select('*').eq('unit_id', plan.rigId).maybeSingle(),
  ]);
  if (conRes.error) throw new Error(conRes.error.message);
  const ids = itemRows.map((r) => r.id as string);
  const taskRows: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    taskRows.push(...await all('insp_am_tasks', 'id,item_id,seq,description,done', { col: 'item_id', values: ids.slice(i, i + 200) }));
  }
  const tasksOf = new Map<string, Row[]>();
  for (const t of taskRows) tasksOf.set(t.item_id as string, [...(tasksOf.get(t.item_id as string) ?? []), t]);
  const items: AmItem[] = itemRows.sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((r) => ({
    id: r.id as string, sn: num(r.sn), section: str(r.section), description: str(r.description),
    category: str(r.category), intervalText: str(r.interval_text), applicability: r.applicability as Applicability,
    responsible: str(r.responsible), startDate: date(r.start_date), endDate: date(r.end_date),
    status: r.status as ItemStatus, comments: str(r.comments), ganttSeq: num(r.gantt_seq),
    tasks: (tasksOf.get(r.id as string) ?? []).sort((a, b) => Number(a.seq) - Number(b.seq))
      .map((t) => ({ id: t.id as string, seq: Number(t.seq), description: str(t.description), done: t.done === true })),
  }));
  const revisions: AmRevision[] = revRows.map((r) => ({
    id: r.id as string, revision: Number(r.revision), fileName: str(r.file_name),
    importedAt: str(r.imported_at), summary: (r.summary as Record<string, unknown>) ?? {},
  })).sort((a, b) => b.revision - a.revision);
  return { plan, items, revisions, contract: conRes.data ? mapContract(conRes.data as Row) : null };
}

export interface ImportPayload {
  rigId: string; title: string; year: number; plannedStart: string | null; plannedEnd: string | null;
  fileName: string; items: AmItem[]; summary: Record<string, unknown>;
}

/** Creates the plan or replaces a non-finalized plan's lines in one transaction. */
export async function importPlan(p: ImportPayload): Promise<string> {
  const { data, error } = await need().rpc('insp_am_import', { p: {
    unit_id: p.rigId, title: p.title.trim(), plan_year: p.year, planned_start: p.plannedStart,
    planned_end: p.plannedEnd, file_name: p.fileName, summary: p.summary,
    items: p.items.map((i) => ({
      sn: i.sn, section: i.section.slice(0, 60), description: i.description, category: i.category.slice(0, 40),
      interval_text: i.intervalText.slice(0, 60), applicability: i.applicability, responsible: i.responsible.slice(0, 120),
      start_date: i.startDate, end_date: i.endDate, status: i.status, comments: i.comments.slice(0, 2000),
      gantt_seq: i.ganttSeq, tasks: i.tasks.map((t) => ({ seq: t.seq, description: t.description, done: t.done })),
    })),
  } });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function saveContract(c: AmContract): Promise<void> {
  const { error } = await need().from('insp_am_contracts').upsert({
    unit_id: c.rigId, client: c.client.trim(), contract_ref: c.contractRef.trim(), am_days_allowed: c.amDaysAllowed,
    rate_basis: c.rateBasis, rate_percent: c.ratePercent, overrun_rate_percent: c.overrunRatePercent,
    daily_rate: c.dailyRate, currency: c.currency, cat_iv_cycle_years: c.catIvCycleYears,
    last_cat_iv_date: c.lastCatIvDate || null, notes: c.notes,
  }, { onConflict: 'unit_id' });
  if (error) throw new Error(error.message);
}

export type PlanPatch = Partial<Pick<AmPlan, 'title' | 'status' | 'actualStart' | 'actualEnd' | 'allowedDays' | 'rateBasis'
  | 'ratePercent' | 'overrunRatePercent' | 'dailyRate' | 'currency' | 'includesCatIv' | 'notes'>>;

const PATCH_COLS: Record<keyof PlanPatch, string> = {
  title: 'title', status: 'status', actualStart: 'actual_start', actualEnd: 'actual_end', allowedDays: 'allowed_days',
  rateBasis: 'rate_basis', ratePercent: 'rate_percent', overrunRatePercent: 'overrun_rate_percent',
  dailyRate: 'daily_rate', currency: 'currency', includesCatIv: 'includes_cat_iv', notes: 'notes',
};

export async function updatePlan(id: string, patch: PlanPatch): Promise<void> {
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) row[PATCH_COLS[k as keyof PlanPatch]] = v === '' ? null : v;
  const { error } = await need().from('insp_am_plans').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Finalize freezes the lines (DB trigger); reopen lifts it. */
export async function setFinalized(id: string, finalized: boolean): Promise<void> {
  const db = need();
  const uid = finalized ? (await db.auth.getUser()).data.user?.id ?? null : null;
  const { error } = await db.from('insp_am_plans').update(finalized
    ? { finalized_at: new Date().toISOString(), finalized_by: uid, status: 'Completed' }
    : { finalized_at: null, finalized_by: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setTaskDone(taskId: string, done: boolean): Promise<void> {
  const db = need();
  const uid = done ? (await db.auth.getUser()).data.user?.id ?? null : null;
  const { error } = await db.from('insp_am_tasks').update(done
    ? { done: true, done_by: uid, done_at: new Date().toISOString() }
    : { done: false, done_by: null, done_at: null }).eq('id', taskId);
  if (error) throw new Error(error.message);
}

export type ItemPatch = Partial<Pick<AmItem, 'status' | 'startDate' | 'endDate' | 'responsible' | 'comments'>>;

const ITEM_COLS: Record<keyof ItemPatch, string> = {
  status: 'status', startDate: 'start_date', endDate: 'end_date', responsible: 'responsible', comments: 'comments',
};

export async function updateItem(id: string, patch: ItemPatch): Promise<void> {
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) row[ITEM_COLS[k as keyof ItemPatch]] = v === '' && k.endsWith('Date') ? null : v;
  const { error } = await need().from('insp_am_items').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await need().from('insp_am_plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
