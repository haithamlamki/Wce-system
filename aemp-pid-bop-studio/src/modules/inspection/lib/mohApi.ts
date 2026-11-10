// ============================================================================
//  Major Overhaul — data access for the tables / RPC in migration 0053. RLS
//  scopes every rig-level read and write to the caller's units; this file
//  only maps rows between snake_case columns and the lib/moh.ts types.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { ImportPlan } from './mohImport';
import {
  CURRENCIES, type Currency, type InspectionDate, type IntervalBasis, type MohCategory, type MohItem,
  type MohProject, type MohUnit, type ProjectStatus, type RigMeta,
} from './moh';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown): string => (v as string | null) ?? '';

/** Pages through a table so large rig sets are never silently truncated at 1000. */
async function all<T>(table: string, cols: string, map: (r: Record<string, unknown>) => T): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await need().from(table).select(cols).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows.map(map));
    if (rows.length < PAGE) return out;
  }
}

export interface MohData {
  items: MohItem[];
  units: MohUnit[];
  inspection: InspectionDate[];
  projects: MohProject[];
  /** `rigId|itemId` keys marked not applicable. */
  notApplicable: Set<string>;
  /** Per-rig planner details keyed by rig (unit) id; missing = defaults. */
  rigMeta: Map<string, RigMeta>;
}

function mapMeta(r: Record<string, unknown>): RigMeta {
  const c = r.currency as Currency;
  return {
    rigId: r.unit_id as string, location: str(r.location),
    currency: (CURRENCIES as readonly string[]).includes(c) ? c : 'OMR',
    preparedBy: str(r.prepared_by), remarks: str(r.remarks),
  };
}

function mapUnit(r: Record<string, unknown>): MohUnit {
  return {
    id: r.id as string, rigId: r.unit_id as string, itemId: r.item_id as string,
    assetNumber: str(r.asset_number), equipmentNumber: str(r.equipment_number),
    lastMohDate: (r.last_moh_date as string) ?? null, lastMohYear: num(r.last_moh_year),
    lastMohHours: num(r.last_moh_hours), currentHours: num(r.current_hours),
    avgHoursPerYear: num(r.avg_hours_per_year), remarks: str(r.remarks),
  };
}

function mapProject(r: Record<string, unknown>): MohProject {
  return {
    id: r.id as string, rigId: r.unit_id as string, itemId: r.item_id as string,
    mohUnitId: (r.moh_unit_id as string) ?? null, year: Number(r.plan_year),
    plannedMonth: num(r.planned_month), startDate: (r.start_date as string) ?? null,
    durationDays: num(r.duration_days), vendor: str(r.vendor), poNumber: str(r.po_number),
    prNumber: str(r.pr_number), responsible: str(r.responsible),
    status: (r.status as ProjectStatus) ?? 'Not Started', comments: str(r.comments),
    estimatedCost: num(r.estimated_cost),
  };
}

export async function fetchMohData(): Promise<MohData> {
  const [itemRows, links, units, projects, rigItems, metaRows, rpc] = await Promise.all([
    all('insp_moh_items', '*', (r) => r),
    all('insp_moh_item_types', 'item_id,type_id', (r) => ({ itemId: r.item_id as string, typeId: r.type_id as string })),
    all('insp_moh_units', '*', mapUnit),
    all('insp_moh_projects', '*', mapProject),
    all('insp_moh_rig_items', 'unit_id,item_id,applicable', (r) => r),
    all('insp_moh_rig_meta', 'unit_id,location,currency,prepared_by,remarks', mapMeta),
    need().rpc('insp_moh_inspection_dates'),
  ]);
  if (rpc.error) throw new Error(rpc.error.message);
  const typeIds = new Map<string, string[]>();
  for (const l of links) typeIds.set(l.itemId, [...(typeIds.get(l.itemId) ?? []), l.typeId]);
  const items: MohItem[] = itemRows.map((r) => ({
    id: r.id as string, sno: Number(r.sno), description: str(r.description),
    category: r.category as MohCategory, basis: r.interval_basis as IntervalBasis,
    interval: num(r.interval_value), active: r.active !== false, typeIds: typeIds.get(r.id as string) ?? [],
  }));
  const inspection: InspectionDate[] = ((rpc.data ?? []) as Record<string, unknown>[]).map((r) => ({
    rigId: r.unit_id as string, itemId: r.item_id as string,
    lastMajor: (r.last_major as string) ?? null, nextMajorDue: (r.next_major_due as string) ?? null,
    components: Number(r.components ?? 0), overdueComponents: Number(r.overdue_components ?? 0),
  }));
  const notApplicable = new Set(rigItems.filter((r) => r.applicable === false)
    .map((r) => `${r.unit_id as string}|${r.item_id as string}`));
  const rigMeta = new Map(metaRows.map((m) => [m.rigId, m]));
  return { items, units, inspection, projects, notApplicable, rigMeta };
}

export async function setApplicable(rigId: string, itemId: string, applicable: boolean): Promise<void> {
  const { error } = await need().from('insp_moh_rig_items')
    .upsert({ unit_id: rigId, item_id: itemId, applicable }, { onConflict: 'unit_id,item_id' });
  if (error) throw new Error(error.message);
}

export async function saveUnit(u: Omit<MohUnit, 'id'> & { id?: string }): Promise<string> {
  const row = {
    unit_id: u.rigId, item_id: u.itemId, asset_number: u.assetNumber.trim(),
    equipment_number: u.equipmentNumber.trim(), last_moh_date: u.lastMohDate || null,
    last_moh_year: u.lastMohYear, last_moh_hours: u.lastMohHours, current_hours: u.currentHours,
    avg_hours_per_year: u.avgHoursPerYear, remarks: u.remarks,
  };
  const { data, error } = u.id
    ? await need().from('insp_moh_units').update(row).eq('id', u.id).select('id').single()
    : await need().from('insp_moh_units').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteUnit(id: string): Promise<void> {
  const { error } = await need().from('insp_moh_units').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function saveProject(p: MohProject): Promise<void> {
  const row = {
    unit_id: p.rigId, item_id: p.itemId, moh_unit_id: p.mohUnitId, plan_year: p.year,
    planned_month: p.plannedMonth, start_date: p.startDate || null, duration_days: p.durationDays,
    vendor: p.vendor.trim(), po_number: p.poNumber.trim(), pr_number: p.prNumber.trim(),
    responsible: p.responsible.trim(), status: p.status, comments: p.comments,
    estimated_cost: p.estimatedCost,
  };
  // The unique key uses coalesce(moh_unit_id) so it cannot back an upsert target:
  // update by id when the project exists, insert otherwise.
  const { error } = p.id
    ? await need().from('insp_moh_projects').update(row).eq('id', p.id)
    : await need().from('insp_moh_projects').insert(row);
  if (error) throw new Error(error.message);
}

export async function saveItem(i: Omit<MohItem, 'id' | 'typeIds'> & { id?: string }): Promise<void> {
  const row = {
    sno: i.sno, description: i.description.trim(), category: i.category,
    interval_basis: i.basis, interval_value: i.interval, active: i.active,
  };
  const { error } = i.id
    ? await need().from('insp_moh_items').update(row).eq('id', i.id)
    : await need().from('insp_moh_items').insert(row);
  if (error) {
    throw new Error(/insp_moh_items_description/.test(error.message)
      ? 'An equipment item with that description already exists.' : error.message);
  }
}

/** Replaces an item's linked inspection equipment types. */
export async function setItemTypes(itemId: string, typeIds: string[]): Promise<void> {
  const db = need();
  const del = await db.from('insp_moh_item_types').delete().eq('item_id', itemId);
  if (del.error) throw new Error(del.error.message);
  if (!typeIds.length) return;
  const ins = await db.from('insp_moh_item_types').insert(typeIds.map((t) => ({ item_id: itemId, type_id: t })));
  if (ins.error) throw new Error(ins.error.message);
}

export async function saveRigMeta(m: RigMeta): Promise<void> {
  const { error } = await need().from('insp_moh_rig_meta').upsert({
    unit_id: m.rigId, location: m.location.trim(), currency: m.currency,
    prepared_by: m.preparedBy.trim(), remarks: m.remarks,
  }, { onConflict: 'unit_id' });
  if (error) throw new Error(error.message);
}

export interface ImportResult { units: number; projects: number; rigs: number; failed: string[] }

/**
 * Writes an import plan: units first (new ones return their id), then the
 * projects that hang off them, then rig details. Rows are written one by one so
 * a single rejected row (RLS, constraint) is reported without losing the rest.
 */
export async function applyImport(plan: ImportPlan, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const res: ImportResult = { units: 0, projects: 0, rigs: 0, failed: [] };
  const ids = new Map<string, string>();
  const total = plan.units.length + plan.projects.length + plan.rigMeta.length;
  let done = 0;
  const tick = () => { done += 1; onProgress?.(done, total); };
  for (const w of plan.units) {
    try { ids.set(w.ref, await saveUnit({ ...w.unit, id: w.id })); res.units += 1; }
    catch (e) { res.failed.push(`Unit ${w.unit.assetNumber || w.unit.equipmentNumber || '(untagged)'}: ${(e as Error).message}`); }
    tick();
  }
  for (const pw of plan.projects) {
    const unitId = ids.get(pw.unitRef);
    if (!unitId) { res.failed.push(`Project ${pw.project.year}: its unit could not be saved.`); tick(); continue; }
    try { await saveProject({ ...pw.project, mohUnitId: unitId }); res.projects += 1; }
    catch (e) { res.failed.push(`Project ${pw.project.year}: ${(e as Error).message}`); }
    tick();
  }
  for (const m of plan.rigMeta) {
    try { await saveRigMeta(m); res.rigs += 1; } catch (e) { res.failed.push(`Rig details: ${(e as Error).message}`); }
    tick();
  }
  return res;
}
