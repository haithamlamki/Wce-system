import { describe, expect, it } from 'vitest';
import { buildBopStack, stackMetrics, toFeet, toMetres } from './bop';

describe('buildBopStack', () => {
  it('builds a surface-section stack without a shear ram', () => {
    const tags = buildBopStack('26').map((b) => b.tag);
    expect(tags).toEqual(['WH', 'B4', 'B2', 'B1']);
  });
  it('adds a shear ram for production/reservoir sections', () => {
    const tags = buildBopStack('12.25').map((b) => b.tag);
    expect(tags).toContain('B3');
    expect(tags).toEqual(['WH', 'B4', 'B3', 'B2', 'B1']);
  });
  it('uses the symbol bopHeight for component heights', () => {
    const items = buildBopStack('26');
    const annular = items.find((b) => b.type === 'annular')!;
    const dram = items.find((b) => b.type === 'dram')!;
    expect(annular.height).toBe(1.5);
    expect(dram.height).toBe(1.8);
  });
  it('grafts serial/dates from the register by tag', () => {
    const reg = [{ type: 'annular', section: '', description: '', tag: 'B1', rwp: '', size: '', manufacturer: '', serial: 'SN-1', int_last: '', int_due: '2027-01-01', maj_last: '', maj_due: '' }];
    const annular = buildBopStack('26', reg).find((b) => b.tag === 'B1')!;
    expect(annular.serial).toBe('SN-1');
    expect(annular.int_due).toBe('2027-01-01');
  });
});

describe('stackMetrics', () => {
  it('computes total, top-of-stack and clearance', () => {
    const m = stackMetrics({ datum: 0, rt: 10, unit: 'm', items: [{ id: 'a', type: 'cross', tag: '', description: '', height: 2 }, { id: 'b', type: 'dram', tag: '', description: '', height: 3 }] });
    expect(m.total).toBe(5);
    expect(m.topOfStack).toBe(5);
    expect(m.clearanceToRT).toBe(5);
  });
});

describe('unit conversion', () => {
  it('round-trips metres and feet', () => {
    expect(toFeet(0.3048)).toBeCloseTo(1, 6);
    expect(toMetres(1)).toBeCloseTo(0.3048, 6);
  });
});
