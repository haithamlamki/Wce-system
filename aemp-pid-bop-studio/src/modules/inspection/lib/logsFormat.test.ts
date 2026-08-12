import { describe, expect, it } from 'vitest';
import { formatChanges, mergeModulePermissions, urgencyOf } from './logsFormat';

describe('formatChanges', () => {
  it('maps column names to labels and renders old → new', () => {
    const rows = formatChanges({
      approve_status: ['pending_approval', 'approved'],
      major_date: [null, '2026-06-01'],
      serial_number: ['A-1', 'A-2'],
    });
    expect(rows).toContainEqual({ field: 'Approve Status', from: 'Pending Approval', to: 'Approved' });
    expect(rows).toContainEqual({ field: 'Major Inspection Date', from: '—', to: '2026-06-01' });
    expect(rows).toContainEqual({ field: 'Serial Number', from: 'A-1', to: 'A-2' });
  });
  it('renders spec objects and unknown columns sensibly', () => {
    const rows = formatChanges({ specs: [{ 'Size (in)': '5' }, { 'Size (in)': '7' }], custom_col: [1, 2] });
    expect(rows.find((r) => r.field === 'Specs')?.to).toContain('Size (in): 7');
    expect(rows.find((r) => r.field === 'custom_col')).toBeTruthy();
  });
});

describe('urgencyOf', () => {
  it('red within 7 days or overdue, amber within 14, green beyond', () => {
    expect(urgencyOf(-3)).toBe('red');
    expect(urgencyOf(0)).toBe('red');
    expect(urgencyOf(7)).toBe('red');
    expect(urgencyOf(8)).toBe('amber');
    expect(urgencyOf(14)).toBe('amber');
    expect(urgencyOf(15)).toBe('green');
  });
});

describe('mergeModulePermissions', () => {
  it('replaces only the insp_* subset, preserving other module grants', () => {
    const out = mergeModulePermissions(
      ['view', 'data_entry', 'insp_view', 'insp_upload'],
      ['insp_view', 'insp_approve'],
    );
    expect(out.sort()).toEqual(['data_entry', 'insp_approve', 'insp_view', 'view']);
  });
  it('handles empty selections', () => {
    expect(mergeModulePermissions(['insp_view', 'export'], [])).toEqual(['export']);
    expect(mergeModulePermissions([], ['insp_view'])).toEqual(['insp_view']);
  });
});
