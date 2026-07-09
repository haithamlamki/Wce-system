import { describe, expect, it } from 'vitest';
import {
  canAccessModule,
  hasPermission,
  isPrivileged,
  visibleTabs,
} from './permissions';

const none = new Set<string>();

describe('tubular permissions (parity with has_tubular_perm)', () => {
  it('admin and manager are privileged; field and null are not', () => {
    expect(isPrivileged('admin')).toBe(true);
    expect(isPrivileged('manager')).toBe(true);
    expect(isPrivileged('field')).toBe(false);
    expect(isPrivileged(null)).toBe(false);
  });

  it('privileged users hold every permission implicitly', () => {
    expect(hasPermission('admin', none, 'manage_assignments')).toBe(true);
    expect(hasPermission('manager', none, 'import')).toBe(true);
  });

  it('field users need explicit grants', () => {
    expect(hasPermission('field', none, 'data_entry')).toBe(false);
    expect(hasPermission('field', new Set(['data_entry']), 'data_entry')).toBe(true);
    expect(hasPermission('field', new Set(['data_entry']), 'import')).toBe(false);
  });

  it('a loading/unknown role (null) has no implicit access — fail closed', () => {
    expect(hasPermission(null, none, 'view')).toBe(false);
    expect(canAccessModule(null, none)).toBe(false);
  });

  it('module access requires view or view_fleet (or privilege)', () => {
    expect(canAccessModule('field', none)).toBe(false);
    expect(canAccessModule('field', new Set(['view']))).toBe(true);
    expect(canAccessModule('field', new Set(['view_fleet']))).toBe(true);
    // a grant that is not a view grant does not open the module
    expect(canAccessModule('field', new Set(['export']))).toBe(false);
    expect(canAccessModule('admin', none)).toBe(true);
  });
});

describe('visibleTabs gating', () => {
  it('no module access -> no tabs at all', () => {
    expect(visibleTabs('field', none)).toEqual([]);
  });

  it('unit viewer sees general tabs but not Data Entry or Master Register', () => {
    const tabs = visibleTabs('field', new Set(['view'])).map((t) => t.label);
    expect(tabs).toContain('Dashboard');
    expect(tabs).toContain('Fleet Inventory');
    expect(tabs).not.toContain('Data Entry');
    expect(tabs).not.toContain('Master Register');
  });

  it('data_entry grant adds the Data Entry tab', () => {
    const tabs = visibleTabs('field', new Set(['view', 'data_entry'])).map((t) => t.label);
    expect(tabs).toContain('Data Entry');
  });

  it('privileged users see every tab', () => {
    const tabs = visibleTabs('manager', none);
    expect(tabs.map((t) => t.label)).toContain('Master Register');
    expect(tabs.length).toBeGreaterThanOrEqual(10);
  });
});
