// ============================================================================
//  Mirror the source system's full export into ours. Where referenceImport
//  only adds records it has never seen, the sync makes the database match the
//  export: it creates missing units / catalog entries, corrects equipment-type
//  categories, updates every record matched on Unit + Serial (approval state
//  included) and inserts the rest via the insp_sync_reference RPC. Records the
//  export no longer contains are reported, never deleted here.
//  Planning is pure and unit-tested; a dry run stops before the first write.
// ============================================================================
import type * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import { applyCatalogPlan, fetchRecordKeys, parseReferenceExport, planCatalogAdditions,
  recordKey, type RecordKeyRow, type RefRow } from './referenceImport';
import type { Company, EquipmentPart, EquipmentType, InspCategory, InspUnit,
  PartComponent } from '../types';

const BATCH = 500;

/** lc(unit) → display name; a capitalised spelling wins over "hoist 2". */
export function canonicalUnitNames(rows: RefRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const { unit } of rows) {
    const key = unit.toLowerCase();
    const cur = out.get(key);
    if (!cur || (!/^[A-Z]/.test(cur) && /^[A-Z]/.test(unit))) out.set(key, unit);
  }
  return out;
}

export interface SyncPlan { inserts: number; updates: number; orphanIds: string[] }

const pairKey = (unit: string, serial: string) => `${unit}|${serial.toLowerCase()}`;

/** lc(unit)|lc(serial) pairs that occur exactly once in the export. */
export function uniqueSerialPairs(rows: RefRow[]): Set<string> {
  const n = new Map<string, number>();
  for (const r of rows) {
    if (r.serial) n.set(pairKey(r.unit.toLowerCase(), r.serial), (n.get(pairKey(r.unit.toLowerCase(), r.serial)) ?? 0) + 1);
  }
  return new Set([...n].filter(([, c]) => c === 1).map(([k]) => k));
}

/**
 * How the rows land against the records already in the database — the same
 * rule insp_sync_reference applies: match the full identity, else (when the
 * unit+serial is unique in the file and held by exactly one record) follow
 * that record through an upstream equipment/part change, else insert.
 */
export function planSync(
  rows: RefRow[],
  unitIdByName: Map<string, string>,
  existing: RecordKeyRow[],
): SyncPlan {
  const byFull = new Map<string, string>();
  const byPair = new Map<string, string[]>();
  for (const e of existing) {
    if (!e.serial_number) continue;
    byFull.set(recordKey(e.unit_id, e.serial_number, e.type_name, e.part_name, e.component_name), e.id);
    const k = pairKey(e.unit_id, e.serial_number);
    byPair.set(k, [...(byPair.get(k) ?? []), e.id]);
  }
  const unique = uniqueSerialPairs(rows);
  const matched = new Set<string>();
  let inserts = 0; let updates = 0;
  for (const r of rows) {
    const uid = unitIdByName.get(r.unit.toLowerCase()) ?? `new:${r.unit.toLowerCase()}`;
    let id: string | undefined;
    if (r.serial) {
      id = byFull.get(recordKey(uid, r.serial, r.equipment, r.part, r.component));
      const held = byPair.get(pairKey(uid, r.serial)) ?? [];
      if (!id && unique.has(pairKey(r.unit.toLowerCase(), r.serial)) && held.length === 1) id = held[0];
    }
    if (id) { updates++; matched.add(id); } else inserts++;
  }
  return { inserts, updates, orphanIds: existing.filter((e) => !matched.has(e.id)).map((e) => e.id) };
}

export interface CategoryFix { id: string; name: string; from: InspCategory; to: InspCategory }

/** Existing types whose category disagrees with the export's majority vote. */
export function categoryFixes(rows: RefRow[], types: EquipmentType[]): CategoryFix[] {
  const votes = new Map<string, Map<InspCategory, number>>();
  for (const r of rows) {
    if (!r.category) continue;
    const key = r.equipment.toLowerCase();
    const v = votes.get(key) ?? new Map<InspCategory, number>();
    v.set(r.category, (v.get(r.category) ?? 0) + 1);
    votes.set(key, v);
  }
  const fixes: CategoryFix[] = [];
  for (const t of types) {
    const v = votes.get(t.name.toLowerCase());
    if (!v) continue;
    const [to] = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
    if (to !== t.category) fixes.push({ id: t.id, name: t.name, from: t.category, to });
  }
  return fixes;
}

export interface SyncReport {
  rows: number;
  skippedDuplicates: number;
  unitsCreated: string[];
  catalogCreated: { companies: number; types: number; parts: number; components: number };
  categoryFixes: CategoryFix[];
  inserts: number;
  updates: number;
  orphanIds: string[];
  pendingApproval: number;
  dryRun: boolean;
}

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export async function syncReferenceExport(
  wb: XLSX.WorkBook,
  ctx: { types: EquipmentType[]; parts: EquipmentPart[]; components: PartComponent[];
    units: InspUnit[]; companies: Company[] },
  onProgress: (msg: string) => void,
  opts: { dryRun: boolean },
): Promise<SyncReport> {
  const sb = need();
  const { rows, skippedDuplicates } = parseReferenceExport(wb);
  const haveUnit = new Set(ctx.units.map((u) => u.name.toLowerCase()));
  const newUnits = [...canonicalUnitNames(rows).entries()]
    .filter(([key]) => !haveUnit.has(key)).map(([, name]) => name);
  const plan = planCatalogAdditions(rows, ctx);
  const fixes = categoryFixes(rows, ctx.types);
  const unitIdByName = new Map(ctx.units.map((u) => [u.name.toLowerCase(), u.id]));
  const existing = await fetchRecordKeys();
  const diff = planSync(rows, unitIdByName, existing);
  const report: SyncReport = {
    rows: rows.length, skippedDuplicates, unitsCreated: newUnits,
    catalogCreated: { companies: plan.companies.length, types: plan.types.length,
      parts: plan.parts.length, components: plan.components.length },
    categoryFixes: fixes, inserts: diff.inserts, updates: diff.updates,
    orphanIds: diff.orphanIds,
    pendingApproval: rows.filter((r) => r.approval.status === 'pending_approval').length,
    dryRun: opts.dryRun,
  };
  if (opts.dryRun) return report;

  // ---- 1) units, catalog, categories -----------------------------------------
  if (newUnits.length) {
    onProgress(`Creating ${newUnits.length} units…`);
    const { data, error } = await sb.from('units').insert(newUnits.map((name) => ({
      name, unit_type: /^hoist/i.test(name) ? 'hoist' : 'rig',
    }))).select('id,name');
    if (error) throw new Error(error.message);
    for (const u of data ?? []) unitIdByName.set(String(u.name).toLowerCase(), u.id as string);
  }
  const ids = await applyCatalogPlan(plan, onProgress);
  for (const f of fixes) {
    const { error } = await sb.from('insp_equipment_types').update({ category: f.to }).eq('id', f.id);
    if (error) throw new Error(error.message);
  }

  // ---- 2) records: upsert on the record identity -------------------------------
  const unique = uniqueSerialPairs(rows);
  const payload = rows.map((r) => {
    const tid = ids.typeId.get(r.equipment.toLowerCase())!;
    const pid = r.part ? ids.partId.get(`${tid}|${r.part.toLowerCase()}`) ?? null : null;
    return {
      type_id: tid, part_id: pid,
      component_id: r.component && pid ? ids.compId.get(`${pid}|${r.component.toLowerCase()}`) ?? null : null,
      unit_id: unitIdByName.get(r.unit.toLowerCase())!,
      company_id: r.company ? ids.companyId.get(r.company.toLowerCase()) ?? null : null,
      component_description: r.description, oem: r.oem, inspection_company: r.inspectionCompany,
      serial_number: r.serial, part_number: r.partNumber, working_status: r.status,
      manufacture_year: r.manufactureYear,
      intermediate_date: r.intermediateDate, intermediate_freq_months: r.intermediateFreqMonths,
      major_date: r.majorDate, major_freq_months: r.majorFreqMonths,
      remarks: r.remarks, specs: r.specs,
      elastomer_description: r.elastomer, inspection_report: r.inspectionReport,
      approve_status: r.approval.status,
      approval_requested_by: r.approval.requestedBy,
      approval_requested_for: r.approval.requestedFor,
      approval_requested_at: r.approval.requestedAt,
      approved_by_name: r.approval.approvedBy,
      approved_at: r.approval.approvedAt,
      category: r.category,                  // kept only where it differs from the type's (0047)
      match_serial: r.serial ? unique.has(pairKey(r.unit.toLowerCase(), r.serial)) : false,
    };
  });
  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await sb.rpc('insp_sync_reference', { p_rows: payload.slice(i, i + BATCH) });
    if (error) throw new Error(error.message);
    onProgress(`Synced ${Math.min(i + BATCH, payload.length)} / ${payload.length} records…`);
  }
  return report;
}
