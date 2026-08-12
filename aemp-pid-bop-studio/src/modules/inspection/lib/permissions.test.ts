import { describe, expect, it } from 'vitest';
import { canAccessModule, hasPermission, isPrivileged, INSPECTION_PERMISSIONS } from './permissions';

describe('inspection permissions', () => {
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

  it('non-privileged users need an explicit grant', () => {
    expect(hasPermission('field', new Set(), 'insp_view')).toBe(false);
    expect(hasPermission('field', new Set(['insp_view']), 'insp_view')).toBe(true);
    expect(hasPermission('field', new Set(['insp_view']), 'insp_approve')).toBe(false);
  });

  it('module access requires insp_view (or privilege)', () => {
    expect(canAccessModule(null, new Set())).toBe(false);
    expect(canAccessModule('field', new Set(['insp_view']))).toBe(true);
    expect(canAccessModule('manager', new Set())).toBe(true);
  });
});
