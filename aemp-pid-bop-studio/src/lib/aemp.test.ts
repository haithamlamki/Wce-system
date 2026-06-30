import { describe, expect, it } from 'vitest';
import { importFromAEMP, mapAempRecords, type AempFieldMap } from './aemp';

describe('mapAempRecords', () => {
  it('maps foreign field names to AempAsset via the field map', () => {
    const map: AempFieldMap = { tag: 'equipmentTag', serial: 'serialNo', rwp: 'ratedWP', section: 'system' };
    const [a] = mapAempRecords([{ equipmentTag: 'V1', serialNo: 'SN-1', ratedWP: '10000', system: 'Choke Manifold' }], map);
    expect(a.tag).toBe('V1');
    expect(a.serial).toBe('SN-1');
    expect(a.rwp).toBe('10000');
    expect(a.section).toBe('Choke Manifold');
  });
  it('falls back to identical names and empty strings for missing fields', () => {
    const [a] = mapAempRecords([{ tag: 'X', size: '2"' }]);
    expect(a.tag).toBe('X');
    expect(a.size).toBe('2"');
    expect(a.serial).toBe('');
  });
  it('coerces non-string values to strings', () => {
    const [a] = mapAempRecords([{ tag: 123, rwp: 10000 }]);
    expect(a.tag).toBe('123');
    expect(a.rwp).toBe('10000');
  });
});

describe('importFromAEMP (mock source)', () => {
  it('returns mapped assets from the mock payload, marked live', async () => {
    const r = await importFromAEMP({ mock: true });
    expect(r.source).toBe('mock');
    expect(r.live).toBe(true);
    expect(r.assets.length).toBeGreaterThan(0);
    const ann = r.assets.find((a) => a.tag === 'ANN')!;
    expect(ann.serial).toBe('SN-ANN-01');
    expect(ann.rwp).toBe('10000');
    expect(ann.type).toBe('annular');
    expect(ann.section).toBe('BOP/Kill/Choke');
  });
});
