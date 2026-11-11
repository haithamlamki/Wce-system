import { describe, expect, it } from 'vitest';
import {
  canAccessModule, diffSets, hasPermission, isPrivileged, INSPECTION_PERMISSIONS, PERMISSION_RESOURCES, permissionsOf,
} from './permissions';

describe('inspection permissions', () => {
  it('lists the 80 reference keys + 2 MOH + 2 AM keys across 23 resources', () => {
    expect(INSPECTION_PERMISSIONS).toHaveLength(84);
    expect(new Set(INSPECTION_PERMISSIONS).size).toBe(84);
    expect(PERMISSION_RESOURCES).toHaveLength(23);
    expect(permissionsOf('moh')).toEqual(['moh:update', 'moh:view']);
    expect(permissionsOf('am')).toEqual(['am:update', 'am:view']);
    expect(permissionsOf('inspection')).toContain('inspection:edit-identity');
    expect(permissionsOf('inspection')).not.toContain('inspection-file:upload');
  });

  it('admin and manager are privileged; field and null are not', () => {
    expect(isPrivileged('admin')).toBe(true);
    expect(isPrivileged('manager')).toBe(true);
    expect(isPrivileged('field')).toBe(false);
    expect(isPrivileged(null)).toBe(false);
  });

  it('privileged roles hold every permission implicitly', () => {
    for (const p of INSPECTION_PERMISSIONS) {
      expect(hasPermission('admin', new Set(), p)).toBe(true);
    }
  });

  it('non-privileged users need the key from one of their roles', () => {
    expect(hasPermission('field', new Set(), 'inspection:view')).toBe(false);
    expect(hasPermission('field', new Set(['inspection:view']), 'inspection:view')).toBe(true);
    expect(hasPermission('field', new Set(['inspection:view']), 'inspection:approve')).toBe(false);
  });

  it('module access needs any key (or privilege)', () => {
    expect(canAccessModule(null, new Set())).toBe(false);
    expect(canAccessModule('field', new Set(['calibration:view']))).toBe(true);
    expect(canAccessModule('manager', new Set())).toBe(true);
  });

  it('diffSets returns the additions and removals', () => {
    expect(diffSets(['a', 'b'], ['b', 'c', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
    expect(diffSets([], [])).toEqual({ added: [], removed: [] });
  });
});
