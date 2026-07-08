import { describe, expect, it } from 'vitest';
import { importFromAEMP, mapAempRecords, seedProjectFromTemplate, type AempFieldMap } from './aemp';
import type { Project } from '../types';

function proj(over: Partial<Project> = {}): Project {
  return {
    meta: { rig: 'Rig 305', date: '2026-01-01', who: 'Old Inspector' },
    nodes: [], edges: [], pipes: [],
    bop: { datum: 0, rt: 8.5, unit: 'm', items: [] },
    rewards: { spent: 0, redeemed: [] },
    revision: 0,
    ...over,
  };
}

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

describe('seedProjectFromTemplate', () => {
  it('re-stamps a template as a fresh draft for the target unit', () => {
    const template = proj({
      meta: { rig: 'Rig 999', date: '2020-05-05', who: 'Template Author' },
      nodes: [{ id: 'n1' } as never],
      pipes: [{ id: 'p1' } as never],
      status: 'published',
      publishedAt: '2020-06-01T00:00:00Z',
      revision: 12,
    });
    const base = proj({ meta: { rig: 'whatever', date: '2026-07-08', who: 'Current User' }, revision: 4 });

    const seed = seedProjectFromTemplate(template, 'Rig 42', base);

    expect(seed.meta.rig).toBe('Rig 42');            // target unit
    expect(seed.meta.date).toBe('2026-07-08');       // current date, not the template's
    expect(seed.meta.who).toBe('Current User');      // current inspector
    expect(seed.status).toBe('draft');               // never inherits published
    expect(seed.publishedAt).toBeUndefined();
    expect(seed.revision).toBe(5);                   // base.revision + 1
    expect(seed.nodes).toHaveLength(1);              // canvas carried over
    expect(seed.pipes).toHaveLength(1);
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
