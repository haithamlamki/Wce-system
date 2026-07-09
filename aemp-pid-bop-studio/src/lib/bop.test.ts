import { describe, expect, it } from 'vitest';
import { buildBopStack, seedBopSeq, stackMetrics, toFeet, toMetres } from './bop';

describe('buildBopStack', () => {
  it('builds a surface-section stack without a shear ram', () => {
    const tags = buildBopStack('26').filter((b) => !b.side).map((b) => b.tag);
    expect(tags).toEqual(['WH', 'B4', 'B2', 'B1']);
  });
  it('adds a shear ram for production/reservoir sections', () => {
    const tags = buildBopStack('12.25').filter((b) => !b.side).map((b) => b.tag);
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
  it('adds choke + kill side-valve branches', () => {
    const items = buildBopStack('26');
    const choke = items.filter((b) => b.side === 'choke');
    const kill = items.filter((b) => b.side === 'kill');
    expect(choke.map((b) => b.type)).toEqual(['gate', 'hcr', 'choke']);
    expect(kill.map((b) => b.type)).toEqual(['gate', 'hcr', 'check']);
    expect(kill.some((b) => /NRV/i.test(b.description))).toBe(true);
  });
  it('excludes side branches from the vertical stack height', () => {
    const items = buildBopStack('26');
    const mainHeight = items.filter((b) => !b.side).reduce((s, b) => s + b.height, 0);
    expect(stackMetrics({ datum: 0, rt: 99, unit: 'm', items }).total).toBe(mainHeight);
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

describe('seedBopSeq (F8)', () => {
  it('reseeds the b<n> counter past ids already present in a loaded scheme', () => {
    seedBopSeq([{ id: 'b500', type: 'gate', tag: '', description: '', height: 0.4 }]);
    const items = buildBopStack('26');
    const ids = items.map((i) => i.id);
    expect(ids.every((id) => id !== 'b500')).toBe(true);
    const nums = ids.map((id) => parseInt(id.slice(1), 10));
    expect(Math.min(...nums)).toBeGreaterThan(500);
  });
});
