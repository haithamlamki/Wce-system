import { describe, expect, it } from 'vitest';
import { specLabel, specUsage, specsToCsv, type Specification } from './specifications';
import type { EquipmentType } from '../types';

const spec = (measurement: string, units: string, abbreviation: string): Specification =>
  ({ id: measurement + units, measurement, units, abbreviation, active: true });

describe('specLabel', () => {
  it('matches the export header form "Measurement(abbreviation)"', () => {
    expect(specLabel(spec('Working Pressure', 'Pounds per square inch', 'Psi'))).toBe('Working Pressure(Psi)');
    expect(specLabel(spec('Grade', 'Text', ''))).toBe('Grade()');
  });
});

describe('specUsage', () => {
  it('counts equipment types using each specification, case-insensitively', () => {
    const types = [
      { id: 'a', specFields: ['Size(in)', 'Working Pressure(Psi)'] },
      { id: 'b', specFields: ['size(IN)'] },
      { id: 'c', specFields: [] },
    ] as unknown as EquipmentType[];
    const rows = specUsage([spec('Size', 'inches', 'in'), spec('Torque', 'Newton-Meters', 'N-m')], types);
    expect(rows.map((r) => [r.measurement, r.equipment])).toEqual([['Size', 2], ['Torque', 0]]);
  });
});

describe('specsToCsv', () => {
  it('writes the Specifications page columns', () => {
    const csv = specsToCsv([{ ...spec('Max. Combined load', 'dekanewtons', 'daN'), equipment: 29 }]);
    expect(csv).toBe('Measurement,Units,Abbreviation,Equipment\nMax. Combined load,dekanewtons,daN,29\n');
  });
});
