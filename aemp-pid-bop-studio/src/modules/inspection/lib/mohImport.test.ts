import { describe, expect, it } from 'vitest';
import {
  buildPlanRows, costSummary, currencyText, money, planYears, projectKey,
  type MohItem, type MohProject, type MohUnit, type RigMeta,
} from './moh';
import { detectHeader, isBlocking, parseDate, parseNum, planImport, TEMPLATE_HEADERS, type Cell } from './mohImport';
import { annualSheet, matrixSheet, planSheet, projectsSheet, withTitle } from './mohExport';

const today = new Date(Date.UTC(2026, 10, 10));
const years = planYears(2026, 10);
const rigs = [{ id: 'r1', name: 'Rig 106' }, { id: 'r2', name: 'Rig 201' }];
const items: MohItem[] = [
  { id: 'i1', sno: 3, description: 'Top Drive', category: 'Drilling Equipment', basis: 'years', interval: 5, active: true, typeIds: [] },
  { id: 'i2', sno: 2, description: 'All Main Engine-Gen in Rig & Camp – Major Overhaul', category: 'Engines / Power Generation',
    basis: 'hours', interval: 20000, active: true, typeIds: [] },
];
const unit = (over: Partial<MohUnit> = {}): MohUnit => ({
  id: 'u1', rigId: 'r1', itemId: 'i1', assetNumber: 'A-1', equipmentNumber: '', lastMohDate: '2022-03-01',
  lastMohYear: null, lastMohHours: null, currentHours: null, avgHoursPerYear: null, remarks: '', ...over,
});
const ctx = (over: Partial<Parameters<typeof planImport>[1]> = {}) => ({
  rigs, items, units: [] as MohUnit[], projects: [] as MohProject[], rigMeta: new Map<string, RigMeta>(), ...over,
});
type Col = typeof TEMPLATE_HEADERS[number];
const sheet = (...rows: Cell[][]): Cell[][] => [[...TEMPLATE_HEADERS], ...rows];
const row = (v: Partial<Record<Col, Cell>>): Cell[] => TEMPLATE_HEADERS.map((h) => v[h] ?? '');

describe('parsers', () => {
  it('reads ISO, day-first, month-name dates and Excel serials', () => {
    expect(parseDate('2024-01-15')).toBe('2024-01-15');
    expect(parseDate('15/01/2024')).toBe('2024-01-15');
    expect(parseDate('15 Jan 2024')).toBe('2024-01-15');
    expect(parseDate(45306)).toBe('2024-01-15');
    expect(parseDate('31/02/2024')).toBeNull();
    expect(parseDate('soon')).toBeNull();
  });
  it('reads formatted numbers and rejects junk', () => {
    expect(parseNum('12,500')).toBe(12500);
    expect(parseNum('OMR 1,200.500')).toBe(1200.5);
    expect(parseNum('18500 h')).toBe(18500);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNaN();
  });
  it('finds a header below a title row and requires Rig + Equipment', () => {
    expect(detectHeader([['ABRAJ MOH IMPORT'], [], ['Rig Name', 'Equipment Description', 'Asset No.']]).row).toBe(2);
    expect(() => detectHeader([['Equipment', 'Asset']])).toThrow(/Rig/);
  });
});

describe('planImport', () => {
  it('creates a unit and its project year, and records rig details', () => {
    const p = planImport(sheet(row({
      Rig: 'RIG-106', Equipment: 'top drive', 'Asset Number': 'TD-9', 'Last MOH Date': '2023-05-01',
      'Planned MOH Year': 2028, 'Project Status': 'po issued', 'Estimated Cost': '12,500', Location: 'Fahud', Currency: 'usd',
    })), ctx());
    expect(p.errors).toEqual([]);
    expect(p.newUnits).toBe(1);
    expect(p.units[0].unit).toMatchObject({ rigId: 'r1', itemId: 'i1', assetNumber: 'TD-9', lastMohDate: '2023-05-01' });
    expect(p.projects[0]).toMatchObject({ unitRef: p.units[0].ref, project: { year: 2028, status: 'PO Issued', estimatedCost: 12500 } });
    expect(p.rigMeta[0]).toMatchObject({ rigId: 'r1', location: 'Fahud', currency: 'USD' });
  });

  it('updates the matching existing unit, keeping cells left blank', () => {
    const p = planImport(sheet(row({ Rig: 'Rig 106', Equipment: 'Top Drive', 'Asset Number': 'a-1', Remarks: 'checked' })),
      ctx({ units: [unit()] }));
    expect(p.updatedUnits).toBe(1);
    expect(p.units[0]).toMatchObject({ id: 'u1', unit: { lastMohDate: '2022-03-01', remarks: 'checked' } });
  });

  it('merges several project years for one unit over existing project details', () => {
    const existing: MohProject = { id: 'p1', rigId: 'r1', itemId: 'i1', mohUnitId: 'u1', year: 2027, plannedMonth: 3,
      startDate: null, durationDays: null, vendor: 'Old', poNumber: '', prNumber: 'PR-1', responsible: '',
      status: 'Planning', comments: '', estimatedCost: null };
    const p = planImport(sheet(
      row({ Rig: 'Rig 106', Equipment: 'Top Drive', 'Asset Number': 'A-1', 'Planned MOH Year': 2027, 'PO Number': 'PO-7' }),
      row({ Rig: 'Rig 106', Equipment: 'Top Drive', 'Asset Number': 'A-1', 'Planned MOH Year': 2032, 'Estimated Cost': 900 }),
    ), ctx({ units: [unit()], projects: [existing] }));
    expect(p.units).toHaveLength(1);
    expect(p.projects.map((x) => x.project)).toEqual([
      expect.objectContaining({ id: 'p1', vendor: 'Old', prNumber: 'PR-1', poNumber: 'PO-7', plannedMonth: 3 }),
      expect.objectContaining({ year: 2032, estimatedCost: 900, mohUnitId: 'u1' }),
    ]);
  });

  it('reports unknown rigs / equipment and bad values per row, without queuing them', () => {
    const p = planImport(sheet(
      row({ Rig: 'Rig 999', Equipment: 'Top Drive' }),
      row({ Rig: 'Rig 106', Equipment: 'Flux Capacitor' }),
      row({ Rig: 'Rig 106', Equipment: 'Top Drive', 'Last MOH Date': '2024-13-40' }),
      row({ Rig: 'Rig 106', Equipment: 'Top Drive', 'Project Status': 'Done-ish', 'Planned MOH Year': 2028 }),
      row({ Rig: 'Rig 106', Equipment: 'Top Drive', 'Vendor / Workshop': 'ACME' }),
      row({ Rig: 'Rig 106', Equipment: 'Top Drive', 'Estimated Cost': -5, 'Planned MOH Year': 2028 }),
    ), ctx());
    expect(p.errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(p.errors.every(isBlocking)).toBe(true);
    expect(p.units).toHaveLength(0);
  });

  it('warns (does not block) when current hours are below last MOH hours', () => {
    const p = planImport(sheet(row({ Rig: 'Rig 201', Equipment: items[1].description, 'Last MOH Hours': 9000, 'Current Hours': 100 })), ctx());
    expect(p.units).toHaveLength(1);
    expect(p.errors).toHaveLength(1);
    expect(isBlocking(p.errors[0])).toBe(false);
  });
});

describe('cost + export sheets', () => {
  const u = unit({ lastMohDate: '2024-01-15' }); // 5-yr interval → 2029, 2034
  const rows = buildPlanRows({ rigs, items: [items[0]], units: [u], inspection: [], notApplicable: new Set(), today, years });
  const proj: MohProject = { rigId: 'r1', itemId: 'i1', mohUnitId: 'u1', year: 2029, plannedMonth: null, startDate: null,
    durationDays: null, vendor: 'ACME', poNumber: '', prNumber: '', responsible: '', status: 'PO Issued', comments: '', estimatedCost: 1500.5 };
  const projects = new Map([[projectKey('r1', 'i1', 'u1', 2029), proj]]);
  const cost = costSummary(rows, years, projects, () => 'OMR');

  it('totals budget per currency, year and rig', () => {
    expect(cost.total).toEqual({ OMR: 1500.5 });
    expect(cost.byYear[2029]).toEqual({ OMR: 1500.5 });
    expect(cost.byRig.r1).toEqual({ OMR: 1500.5 });
    expect(currencyText(cost.total)).toBe('OMR 1,500.500');
    expect(currencyText({ OMR: 1, USD: 2 })).toBe('OMR 1.000 + USD 2.00');
    expect(currencyText({})).toBe('—');
    expect(money(0, 'USD')).toBe('USD 0.00');
  });

  it('builds plan, projects, annual and matrix sheets', () => {
    const plan = planSheet(rows, years, projects, true);
    expect(plan[0][0]).toBe('Rig');
    const r106 = plan.find((r) => r[0] === 'Rig 106' && r[2] === 'Top Drive')!;
    expect(r106[plan[0].indexOf('2029')]).toBe('PO Issued');
    expect(r106[plan[0].indexOf('2034')]).toBe('MOH');
    const ps = projectsSheet(rows, years, projects, () => 'OMR');
    expect(ps.slice(1).map((r) => [r[0], r[1], r[13]])).toEqual([['Rig 106', 2029, 1500.5], ['Rig 106', 2034, '']]);
    const annual = annualSheet(rows, years, cost);
    expect(annual[annual.length - 1]).toEqual(['Total', 2, 'OMR 1,500.500']);
    const m = matrixSheet(rigs, rows, years, cost);
    expect(m.map((r) => r[0])).toEqual(['Rig', 'Rig 106', 'Rig 201', 'All rigs']);
    expect(withTitle('T', ['a'], [['x', 1]])).toEqual([['T'], ['a'], [], ['x', 1]]);
  });
});
