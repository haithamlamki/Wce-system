// ============================================================================
//  Import the source system's full "Equipment Inspection" export (Dashboard →
//  Export Data): one sheet, 19 base columns + one column per spec field.
//  Unlike the per-category template (workbookImport.ts) this layout spans all
//  categories and may reference catalog entries we don't have yet, so the
//  orchestrator creates missing companies / types / parts / components first,
//  then imports records in batches through the audited insp_import_records RPC.
//  Parsing and planning are pure and unit-tested; only importReferenceExport
//  touches the network.
// ============================================================================
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import { importRecords, setApproval, type ImportRow } from './records';
import type { Company, EquipmentPart, EquipmentType, InspCategory, InspUnit,
  PartComponent, WorkingStatus } from '../types';
import { WORKING_STATUS_LABELS } from '../types';

/** First columns of the source export, in order — used to detect the layout. */
export const REFERENCE_HEADERS = ['Company', 'Unit', 'Equipment', 'Equipment Part',
  'Equipment Part Component', 'Component Description', 'OEM', 'Status',
  'Serial Number', 'Part Number', 'Inspection Company',
  'Intermediate Inspection Date', 'Intermediate Inspection Due Date',
  'Intermediate Inspection Frequency', 'Major Inspection Date',
  'Major Inspection Due Date', 'Major Inspection Frequency',
  'ManufactureYear', 'Remarks'] as const;

/**
 * Equipment → category, snapshot of the source system's Equipment Components
 * register (178 entries, 2026-08-12). New equipment falls back to 'others'.
 */
const CAT_CODES: Record<string, InspCategory> = {
  C: 'circulation', D: 'drilling', H: 'hoisting', O: 'others',
  P: 'power', R: 'rotary', W: 'well_control',
};
const CAT_SNAPSHOT = `C~High Pressure Hose;C~Cooling Water Tank;C~Standpipe manifold;C~Cement manifold;C~Mud Pump;C~Centrifugal Pump;C~Mud Conditioner;C~Mixing Unit;C~Trip Pump;C~Shale Shaker;C~Ground Manifold;C~Chicksan Lines;C~Mud Pump Flanges & Lines;C~Mud Pump Trailer Spool;D~Lifting Cap;D~Manual Tongs;D~Safety clamp;D~Bit Breaker;D~Rotary Bushing;D~Mud Bucket;D~Hydraulic Cathead;D~Power Tong;D~Pipe Cat;D~Crossover;D~Rig Carrier;D~Lifting Sub;D~DRIVE SUB;D~Drill Pipes;D~Drill Collar;D~Heavy Weight Drill Pipe;D~Drilling Tools and Subs;D~Pipe Doper;D~Pipe Spinner;D~Bushing Puller;D~X-Over Holder;D~Catwalk;D~Flow Line;D~Stabbing Bowl;D~Circulation Head;D~tong pull cylinder;D~BOP handling system;D~Mast;D~Substructure;D~Racking Board;D~Kelly Drive Bushing;D~Pipe Arms and Pipe Loaders;D~Spinning Wrench;D~Rig Floor;D~Bell Nipple;D~Slips;D~Stabbing Board;D~Iron Roughneck;H~Trailer Jacking Cylinder;H~BOP Clamp;H~Pneumatic Drill Line Spooler;H~Single joint;H~BOP Hoist Beams;H~Casing Running Tool;H~Rotary Swivel;H~Kelly Spinner;H~Electronic Load Cell;H~Power Swivel;H~Draw works caliper;H~Elevator Links;H~Mast & Substructure raising cylinder;H~TDS Torque tube;H~Deadline Anchor;H~Draw works;H~Top drive System;H~Crown block;H~Traveling block and hook blocks;H~Elevators;O~Intercom System;O~CCTV System;O~Air Dryer;O~Dog House;O~Third Party DROP Inspection;O~Fifth Wheel;O~Man Basket;O~Ladders;O~Camp Skid;O~Plate Lifting Clamp;O~Gas Cylinder Transport Cages;O~Container Top Lifting Lugs;O~Eye Bolt;O~Wilden Pump;O~Anchor Block;O~Mouse Hole;O~Big Bag Chemical Hopper;O~Dead Weight;O~Fast Line Clamp;O~Spool Lifter;O~Escape Device;O~Monkey Board Winch;O~Koomy Unite - Pressure Gauge;O~Draw Works - Pressure Gauge;O~Oil Seperator;O~Cable Tray Swivel;O~Power Trailer;O~Pipe Bin System;O~Swivel;O~Diesel Tank;O~Thermography Inspection;O~Mechanized Pipe Bins;O~Sack Handling Devices;O~Fall Arrestor;O~Diesel / Electric Fire Pump;O~Safety Harness;O~Tripod With Winch;O~Safety Lanyards;O~Shackles;O~Wire Rope slings;O~Web slings;O~Snatch blocks;O~Turnbuckles;O~chain blocks;O~Chain Lifting slings;O~Master Links-Lifting;O~Big Bag Lifter;O~Drum Lifter;O~Stand Post;O~Waste Oil Drum Basket;O~Container Skid;O~Welding Shop;O~Tank-Skid;O~Mud Pump Trailers;O~Air receiver;O~Air compressor;O~Power catwalk;O~Hoisting & Winches;O~Pressure and Gauges Calibration;O~EX Survey;O~Handling Gears Inspection;O~Fire Extinguisher;O~BA sets;O~H2S Sensors;O~Multi gas detection;O~Portable H2S monitor;O~Rig Skids;O~BOP Floor;O~Tool box;O~Pipe Rack;O~Rig Pins;O~BOP Trailer;O~Substructure Moving Dolly;O~Top Drive System Skid;P~AC generator;P~Circuit Breakers;P~Fuel Tanks;P~Eddy current brake;P~AC Traction Motors;P~TDS AC Traction motor;P~Ex(d) & Ex(e) Systems;P~HPU Diesel;R~Rotary table;W~Annular BOP;W~Single Ram BOP;W~Drilling Spools and Adapters;W~Choke Line;W~Test Pump;W~Choke Manifold;W~Safety Valve;W~Gray valve;W~Mud Gas Seperator (MGS);W~Bonnet;W~BOP Control unit;W~Air pump;W~Electrical Pump;W~Stripping Bottle;W~Vacuum Degasser;W~BOP Test Stump;W~Chart Recorder;W~Kill Line;W~Double Ram Preventer;W~Single Ram Preventer;W~Saver Subs;W~Kill manifold;W~Test Plug`;

export const EQUIPMENT_CATEGORY_MAP: ReadonlyMap<string, InspCategory> = new Map(
  CAT_SNAPSHOT.split(';').map((item) => {
    const [code, name] = item.split('~');
    return [name.trim().toLowerCase(), CAT_CODES[code]];
  }),
);

export interface RefRow {
  company: string; unit: string; equipment: string; part: string; component: string;
  description: string; oem: string; status: WorkingStatus;
  serial: string; partNumber: string; inspectionCompany: string;
  intermediateDate: string | null; intermediateFreqMonths: number | null;
  majorDate: string | null; majorFreqMonths: number | null;
  manufactureYear: number | null; remarks: string; specs: Record<string, string>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_BY_LABEL = new Map(
  (Object.entries(WORKING_STATUS_LABELS) as [WorkingStatus, string][])
    .map(([v, l]) => [l.toLowerCase(), v]),
);

function freqMonths(label: string): number | null {
  const m = label.trim().toLowerCase().match(/^(\d+)\s*(month|year)/);
  if (!m) return null;
  return m[2] === 'month' ? Number(m[1]) : Number(m[1]) * 12;
}

function yearOf(s: string): number | null {
  const m = s.match(/(19|20)\d{2}/);          // source years are free text
  if (!m) return null;
  const y = Number(m[0]);
  // Mirror the insp_records manufacture_year check; the source contains Excel
  // date artifacts like "1905" which mean "unknown".
  return y >= 1950 && y <= 2100 ? y : null;
}

/** True when the workbook's first sheet is the source system's full export. */
export function isReferenceExport(wb: XLSX.WorkBook): boolean {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return false;
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  const hdr = (grid[0] ?? []).map((h) => String(h).trim());
  return REFERENCE_HEADERS.every((h, i) => hdr[i] === h);
}

/**
 * Parse + normalise the export: trims names, maps statuses/frequencies/years,
 * collects spec columns, and drops in-file Unit+Serial duplicates (first wins,
 * mirroring the DB's unique index).
 */
export function parseReferenceExport(wb: XLSX.WorkBook):
  { rows: RefRow[]; skippedDuplicates: number } {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  const specHeaders = (grid[0] ?? []).slice(REFERENCE_HEADERS.length).map((h) => String(h).trim());
  const rows: RefRow[] = [];
  const seen = new Set<string>();
  let skippedDuplicates = 0;

  for (const cells of grid.slice(1)) {
    const c = (n: number) => String(cells[n] ?? '').trim();
    const equipment = c(2);
    if (!equipment) continue;
    const unit = c(1);
    const serial = c(8);
    if (serial) {
      const key = `${unit.toLowerCase()}|${serial.toLowerCase()}`;
      if (seen.has(key)) { skippedDuplicates++; continue; }
      seen.add(key);
    }
    const specs: Record<string, string> = {};
    specHeaders.forEach((h, i) => {
      const v = c(REFERENCE_HEADERS.length + i);
      if (v) specs[h] = v;
    });
    const iDate = c(11); const mDate = c(14);
    rows.push({
      company: c(0), unit, equipment, part: c(3), component: c(4),
      description: c(5), oem: c(6),
      status: STATUS_BY_LABEL.get(c(7).toLowerCase()) ?? 'in_use',
      serial, partNumber: c(9),
      inspectionCompany: c(10) === '-' ? '' : c(10),
      intermediateDate: ISO_DATE.test(iDate) ? iDate : null,
      intermediateFreqMonths: freqMonths(c(13)),
      majorDate: ISO_DATE.test(mDate) ? mDate : null,
      majorFreqMonths: freqMonths(c(16)),
      manufactureYear: yearOf(c(17)), remarks: c(18), specs,
    });
  }
  return { rows, skippedDuplicates };
}

export interface CatalogPlan {
  companies: string[];
  types: { name: string; category: InspCategory; specFields: string[] }[];
  parts: { equipment: string; name: string }[];
  components: { equipment: string; part: string; name: string }[];
  unknownUnits: string[];
}

/** What the catalog is missing for these rows (pure; case-insensitive). */
export function planCatalogAdditions(rows: RefRow[], ctx: {
  types: EquipmentType[]; parts: EquipmentPart[]; components: PartComponent[];
  units: InspUnit[]; companies: Company[];
}): CatalogPlan {
  const lc = (s: string) => s.toLowerCase();
  const haveCompany = new Set(ctx.companies.map((c) => lc(c.name)));
  const haveType = new Map(ctx.types.map((t) => [lc(t.name), t]));
  const havePart = new Set(ctx.parts.map((p) => {
    const t = ctx.types.find((x) => x.id === p.typeId);
    return t ? `${lc(t.name)}|${lc(p.name)}` : '';
  }));
  const haveComp = new Set(ctx.components.map((k) => {
    const p = ctx.parts.find((x) => x.id === k.partId);
    const t = p && ctx.types.find((x) => x.id === p.typeId);
    return t && p ? `${lc(t.name)}|${lc(p.name)}|${lc(k.name)}` : '';
  }));
  const haveUnit = new Set(ctx.units.map((u) => lc(u.name)));

  const companies = new Map<string, string>();
  const types = new Map<string, { name: string; category: InspCategory; specFields: Set<string> }>();
  const parts = new Map<string, { equipment: string; name: string }>();
  const components = new Map<string, { equipment: string; part: string; name: string }>();
  const unknownUnits = new Set<string>();

  for (const r of rows) {
    if (r.company && !haveCompany.has(lc(r.company))) companies.set(lc(r.company), r.company);
    if (!haveUnit.has(lc(r.unit))) unknownUnits.add(r.unit);
    if (!haveType.has(lc(r.equipment))) {
      const e = types.get(lc(r.equipment)) ?? {
        name: r.equipment,
        category: EQUIPMENT_CATEGORY_MAP.get(lc(r.equipment)) ?? 'others',
        specFields: new Set<string>(),
      };
      Object.keys(r.specs).forEach((f) => e.specFields.add(f));
      types.set(lc(r.equipment), e);
    }
    if (r.part && !havePart.has(`${lc(r.equipment)}|${lc(r.part)}`)) {
      parts.set(`${lc(r.equipment)}|${lc(r.part)}`, { equipment: r.equipment, name: r.part });
    }
    if (r.part && r.component
        && !haveComp.has(`${lc(r.equipment)}|${lc(r.part)}|${lc(r.component)}`)) {
      components.set(`${lc(r.equipment)}|${lc(r.part)}|${lc(r.component)}`,
        { equipment: r.equipment, part: r.part, name: r.component });
    }
  }
  return {
    companies: [...companies.values()],
    types: [...types.values()].map((t) => ({ ...t, specFields: [...t.specFields] })),
    parts: [...parts.values()],
    components: [...components.values()],
    unknownUnits: [...unknownUnits],
  };
}

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

const BATCH = 500;

export interface ReferenceImportResult {
  imported: number;
  skippedDuplicates: number;    // in-file + already-in-database
  catalogCreated: { companies: number; types: number; parts: number; components: number };
  approved: number;
}

/**
 * Full import: create missing catalog entries, then import records in batches
 * via the audited RPC (as Pending Approval), then approve them (historical
 * data arrives already approved in the source system). Idempotent: rows whose
 * Unit+Serial already exist in the database are skipped.
 */
export async function importReferenceExport(
  wb: XLSX.WorkBook,
  ctx: { types: EquipmentType[]; parts: EquipmentPart[]; components: PartComponent[];
    units: InspUnit[]; companies: Company[] },
  approverId: string,
  onProgress: (msg: string) => void,
): Promise<ReferenceImportResult> {
  const sb = need();
  const { rows, skippedDuplicates } = parseReferenceExport(wb);
  const plan = planCatalogAdditions(rows, ctx);
  if (plan.unknownUnits.length) {
    throw new Error(`Unknown units (create them in the shared units register first): ${plan.unknownUnits.join(', ')}`);
  }

  // ---- 1) catalog additions -------------------------------------------------
  onProgress(`Creating ${plan.companies.length} companies, ${plan.types.length} equipment types, `
    + `${plan.parts.length} parts, ${plan.components.length} components…`);
  if (plan.companies.length) {
    const { error } = await sb.from('insp_companies')
      .insert(plan.companies.map((name) => ({ name })));
    if (error) throw new Error(error.message);
  }
  if (plan.types.length) {
    const { error } = await sb.from('insp_equipment_types').insert(plan.types.map((t) => ({
      category: t.category, name: t.name, description: t.name, spec_fields: t.specFields,
    })));
    if (error) throw new Error(error.message);
  }

  // fresh id maps (case-insensitive name → id)
  const [tps, cos] = await Promise.all([
    sb.from('insp_equipment_types').select('id,name'),
    sb.from('insp_companies').select('id,name'),
  ]);
  if (tps.error) throw new Error(tps.error.message);
  if (cos.error) throw new Error(cos.error.message);
  const typeId = new Map((tps.data ?? []).map((t) => [String(t.name).toLowerCase(), t.id as string]));
  const companyId = new Map((cos.data ?? []).map((c) => [String(c.name).toLowerCase(), c.id as string]));

  if (plan.parts.length) {
    const { error } = await sb.from('insp_equipment_parts').insert(plan.parts.map((p, i) => ({
      type_id: typeId.get(p.equipment.toLowerCase()), name: p.name, description: p.name, position: i + 1,
    })));
    if (error) throw new Error(error.message);
  }
  const pts = await sb.from('insp_equipment_parts').select('id,type_id,name');
  if (pts.error) throw new Error(pts.error.message);
  const partId = new Map((pts.data ?? []).map((p) => [`${p.type_id}|${String(p.name).toLowerCase()}`, p.id as string]));

  if (plan.components.length) {
    const { error } = await sb.from('insp_part_components').insert(plan.components.map((k, i) => ({
      part_id: partId.get(`${typeId.get(k.equipment.toLowerCase())}|${k.part.toLowerCase()}`),
      name: k.name, description: k.name, position: i + 1,
    })));
    if (error) throw new Error(error.message);
  }
  const cps = await sb.from('insp_part_components').select('id,part_id,name');
  if (cps.error) throw new Error(cps.error.message);
  const compId = new Map((cps.data ?? []).map((k) => [`${k.part_id}|${String(k.name).toLowerCase()}`, k.id as string]));

  // ---- 2) skip rows already in the database (idempotent re-runs) ------------
  // Paginate: PostgREST silently caps un-ranged selects at 1000 rows.
  const unitId = new Map(ctx.units.map((u) => [u.name.toLowerCase(), u.id]));
  const inDb = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const existing = await sb.from('insp_records')
      .select('unit_id,serial_number').range(from, from + 999);
    if (existing.error) throw new Error(existing.error.message);
    for (const r of existing.data ?? []) {
      if (r.serial_number) inDb.add(`${r.unit_id}|${String(r.serial_number).toLowerCase()}`);
    }
    if ((existing.data ?? []).length < 1000) break;
  }

  const drafts: ImportRow[] = [];
  let dupes = skippedDuplicates;
  for (const r of rows) {
    const uid = unitId.get(r.unit.toLowerCase())!;
    if (r.serial && inDb.has(`${uid}|${r.serial.toLowerCase()}`)) { dupes++; continue; }
    const tid = typeId.get(r.equipment.toLowerCase())!;
    const pid = r.part ? partId.get(`${tid}|${r.part.toLowerCase()}`) ?? null : null;
    drafts.push({
      type_id: tid, part_id: pid,
      component_id: r.component && pid ? compId.get(`${pid}|${r.component.toLowerCase()}`) ?? null : null,
      unit_id: uid,
      company_id: r.company ? companyId.get(r.company.toLowerCase()) ?? null : null,
      component_description: r.description, oem: r.oem,
      inspection_company: r.inspectionCompany,
      serial_number: r.serial, part_number: r.partNumber,
      working_status: r.status, manufacture_year: r.manufactureYear,
      intermediate_date: r.intermediateDate, intermediate_freq_months: r.intermediateFreqMonths,
      major_date: r.majorDate, major_freq_months: r.majorFreqMonths,
      remarks: r.remarks, specs: r.specs,
    });
  }

  // ---- 3) batched import through the audited RPC ----------------------------
  let imported = 0;
  for (let i = 0; i < drafts.length; i += BATCH) {
    const batch = drafts.slice(i, i + BATCH).map((d) => ({ ...d, approver_id: approverId }));
    imported += await importRecords(batch);
    onProgress(`Imported ${Math.min(i + BATCH, drafts.length)} / ${drafts.length} records…`);
  }

  // ---- 4) approve what we just imported (source data is already approved) ---
  // Select-then-approve until the pending set drains; each pass re-queries so
  // PostgREST's 1000-row select cap cannot strand records.
  onProgress('Approving imported records…');
  let approved = 0;
  for (;;) {
    const pending = await sb.from('insp_records')
      .select('id').eq('approve_status', 'pending_approval')
      .eq('approver_id', approverId).limit(BATCH);
    if (pending.error) throw new Error(pending.error.message);
    const ids = (pending.data ?? []).map((r) => r.id as string);
    if (ids.length === 0) break;
    approved += await setApproval(ids, true);
    onProgress(`Approved ${approved} records…`);
  }

  return {
    imported, skippedDuplicates: dupes,
    catalogCreated: {
      companies: plan.companies.length, types: plan.types.length,
      parts: plan.parts.length, components: plan.components.length,
    },
    approved,
  };
}
