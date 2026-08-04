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

  it('unit viewer sees general tabs but not Master Sheet or Import', () => {
    const tabs = visibleTabs('field', new Set(['view'])).map((t) => t.label);
    expect(tabs).toEqual(['Dashboard', 'Tubular Inventory', 'Contracts', 'Asset Map', 'Order Pipe', 'Reference']);
  });

  it('view_fleet grant adds the Master Sheet tab', () => {
    const tabs = visibleTabs('field', new Set(['view', 'view_fleet'])).map((t) => t.label);
    expect(tabs).toContain('Master Sheet');
  });

  it('privileged users see all 8 tabs in the agreed order', () => {
    expect(visibleTabs('manager', none).map((t) => t.label)).toEqual([
      'Dashboard', 'Tubular Inventory', 'Master Sheet', 'Contracts',
      'Asset Map', 'Order Pipe', 'Reference', 'Import',
    ]);
  });

  it('retired tabs and old names are gone', () => {
    const labels = visibleTabs('admin', none).map((t) => t.label);
    for (const gone of ['Data Entry', 'AI Assistant', 'Manual', 'Transfers', 'Training',
      'Fleet Inventory', 'Master Register']) {
      expect(labels).not.toContain(gone);
    }
  });
});
