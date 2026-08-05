import { describe, expect, it } from 'vitest';
import { CLIENT_BY_UNIT, clientOf, clientsIn, unitIdsForClient } from './clients';

describe('client mapping', () => {
  it('maps known units to their client', () => {
    expect(clientOf('Rig 103')).toBe('PDO');
    expect(clientOf('Rig 105')).toBe('Medco');
    expect(clientOf('Rig 110')).toBe('OQ');
    expect(clientOf('Rig 112')).toBe('K.S.C');
    expect(clientOf('Rig 204')).toBe('ARA');
    expect(clientOf('Rig 206')).toBe('OXY');
    expect(clientOf('Rig 305')).toBe('BP');
    expect(clientOf('Rig 401')).toBe('K.S.C');
    expect(clientOf('Hoist 5')).toBe('PDO');
  });

  it('returns null for unmapped units', () => {
    expect(clientOf('Rig 999')).toBeNull();
    expect(clientOf('')).toBeNull();
  });

  it('covers exactly the 33 agreed units and 7 clients', () => {
    expect(Object.keys(CLIENT_BY_UNIT)).toHaveLength(33);
    expect(new Set(Object.values(CLIENT_BY_UNIT)).size).toBe(7);
  });

  it('clientsIn returns sorted unique clients present among the given units', () => {
    const units = [{ name: 'Rig 110' }, { name: 'Rig 103' }, { name: 'Rig 104' }, { name: 'Rig 999' }];
    expect(clientsIn(units)).toEqual(['OQ', 'PDO']);
    expect(clientsIn([])).toEqual([]);
  });

  it("unitIdsForClient picks only that client's units", () => {
    const units = [
      { id: 'a', name: 'Rig 103' }, { id: 'b', name: 'Rig 110' },
      { id: 'c', name: 'Hoist 1' }, { id: 'd', name: 'Rig 999' },
    ];
    expect(unitIdsForClient(units, 'PDO')).toEqual(new Set(['a', 'c']));
    expect(unitIdsForClient(units, 'OQ')).toEqual(new Set(['b']));
    expect(unitIdsForClient(units, 'BP')).toEqual(new Set());
  });
});
