import { describe, expect, it } from 'vitest';
import { buildScopeTree, scopeUnitIds } from './ScopeTree';
import type { Company, InspUnit } from '../types';

const companies = [{ id: 'om', name: 'Abraj Oman' }, { id: 'kw', name: 'Abraj Kuwait' }] as Company[];
const units: InspUnit[] = [
  { id: 'r103', name: 'Rig 103', unitType: 'rig', companyId: 'om' },
  { id: 'h1', name: 'Hoist 1', unitType: 'hoist', companyId: 'om' },
  { id: 'r112', name: 'Rig 112', unitType: 'rig', companyId: 'kw' },
  { id: 'x', name: 'Yard', unitType: 'rig', companyId: null },
];

describe('buildScopeTree', () => {
  it('groups Company → Hoists / Drilling Rigs → Unit, companies by name', () => {
    const tree = buildScopeTree(units, companies);
    expect(tree.map((c) => c.name)).toEqual(['Abraj Kuwait', 'Abraj Oman']);
    const oman = tree[1];
    expect(oman.groups.map((g) => [g.label, g.units.map((u) => u.name)]))
      .toEqual([['Hoists', ['Hoist 1']], ['Drilling Rigs', ['Rig 103']]]);
  });

  it('leaves units without a company out of the tree', () => {
    const names = buildScopeTree(units, companies).flatMap((c) => c.groups.flatMap((g) => g.units.map((u) => u.name)));
    expect(names).not.toContain('Yard');
  });
});

describe('scopeUnitIds', () => {
  const tree = buildScopeTree(units, companies);
  it('is empty (no restriction) for the whole fleet', () => {
    expect(scopeUnitIds(tree, {})).toBe('');
  });
  it('expands a company or a group to its unit ids', () => {
    expect(scopeUnitIds(tree, { company: 'om' })).toBe('h1,r103');
    expect(scopeUnitIds(tree, { company: 'om', group: 'rig' })).toBe('r103');
  });
  it('selects one unit', () => {
    expect(scopeUnitIds(tree, { company: 'kw', group: 'rig', unit: 'r112' })).toBe('r112');
  });
});
