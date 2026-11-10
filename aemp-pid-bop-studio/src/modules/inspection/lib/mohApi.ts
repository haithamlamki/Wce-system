// ============================================================================
//  Major Overhaul — data access for the tables / RPC in migration 0053. RLS
//  scopes every rig-level read and write to the caller's units; this file
//  only maps rows between snake_case columns and the lib/moh.ts types.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { InspectionDate, IntervalBasis, MohCategory, MohItem, MohProject, MohUnit, ProjectStatus } from './moh';

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
  };
}

export async function fetchMohData(): Promise<MohData> {
  const [itemRows, links, units, projects, rigItems, rpc] = await Promise.all([
    all('insp_moh_items', '*', (r) => r),
    all('insp_moh_item_types', 'item_id,type_id', (r) => ({ itemId: r.item_id as string, typeId: r.type_id as string })),
    all('insp_moh_units', '*', mapUnit),
    all('insp_moh_projects', '*', mapProject),
    all('insp_moh_rig_items', 'unit_id,item_id,applicable', (r) => r),
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
  return { items, units, inspection, projects, notApplicable };
}

export async function setApplicable(rigId: string, itemId: string, applicable: boolean): Promise<void> {
  const { error } = await need().from('insp_moh_rig_items')
    .upsert({ unit_id: rigId, item_id: itemId, applicable }, { onConflict: 'unit_id,item_id' });
  if (error) throw new Error(error.message);
}

export async function saveUnit(u: Omit<MohUnit, 'id'> & { id?: string }): Promise<void> {
  const row = {
    unit_id: u.rigId, item_id: u.itemId, asset_number: u.assetNumber.trim(),
    equipment_number: u.equipmentNumber.trim(), last_moh_date: u.lastMohDate || null,
    last_moh_year: u.lastMohYear, last_moh_hours: u.lastMohHours, current_hours: u.currentHours,
    avg_hours_per_year: u.avgHoursPerYear, remarks: u.remarks,
  };
  const { error } = u.id
    ? await need().from('insp_moh_units').update(row).eq('id', u.id)
    : await need().from('insp_moh_units').insert(row);
  if (error) throw new Error(error.message);
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
