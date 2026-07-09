import { describe, expect, it } from 'vitest';
import { answer, type AssistantContext } from './assistant';
import type { CatalogItem, TubularRecordRow } from './records';

const catalog: CatalogItem[] = [
  { id: 'c1', category: 'drill_pipe', description: '5" DP, G-105, 19.5 ppf, NC50', position: 10, active: true },
];

const rec = (over: Partial<TubularRecordRow>): TubularRecordRow => ({
  id: 'r1', unitId: 'u1', catalogItemId: 'c1', position: 1,
  onContract: 100, premium: 60, class2: 10, class3: 5, scrap: 3,
  needsInspection: 2, damagedOnLocation: 0, sendToRepair: 0, toOtherRig: 0,
  receiveFromRig: 0, onBoardOverride: null, onBoard: 78, contractDelta: -30,
  rentalDate: null, remarks: null, archived: false,
  updatedAt: '2026-07-01T00:00:00Z', updatedBy: null,
  ...over,
});

const ctx: AssistantContext = {
  records: [rec({}), rec({ id: 'r2', unitId: 'u2', onContract: 0, premium: 40, contractDelta: 50, scrap: 0, needsInspection: 0 })],
  catalog,
  unitNames: new Map([['u1', 'Rig 105'], ['u2', 'Rig 306']]),
};

describe('deterministic assistant — numbers computed, never invented', () => {
  it('shortfall intent uses serviceable = P+C2 and lists backing rows', () => {
    const a = answer('what is short of contract?', ctx);
    expect(a.text).toContain('1 line(s) are short');
    expect(a.text).toContain('-30'); // (60+10)-100
    expect(a.rows?.[0].unit).toBe('Rig 105');
  });

  it('unit detail answers from that unit only', () => {
    const a = answer('show me Rig 105', ctx);
    expect(a.text).toContain('Rig 105');
    expect(a.text).toContain('serviceable (P+C2) 70');
  });

  it('compare intent', () => {
    const a = answer('compare Rig 105 and Rig 306', ctx);
    expect(a.text).toContain('Rig 105: contract 100, serviceable 70');
    expect(a.text).toContain('Rig 306: contract 0, serviceable 50'); // 40 premium + 10 class2
  });

  it('scrap and inspection totals', () => {
    expect(answer('how much scrap?', ctx).text).toContain('3 scrap joints');
    expect(answer('what needs inspection?', ctx).text).toContain('2 joints flagged');
  });

  it('fleet summary computes utilization from serviceable/contract', () => {
    const a = answer('fleet summary', ctx);
    expect(a.text).toContain('on contract 100');
    expect(a.text).toContain('serviceable 120'); // 70 + 50
    expect(a.text).toContain('utilization 120.0%');
  });

  it('empty context is honest, and unknown questions list capabilities', () => {
    expect(answer('fleet summary', { records: [], catalog, unitNames: new Map() }).text)
      .toContain('No tubular data');
    expect(answer('write me a poem', ctx).text).toContain('Try:');
  });
});
