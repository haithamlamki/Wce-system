// ============================================================================
//  Parse the source system's full "Equipment Inspection" export (Inspections →
//  Export): one sheet, base columns + one column per spec field, located by
//  header name (the layout changed in Oct 2026). Unlike the per-category
//  template (workbookImport.ts) it spans all categories and may reference
//  catalog entries we don't have yet: planCatalogAdditions / applyCatalogPlan
//  create them, and referenceSync.ts mirrors the records themselves.
//  Parsing and planning are pure and unit-tested.
// ============================================================================
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import type { ApproveStatus, Company, EquipmentPart, EquipmentType, InspCategory, InspUnit,
  PartComponent, WorkingStatus } from '../types';
import { APPROVE_STATUS_LABELS, CATEGORY_LABELS, WORKING_STATUS_LABELS } from '../types';

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

/** Approval workflow as the source system recorded it (names are its own). */
export interface RefApproval {
  status: ApproveStatus;
  requestedBy: string | null; requestedAt: string | null; requestedFor: string | null;
  approvedBy: string | null; approvedAt: string | null;
}

export interface RefRow {
  company: string; unit: string; equipment: string; part: string; component: string;
  description: string; oem: string; status: WorkingStatus;
  serial: string; partNumber: string; inspectionCompany: string;
  intermediateDate: string | null; intermediateFreqMonths: number | null;
  majorDate: string | null; majorFreqMonths: number | null;
  manufactureYear: number | null; remarks: string; specs: Record<string, string>;
  /** From the export's Category column (Oct-2026 layout); null when absent. */
  category: InspCategory | null;
  elastomer: string; inspectionReport: string;
  approval: RefApproval;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_BY_LABEL = new Map(
  (Object.entries(WORKING_STATUS_LABELS) as [WorkingStatus, string][])
    .map(([v, l]) => [l.toLowerCase(), v]),
);
const CATEGORY_BY_LABEL = new Map(
  (Object.entries(CATEGORY_LABELS) as [InspCategory, string][])
    .map(([v, l]) => [l.toLowerCase(), v]),
);
const APPROVE_BY_LABEL = new Map(
  (Object.entries(APPROVE_STATUS_LABELS) as [ApproveStatus, string][])
    .map(([v, l]) => [l.toLowerCase(), v]),
);

/**
 * Field → accepted header names. The source export has been re-laid-out
 * (Oct 2026: Category column, reordered, renamed "Manufacture Year", approval
 * block appended), so columns are located by name, never by position.
 */
const FIELD_HEADERS = {
  company: ['Company'], unit: ['Unit'], category: ['Category'], equipment: ['Equipment'],
  part: ['Equipment Part'], component: ['Equipment Part Component', 'Component'],
  description: ['Component Description'], oem: ['OEM'], status: ['Status'],
  serial: ['Serial Number'], partNumber: ['Part Number'],
  inspectionCompany: ['Inspection Company'],
  iDate: ['Intermediate Inspection Date'], iDue: ['Intermediate Inspection Due Date'],
  iFreq: ['Intermediate Inspection Frequency'],
  mDate: ['Major Inspection Date'], mDue: ['Major Inspection Due Date'],
  mFreq: ['Major Inspection Frequency'],
  year: ['ManufactureYear', 'Manufacture Year'], remarks: ['Remarks'],
  elastomer: ['Elastomer Description'], inspectionReport: ['Inspection Report'],
  approveStatus: ['Approve Status'], requestedBy: ['Approval Requested By'],
  requestedAt: ['Approval Requested Date'], requestedFor: ['Approval Requested For'],
  approvedBy: ['Approved By'], approvedAt: ['Approved Date'],
} as const;
type Field = keyof typeof FIELD_HEADERS;

/** Present in every export layout and absent from the upload template. */
const REQUIRED_FIELDS: Field[] = ['company', 'unit', 'equipment', 'part', 'serial',
  'iDate', 'iDue', 'mDate', 'mDue'];
const KNOWN_HEADERS = new Set<string>(Object.values(FIELD_HEADERS).flat());

function headerIndex(hdr: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  for (const f of Object.keys(FIELD_HEADERS) as Field[]) {
    const i = hdr.findIndex((h) => (FIELD_HEADERS[f] as readonly string[]).includes(h));
    if (i >= 0) out[f] = i;
  }
  return out;
}

/**
 * Record identity, as the source system keys it: a serial may repeat on one
 * unit across different equipment / parts (mirrors insp_records_identity_key).
 */
export function recordKey(unit: string, serial: string, equipment: string,
  part: string, component: string): string {
  return [unit, serial, equipment, part, component].map((s) => s.trim().toLowerCase()).join('|');
}

function headerRow(sheet: XLSX.WorkSheet | undefined): string[] {
  if (!sheet) return [];
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  return (grid[0] ?? []).map((h) => String(h).trim());
}

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
  const idx = headerIndex(headerRow(wb.Sheets[wb.SheetNames[0]]));
  return REQUIRED_FIELDS.every((f) => idx[f] !== undefined);
}

/**
 * Parse + normalise the export: trims names, maps statuses/frequencies/years,
 * collects spec columns (every header that is not a known base column), and
 * drops in-file Unit+Serial duplicates (first wins, mirroring the DB's unique
 * index). Exports without an approval block are treated as approved.
 */
export function parseReferenceExport(wb: XLSX.WorkBook):
  { rows: RefRow[]; skippedDuplicates: number } {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  const hdr = (grid[0] ?? []).map((h) => String(h).trim());
  const idx = headerIndex(hdr);
  const specCols = hdr.map((h, i) => ({ h, i })).filter(({ h }) => h && !KNOWN_HEADERS.has(h));
  const rows: RefRow[] = [];
  const seen = new Set<string>();
  let skippedDuplicates = 0;

  for (const cells of grid.slice(1)) {
    const c = (f: Field) => (idx[f] === undefined ? '' : String(cells[idx[f]!] ?? '').trim());
    const orNull = (f: Field) => c(f) || null;
    const isoOrNull = (f: Field) => (ISO_DATE.test(c(f)) ? c(f) : null);
    const equipment = c('equipment');
    if (!equipment) continue;
    const unit = c('unit');
    const serial = c('serial');
    if (serial) {
      const key = recordKey(unit, serial, equipment, c('part'), c('component'));
      if (seen.has(key)) { skippedDuplicates++; continue; }
      seen.add(key);
    }
    const specs: Record<string, string> = {};
    for (const { h, i } of specCols) {
      const v = String(cells[i] ?? '').trim();
      if (v) specs[h] = v;
    }
    const inspCo = c('inspectionCompany');
    rows.push({
      company: c('company'), unit, equipment, part: c('part'), component: c('component'),
      description: c('description'), oem: c('oem'),
      status: STATUS_BY_LABEL.get(c('status').toLowerCase()) ?? 'in_use',
      serial, partNumber: c('partNumber'),
      inspectionCompany: inspCo === '-' ? '' : inspCo,
      intermediateDate: isoOrNull('iDate'),
      intermediateFreqMonths: freqMonths(c('iFreq')),
      majorDate: isoOrNull('mDate'),
      majorFreqMonths: freqMonths(c('mFreq')),
      manufactureYear: yearOf(c('year')), remarks: c('remarks'), specs,
      category: CATEGORY_BY_LABEL.get(c('category').toLowerCase()) ?? null,
      elastomer: c('elastomer'), inspectionReport: c('inspectionReport'),
      approval: {
        status: APPROVE_BY_LABEL.get(c('approveStatus').toLowerCase()) ?? 'approved',
        requestedBy: orNull('requestedBy'), requestedAt: isoOrNull('requestedAt'),
        requestedFor: orNull('requestedFor'),
        approvedBy: orNull('approvedBy'), approvedAt: isoOrNull('approvedAt'),
      },
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
        category: r.category ?? EQUIPMENT_CATEGORY_MAP.get(lc(r.equipment)) ?? 'others',
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

/** Case-insensitive name → id maps over the catalog, after additions. */
export interface CatalogIds {
  typeId: Map<string, string>;      // lc(type name)
  companyId: Map<string, string>;   // lc(company name)
  partId: Map<string, string>;      // `${typeId}|lc(part name)`
  compId: Map<string, string>;      // `${partId}|lc(component name)`
}

/** A database record's identity fields (see recordKey). */
export interface RecordKeyRow {
  id: string; unit_id: string; serial_number: string;
  type_name: string; part_name: string; component_name: string;
}

/** Every record's identity (paginated past PostgREST's 1000-row cap). */
export async function fetchRecordKeys(): Promise<RecordKeyRow[]> {
  const sb = need();
  const out: RecordKeyRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await sb.from('insp_records_expanded')
      .select('id,unit_id,serial_number,type_name,part_name,component_name')
      .order('id').range(from, from + 999);
    if (page.error) throw new Error(page.error.message);
    out.push(...(page.data ?? []).map((r) => ({
      id: r.id as string, unit_id: r.unit_id as string,
      serial_number: String(r.serial_number ?? ''), type_name: String(r.type_name ?? ''),
      part_name: String(r.part_name ?? ''), component_name: String(r.component_name ?? ''),
    })));
    if ((page.data ?? []).length < 1000) break;
  }
  return out;
}

/** Create the planned companies / types / parts / components; return id maps. */
export async function applyCatalogPlan(plan: CatalogPlan, onProgress: (msg: string) => void):
  Promise<CatalogIds> {
  const sb = need();
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

  return { typeId, companyId, partId, compId };
}
