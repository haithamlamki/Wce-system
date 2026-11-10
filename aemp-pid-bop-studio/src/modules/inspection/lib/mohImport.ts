// ============================================================================
//  Major Overhaul — Excel import (the HTML's "Excel Import"), DB-backed.
//  A sheet row = one MOH unit on a rig (+ optionally one planned-year project).
//  Rows must name an existing rig in the caller's scope and an existing
//  equipment-master item; nothing is auto-created, every miss is reported.
//  planImport() is pure: it turns sheet rows into a write plan + row errors,
//  which the UI previews before applyImport() (mohApi) touches the database.
// ============================================================================
import {
  CURRENCIES, PROJECT_STATUSES, blankRigMeta,
  type Currency, type MohItem, type MohProject, type MohUnit, type ProjectStatus, type Rig, type RigMeta,
} from './moh';

export type Cell = string | number | boolean | null | undefined;

/** Template header, in order. Matching is by alias, so column order is free. */
export const TEMPLATE_HEADERS = [
  'Rig', 'Equipment', 'Asset Number', 'Equipment Number', 'Last MOH Date', 'Last MOH Year',
  'Last MOH Hours', 'Current Hours', 'Average Hours/Year', 'Remarks',
  'Planned MOH Year', 'Project Status', 'Estimated Cost', 'Vendor / Workshop', 'PO Number', 'PR Number',
  'Responsible Person', 'Project Comments', 'Location', 'Currency', 'Prepared By',
] as const;

type Field =
  | 'rig' | 'equipment' | 'asset' | 'eqno' | 'lastDate' | 'lastYear' | 'lastHours' | 'curHours' | 'avgHours'
  | 'remarks' | 'year' | 'status' | 'cost' | 'vendor' | 'po' | 'pr' | 'responsible' | 'comments'
  | 'location' | 'currency' | 'preparedBy';

const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES: Record<Field, string[]> = {
  rig: ['rig', 'rigname', 'rigno', 'rignumber', 'unit', 'hoist'],
  equipment: ['equipment', 'equipmentdescription', 'description', 'item', 'equipmenttype'],
  asset: ['assetnumber', 'assetno', 'asset', 'unittag'],
  eqno: ['equipmentnumber', 'equipmentno', 'eqno', 'tag', 'tagno', 'serialno', 'serialnumber'],
  lastDate: ['lastmohdate', 'lastoverhauldate', 'lastmoh'],
  lastYear: ['lastmohyear', 'lastoverhaulyear'],
  lastHours: ['lastmohhours', 'lastmohhrs', 'lastmohhourmeter'],
  curHours: ['currenthours', 'currenthrs', 'currenthourmeter'],
  avgHours: ['averagehoursyear', 'avghrsyear', 'avghoursyear', 'averagehoursperyear'],
  remarks: ['remarks', 'unitremarks'],
  year: ['plannedmohyear', 'mohyear', 'planyear', 'year'],
  status: ['projectstatus', 'status', 'currentstatus'],
  cost: ['estimatedcost', 'cost', 'budget'],
  vendor: ['vendorworkshop', 'vendor', 'workshop'],
  po: ['ponumber', 'po', 'pono'],
  pr: ['prnumber', 'pr', 'prno'],
  responsible: ['responsibleperson', 'responsible'],
  comments: ['projectcomments', 'comments'],
  location: ['location'],
  currency: ['currency'],
  preparedBy: ['preparedby'],
};
const ALIAS_TO_FIELD = new Map<string, Field>(
  (Object.entries(ALIASES) as [Field, string[]][]).flatMap(([f, as]) => as.map((a) => [a, f] as [string, Field])));

export interface Header { row: number; cols: Partial<Record<Field, number>> }

/** Finds the header row (first 25 rows): needs Rig + Equipment, most matches wins. */
export function detectHeader(aoa: Cell[][]): Header {
  let best: Header | null = null, bestScore = 0;
  for (let i = 0; i < Math.min(aoa.length, 25); i += 1) {
    const cols: Partial<Record<Field, number>> = {};
    (aoa[i] ?? []).forEach((v, j) => {
      const f = ALIAS_TO_FIELD.get(key(v));
      if (f && cols[f] === undefined) cols[f] = j;
    });
    if (cols.equipment === undefined || cols.rig === undefined) continue;
    const score = Object.keys(cols).length;
    if (score > bestScore) { best = { row: i, cols }; bestScore = score; }
  }
  if (!best) throw new Error('Could not find the header row. It needs at least "Rig" and "Equipment" columns.');
  return best;
}

const text = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim());

/** Excel serial day → ISO date (1900 date system; serials ≥ 61, after the fake leap day). */
function serialToISO(n: number): string | null {
  if (!Number.isFinite(n) || n < 61 || n > 200000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2200 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? dt.toISOString().slice(0, 10) : null;
}

/** Accepts an Excel serial, YYYY-MM-DD, DD/MM/YYYY (day first, as in Oman) or `15 Jan 2024`. */
export function parseDate(v: Cell): string | null {
  if (typeof v === 'number') return serialToISO(v);
  const s = text(v);
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s,-]+(\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  if (/^\d+(\.\d+)?$/.test(s)) return serialToISO(Number(s));
  return null;
}

/** Number from `12,500`, `OMR 1,200.500`, `18500 h`; null when blank; NaN when junk. */
export function parseNum(v: Cell): number | null {
  if (typeof v === 'number') return v;
  const s = text(v);
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').replace(/^[a-z]{3}\s*/i, '').replace(/\s*h(rs?|ours?)?$/i, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

export interface UnitWrite { ref: string; id?: string; unit: Omit<MohUnit, 'id'> }
export interface ProjectWrite { unitRef: string; project: MohProject }
export interface RowError { row: number; message: string }

export interface ImportPlan {
  units: UnitWrite[]; projects: ProjectWrite[]; rigMeta: RigMeta[];
  errors: RowError[]; rows: number; newUnits: number; updatedUnits: number;
}

export interface ImportContext {
  rigs: Rig[]; items: MohItem[]; units: MohUnit[]; projects: MohProject[]; rigMeta: ReadonlyMap<string, RigMeta>;
}

const NUM_FIELDS = ['lastYear', 'lastHours', 'curHours', 'avgHours', 'year', 'cost'] as const;
const NUM_LABEL: Record<typeof NUM_FIELDS[number], string> = {
  lastYear: 'Last MOH year', lastHours: 'Last MOH hours', curHours: 'Current hours',
  avgHours: 'Average hours/year', year: 'Planned MOH year', cost: 'Estimated cost',
};
const PROJECT_FIELDS = ['status', 'cost', 'vendor', 'po', 'pr', 'responsible', 'comments'] as const;

export function planImport(aoa: Cell[][], ctx: ImportContext): ImportPlan {
  const h = detectHeader(aoa);
  const plan: ImportPlan = { units: [], projects: [], rigMeta: [], errors: [], rows: 0, newUnits: 0, updatedUnits: 0 };
  const rigs = new Map(ctx.rigs.map((r) => [key(r.name), r]));
  const items = new Map(ctx.items.map((i) => [key(i.description), i]));
  const writes = new Map<string, UnitWrite>();
  const meta = new Map<string, RigMeta>();

  for (let i = h.row + 1; i < aoa.length; i += 1) {
    const raw = aoa[i] ?? [];
    const get = (f: Field): Cell => (h.cols[f] === undefined ? undefined : raw[h.cols[f] as number]);
    if (raw.every((c) => text(c) === '')) continue;
    const rowNo = i + 1;
    const err = (message: string) => plan.errors.push({ row: rowNo, message });
    plan.rows += 1;
    if (!text(get('equipment'))) { err('Equipment is blank.'); continue; }

    const rig = rigs.get(key(get('rig')));
    if (!rig) { err(`Rig "${text(get('rig'))}" is not a rig in your scope.`); continue; }
    const item = items.get(key(get('equipment')));
    if (!item) { err(`Equipment "${text(get('equipment'))}" is not in the equipment master.`); continue; }

    // ---- validate every value before anything is queued ----
    const nums = {} as Record<typeof NUM_FIELDS[number], number | null>;
    let bad = false;
    for (const f of NUM_FIELDS) {
      const n = parseNum(get(f));
      if (Number.isNaN(n) || (n !== null && n < 0)) { err(`${NUM_LABEL[f]} "${text(get(f))}" is not a valid number.`); bad = true; }
      nums[f] = n === null || Number.isNaN(n) ? null : n;
    }
    for (const f of ['lastYear', 'year'] as const) {
      const y = nums[f];
      if (y !== null && !(Number.isInteger(y) && y >= 1900 && y <= 2200)) { err(`${NUM_LABEL[f]} must be a year 1900–2200.`); bad = true; }
    }
    const lastDate = parseDate(get('lastDate'));
    if (text(get('lastDate')) && !lastDate) {
      err(`Last MOH date "${text(get('lastDate'))}" is not a date (use YYYY-MM-DD or DD/MM/YYYY).`); bad = true;
    }
    const statusText = text(get('status'));
    const status = PROJECT_STATUSES.find((s) => key(s) === key(statusText));
    if (statusText && !status) { err(`Project status "${statusText}" is not one of: ${PROJECT_STATUSES.join(', ')}.`); bad = true; }
    const curText = text(get('currency')).toUpperCase();
    if (curText && !(CURRENCIES as readonly string[]).includes(curText)) {
      err(`Currency "${curText}" must be one of ${CURRENCIES.join(', ')}.`); bad = true;
    }
    if (nums.year === null && PROJECT_FIELDS.some((f) => text(get(f)))) { err('Project details need a Planned MOH Year.'); bad = true; }
    if (bad) continue;

    // ---- the unit: reuse one queued from this file, else an existing DB unit ----
    const asset = text(get('asset')), eqno = text(get('eqno'));
    const rigItem = `${rig.id}|${item.id}`;
    const fileKey = `${rigItem}|${key(asset)}|${key(eqno)}`;
    let w = writes.get(fileKey);
    if (!w) {
      const existing = ctx.units.filter((u) => u.rigId === rig.id && u.itemId === item.id);
      const match = existing.find((u) => (asset !== '' && key(u.assetNumber) === key(asset))
          || (eqno !== '' && key(u.equipmentNumber) === key(eqno)))
        // an untagged row updates the rig's only unit; an untagged lone unit adopts the row's tags
        ?? (existing.length === 1 && (!asset && !eqno || (!existing[0].assetNumber && !existing[0].equipmentNumber))
          ? existing[0] : undefined);
      const base: Omit<MohUnit, 'id'> = match ? { ...match, id: undefined } as Omit<MohUnit, 'id'> : {
        rigId: rig.id, itemId: item.id, assetNumber: '', equipmentNumber: '', lastMohDate: null,
        lastMohYear: null, lastMohHours: null, currentHours: null, avgHoursPerYear: null, remarks: '',
      };
      w = { ref: match?.id ?? `new:${fileKey}`, id: match?.id, unit: { ...base } };
      writes.set(fileKey, w);
      if (match) writes.set(`${rigItem}|${key(match.assetNumber)}|${key(match.equipmentNumber)}`, w);
      plan.units.push(w);
      if (match) plan.updatedUnits += 1; else plan.newUnits += 1;
    }
    const u = w.unit;
    if (asset) u.assetNumber = asset;
    if (eqno) u.equipmentNumber = eqno;
    if (lastDate) { u.lastMohDate = lastDate; u.lastMohYear = null; }
    else if (nums.lastYear !== null) { u.lastMohYear = nums.lastYear; u.lastMohDate = null; }
    if (nums.lastHours !== null) u.lastMohHours = nums.lastHours;
    if (nums.curHours !== null) u.currentHours = nums.curHours;
    if (nums.avgHours !== null) u.avgHoursPerYear = nums.avgHours;
    if (text(get('remarks'))) u.remarks = text(get('remarks'));
    if (u.currentHours !== null && u.lastMohHours !== null && u.currentHours < u.lastMohHours) {
      err('Warning: current hours are lower than last MOH hours.');
    }

    // ---- the planned-year project, merged over existing details ----
    if (nums.year !== null) {
      const year = nums.year, ref = w.ref, unitId = w.id ?? null;
      const queued = plan.projects.find((p) => p.unitRef === ref && p.project.year === year);
      const existing = unitId ? ctx.projects.find((p) => p.mohUnitId === unitId && p.year === year) : undefined;
      const p: MohProject = queued?.project ?? { ...(existing ?? {
        rigId: rig.id, itemId: item.id, mohUnitId: unitId, year, plannedMonth: null, startDate: null,
        durationDays: null, vendor: '', poNumber: '', prNumber: '', responsible: '',
        status: 'Not Started' as ProjectStatus, comments: '', estimatedCost: null,
      }) };
      if (status) p.status = status;
      if (nums.cost !== null) p.estimatedCost = nums.cost;
      if (text(get('vendor'))) p.vendor = text(get('vendor'));
      if (text(get('po'))) p.poNumber = text(get('po'));
      if (text(get('pr'))) p.prNumber = text(get('pr'));
      if (text(get('responsible'))) p.responsible = text(get('responsible'));
      if (text(get('comments'))) p.comments = text(get('comments'));
      if (!queued) plan.projects.push({ unitRef: ref, project: p });
    }

    // ---- rig details ----
    const loc = text(get('location')), by = text(get('preparedBy'));
    if (loc || by || curText) {
      const m = meta.get(rig.id) ?? { ...(ctx.rigMeta.get(rig.id) ?? blankRigMeta(rig.id)) };
      if (loc) m.location = loc;
      if (by) m.preparedBy = by;
      if (curText) m.currency = curText as Currency;
      meta.set(rig.id, m);
    }
  }
  plan.rigMeta = [...meta.values()];
  return plan;
}

/** True when an error blocks its row (warnings are informational only). */
export const isBlocking = (e: RowError) => !e.message.startsWith('Warning:');

/** Reads the first worksheet as raw cells (numbers stay numbers so dates are exact). */
export async function readSheet(file: File): Promise<Cell[][]> {
  if (file.size > 15 * 1024 * 1024) throw new Error('Spreadsheet too large (max 15 MB).');
  const buf = await file.arrayBuffer();
  let aoa: Cell[][];
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    aoa = ws ? XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' }) : [];
  } catch {
    throw new Error('Could not read this file — use .xlsx, .xls or .csv.');
  }
  if (aoa.length > 5000) throw new Error('Spreadsheet has too many rows (max 5,000).');
  return aoa;
}

/** Downloads a blank template with two example rows (example rig/equipment names). */
export async function downloadTemplate(exampleRig: string): Promise<void> {
  const XLSX = await import('xlsx');
  const rows: Cell[][] = [
    [...TEMPLATE_HEADERS],
    [exampleRig, 'Top Drive', 'ASSET-001', 'EQ-001', '2024-01-15', '', '', '', '', 'Calendar-based example',
      2029, 'Planning', 12500, 'Workshop name', '', '', '', '', 'Field', 'OMR', ''],
    [exampleRig, 'All Main Engine-Gen in Rig & Camp – Major Overhaul', 'ASSET-ENG-01', 'EQ-ENG-01', '', '',
      12000, 18500, 4500, 'Hour-based example', '', '', '', '', '', '', '', '', '', '', ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'MOH Import');
  XLSX.writeFile(wb, 'Abraj_MOH_Import_Template.xlsx');
}
