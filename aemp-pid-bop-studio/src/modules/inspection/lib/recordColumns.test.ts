// ============================================================================
//  The column-list ↔ mapRow contract.
//
//  These guard the defect found during UAT: mapRow() read `company_id`, no
//  column list ever selected it, so every record arrived with companyId null.
//  The edit form prefills from that record and writes every field back on save,
//  so the record's company silently vanished from the form.
//
//  The first test catches that whole CLASS of bug rather than the one instance:
//  it records which keys mapRow actually touches and asserts the detail query
//  asks for all of them. Add a field to mapRow and forget the column list, and
//  this fails immediately.
// ============================================================================
import { describe, expect, it } from 'vitest';
import { DETAIL_COLUMNS, LIST_COLUMNS, mapRow } from './records';

/** Keys mapRow reads, captured by handing it a recording proxy. */
function keysReadByMapRow(): string[] {
  const seen = new Set<string>();
  const probe = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (typeof prop === 'string') seen.add(prop);
      return undefined;
    },
    has: () => true,
  });
  mapRow(probe);
  return [...seen];
}

describe('record column lists', () => {
  it('asks the database for every field mapRow reads', () => {
    const selected = new Set(DETAIL_COLUMNS.split(','));
    const missing = keysReadByMapRow().filter((k) => !selected.has(k));
    expect(missing).toEqual([]);
  });

  it('selects company_id on the detail query, because the edit form writes it back', () => {
    expect(DETAIL_COLUMNS.split(',')).toContain('company_id');
  });

  it('maps company_id onto companyId', () => {
    expect(mapRow({ company_id: 'c-1' }).companyId).toBe('c-1');
    expect(mapRow({}).companyId).toBeNull();
  });

  it('never selects with a wildcard', () => {
    // A view built from `select *` has its column list frozen at creation and
    // silently drifts from the tables beneath it; naming columns on the client
    // keeps the query honest about what it actually depends on.
    for (const list of [LIST_COLUMNS, DETAIL_COLUMNS]) {
      expect(list).not.toContain('*');
      expect(list.split(',').every((c) => /^[a-z_]+$/.test(c))).toBe(true);
    }
  });

  it('keeps detail-only fields out of the list query', () => {
    const list = LIST_COLUMNS.split(',');
    expect(list).not.toContain('component_description');
    expect(list).not.toContain('reject_reason');
  });
});
