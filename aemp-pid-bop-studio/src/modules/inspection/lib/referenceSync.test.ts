import { describe, expect, it } from 'vitest';
import { canonicalUnitNames, categoryFixes, planSync } from './referenceSync';
import type { RefRow } from './referenceImport';
import type { EquipmentType } from '../types';

function row(over: Partial<RefRow>): RefRow {
  return {
    company: 'Abraj', unit: 'Rig 103', equipment: 'Air pump', part: '', component: '',
    description: '', oem: '', status: 'in_use', serial: 'SN-1', partNumber: '',
    inspectionCompany: '', intermediateDate: null, intermediateFreqMonths: null,
    majorDate: null, majorFreqMonths: null, manufactureYear: null, remarks: '', specs: {},
    category: null, elastomer: '', inspectionReport: '',
    approval: { status: 'approved', requestedBy: null, requestedAt: null,
      requestedFor: null, approvedBy: null, approvedAt: null },
    ...over,
  };
}

describe('canonicalUnitNames', () => {
  it('collapses case variants, preferring the capitalised spelling', () => {
    const m = canonicalUnitNames([row({ unit: 'hoist 2' }), row({ unit: 'Hoist 2' }), row({ unit: 'flst' })]);
    expect(m.get('hoist 2')).toBe('Hoist 2');
    expect(m.get('flst')).toBe('flst');
  });
});

describe('planSync', () => {
  const units = new Map([['rig 103', 'u1'], ['hoist 2', 'u2']]);
  const rec = (id: string, unit_id: string, serial_number: string, type_name = 'Air pump',
    part_name = '', component_name = '') => ({ id, unit_id, serial_number, type_name, part_name, component_name });
  const existing = [
    rec('r1', 'u1', 'SN-1'),
    rec('r2', 'u1', 'GONE'),
    rec('r3', 'u2', ''),
  ];

  it('splits rows into updates and inserts, matching serial case-insensitively', () => {
    const plan = planSync([row({ serial: 'sn-1' }), row({ serial: 'NEW-1' }),
      row({ unit: 'hoist 2', serial: 'NEW-2' })], units, existing);
    expect(plan.updates).toBe(1);
    expect(plan.inserts).toBe(2);
  });

  it('follows an upstream equipment/part change when the unit+serial is unique', () => {
    const plan = planSync([row({ serial: 'SN-1', equipment: 'Mud Pump', part: 'Power End' })],
      units, existing);
    expect(plan).toMatchObject({ updates: 1, inserts: 0 });
  });

  it('matches shared serials by equipment + part + component, inserting the rest', () => {
    const shared = [rec('m1', 'u1', 'MP-1', 'Mud Pump', 'Power End')];
    const plan = planSync([
      row({ serial: 'MP-1', equipment: 'Mud Pump', part: 'power end' }),
      row({ serial: 'MP-1', equipment: 'Mud Pump', part: 'Assembly' }),
    ], units, shared);
    expect(plan).toMatchObject({ updates: 1, inserts: 1, orphanIds: [] });
  });

  it('lists database records the export no longer contains', () => {
    const plan = planSync([row({ serial: 'SN-1' })], units, existing);
    expect(plan.orphanIds.sort()).toEqual(['r2', 'r3']);
  });

  it('always inserts rows without a serial (nothing to match on)', () => {
    const plan = planSync([row({ serial: '' })], units, existing);
    expect(plan.inserts).toBe(1);
    expect(plan.updates).toBe(0);
  });
});

describe('categoryFixes', () => {
  const types = [
    { id: 't1', name: 'Air pump', category: 'well_control' },
    { id: 't2', name: 'AC generator', category: 'others' },
  ] as EquipmentType[];

  it('reports types whose category differs from the export, by majority', () => {
    const fixes = categoryFixes([
      row({ equipment: 'AC generator', category: 'power' }),
      row({ equipment: 'ac generator', category: 'power', serial: 'x' }),
      row({ equipment: 'AC generator', category: 'others', serial: 'y' }),
      row({ equipment: 'Air pump', category: 'well_control' }),
    ], types);
    expect(fixes).toEqual([{ id: 't2', name: 'AC generator', from: 'others', to: 'power' }]);
  });

  it('ignores rows without a category (Aug layout)', () => {
    expect(categoryFixes([row({ equipment: 'AC generator' })], types)).toEqual([]);
  });
});
