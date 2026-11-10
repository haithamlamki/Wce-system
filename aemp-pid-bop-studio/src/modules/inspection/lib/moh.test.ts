import { describe, expect, it } from 'vitest';
import {
  addYears, buildPlanRows, calcHours, calcYears, clampHorizon, parseISO, planYears, summarize,
  type MohItem, type MohUnit,
} from './moh';

const today = new Date(Date.UTC(2026, 10, 9)); // 9 Nov 2026
const years = planYears(2026, 10);

const item = (over: Partial<MohItem> = {}): MohItem => ({
  id: 'i1', sno: 1, description: 'Top Drive', category: 'Drilling Equipment',
  basis: 'years', interval: 5, active: true, typeIds: [], ...over,
});
const unit = (over: Partial<MohUnit> = {}): MohUnit => ({
  id: 'u1', rigId: 'r1', itemId: 'i1', assetNumber: '', equipmentNumber: '',
  lastMohDate: null, lastMohYear: null, lastMohHours: null, currentHours: null, avgHoursPerYear: null,
  remarks: '', ...over,
});

describe('horizon', () => {
  it('defaults to 10 and clamps to 1..20', () => {
    expect(planYears(2026, 10)).toHaveLength(10);
    expect(clampHorizon('x')).toBe(10);
    expect(clampHorizon(0)).toBe(10);
    expect(clampHorizon(50)).toBe(20);
    expect(clampHorizon(3)).toBe(3);
  });
});

describe('dates', () => {
  it('rejects impossible dates and clamps leap days', () => {
    expect(parseISO('2026-02-30')).toBeNull();
    expect(addYears(parseISO('2024-02-29')!, 1).toISOString().slice(0, 10)).toBe('2025-02-28');
  });
});

describe('calcYears', () => {
  it('flags an exact date past due as overdue with lateness', () => {
    const c = calcYears({ date: '2020-03-01', year: null }, 5, today, years);
    expect(c.status).toBe('OVERDUE');
    expect(c.detail).toBe('Overdue: 1 Year 8 Months');
    expect(c.years).toEqual([2030, 2035]);
  });

  it('buckets due this year / next year / planned / outside plan', () => {
    expect(calcYears({ date: '2021-12-15', year: null }, 5, today, years).status).toBe('DUE THIS YEAR');
    expect(calcYears({ date: '2022-06-01', year: null }, 5, today, years).status).toBe('DUE NEXT YEAR');
    expect(calcYears({ date: '2025-01-01', year: null }, 5, today, years).status).toBe('PLANNED');
    expect(calcYears({ date: '2026-01-01', year: null }, 5, today, planYears(2026, 3)).status).toBe('NOT DUE IN PLAN');
  });

  it('falls back to year-only data', () => {
    const c = calcYears({ date: null, year: 2019 }, 5, today, years);
    expect(c.status).toBe('OVERDUE');
    expect(c.detail).toBe('Overdue: 2 Years');
    expect(c.years).toEqual([2029, 2034]);
  });

  it('reports missing data and missing interval', () => {
    expect(calcYears({ date: null, year: null }, 5, today, years).status).toBe('NO LAST MOH DATA');
    expect(calcYears({ date: '2024-01-01', year: null }, null, today, years).detail).toMatch(/interval/);
  });
});

describe('calcHours', () => {
  it('is overdue once the meter passes the due hours', () => {
    const c = calcHours({ lastHours: 10000, currentHours: 35000, avgPerYear: 5000 }, 24000, today, years);
    expect(c.status).toBe('OVERDUE');
    expect(c.nextDue).toBe('34,000 h');
  });

  it('estimates plan years from average hours per year', () => {
    const c = calcHours({ lastHours: 0, currentHours: 14000, avgPerYear: 5000 }, 24000, today, years);
    expect(c.status).toBe('PLANNED'); // 10,000 h left at 5,000 h/yr → ~2028
    expect(c.years[0]).toBe(2028);
  });

  it('needs current hours before it can plan', () => {
    expect(calcHours({ lastHours: 0, currentHours: null, avgPerYear: null }, 24000, today, years).status)
      .toBe('NO LAST MOH DATA');
  });
});

describe('buildPlanRows + summarize', () => {
  const rigs = [{ id: 'r1', name: 'Rig 101' }, { id: 'r2', name: 'Rig 102' }];
  const items = [item(), item({ id: 'i2', sno: 2, description: 'Forklift', category: 'Handling Equipment' })];

  it('prefers manual units, then inspection dates, then a blank row', () => {
    const rows = buildPlanRows({
      rigs, items, today, years, notApplicable: new Set(),
      units: [unit({ lastMohDate: '2024-05-01' })],
      inspection: [
        { rigId: 'r1', itemId: 'i1', lastMajor: '2015-01-01', nextMajorDue: null, components: 3, overdueComponents: 1 },
        { rigId: 'r2', itemId: 'i1', lastMajor: '2020-01-01', nextMajorDue: null, components: 2, overdueComponents: 0 },
      ],
    });
    const get = (rig: string, it: string) => rows.find((r) => r.rigId === rig && r.item.id === it)!;
    expect(get('r1', 'i1').source).toBe('manual');
    expect(get('r1', 'i1').calc.status).toBe('PLANNED');
    expect(get('r2', 'i1').source).toBe('inspection');
    expect(get('r2', 'i1').calc.status).toBe('OVERDUE');
    expect(get('r2', 'i2').source).toBe('none');
    expect(rows).toHaveLength(4);
  });

  it('excludes not-applicable items from KPIs and the workload', () => {
    const rows = buildPlanRows({
      rigs: [rigs[0]], items, today, years, units: [], inspection: [],
      notApplicable: new Set(['r1|i2']),
    });
    const s = summarize(rows, years);
    expect(s.units).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.byStatus['NOT APPLICABLE']).toBe(1);
  });

  it('counts MOH occurrences per plan year', () => {
    const rows = buildPlanRows({
      rigs: [rigs[0]], items: [items[0]], today, years, inspection: [], notApplicable: new Set(),
      units: [unit({ id: 'a', lastMohYear: 2023 }), unit({ id: 'b', lastMohYear: 2024 })],
    });
    const s = summarize(rows, years);
    expect(s.annual[2028]).toBe(1);
    expect(s.annual[2029]).toBe(1);
    expect(s.projects).toBe(4); // 2028, 2033, 2029, 2034
    expect(s.highest).toBe(2028);
  });
});
