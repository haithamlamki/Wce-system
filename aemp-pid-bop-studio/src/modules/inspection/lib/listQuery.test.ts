// ============================================================================
//  Guards the refetch-loop invariant.
//
//  The list views hold their query in state and refetch whenever its identity
//  changes. The table re-emits its control state after every render, so if an
//  identical emission were stored as a fresh object the view would fetch,
//  re-render, emit, and fetch again without end. That happened in development:
//  the browser queued dozens of concurrent PostgREST requests, exhausted the
//  connection pool and left the page stuck on "Loading" until requests began
//  failing with a statement timeout. `sameQuery` is what stops it.
// ============================================================================
import { describe, expect, it } from 'vitest';
import { countKey, sameQuery } from './records';

describe('sameQuery', () => {
  it('treats a repeated emission of the same controls as unchanged', () => {
    const a = { page: 1, perPage: 10, search: '', sortBy: undefined, columnFilters: {} };
    const b = { page: 1, perPage: 10, search: '', sortBy: undefined, columnFilters: {} };
    expect(sameQuery(a, b)).toBe(true);
  });

  it('treats an absent key and an explicit undefined as the same query', () => {
    expect(sameQuery({ page: 1, perPage: 10 }, { page: 1, perPage: 10, sortBy: undefined }))
      .toBe(true);
  });

  it('does not collapse an absent search into an empty-string search', () => {
    // The first emission after mount adds `search: ''` where the initial state
    // had no key at all. That IS a change, and storing it is what lets the
    // second, now-identical emission compare equal and stop the loop.
    expect(sameQuery({ page: 1, perPage: 10 }, { page: 1, perPage: 10, search: '' }))
      .toBe(false);
  });

  it('detects a page change', () => {
    expect(sameQuery({ page: 1, perPage: 10 }, { page: 2, perPage: 10 })).toBe(false);
  });

  it('detects a sort direction flip on the same column', () => {
    expect(sameQuery(
      { page: 1, perPage: 10, sortBy: 'serial_number', sortAsc: true },
      { page: 1, perPage: 10, sortBy: 'serial_number', sortAsc: false },
    )).toBe(false);
  });

  it('detects a per-column filter appearing, changing and disappearing', () => {
    const none = { page: 1, perPage: 10, columnFilters: {} };
    const set = { page: 1, perPage: 10, columnFilters: { unit_name: 'Rig 209' } };
    const other = { page: 1, perPage: 10, columnFilters: { unit_name: 'Rig 306' } };
    expect(sameQuery(none, set)).toBe(false);
    expect(sameQuery(set, other)).toBe(false);
    expect(sameQuery(set, none)).toBe(false);
    expect(sameQuery(set, { ...set, columnFilters: { unit_name: 'Rig 209' } })).toBe(true);
  });

  it('detects a second filter added alongside an unchanged one', () => {
    expect(sameQuery(
      { page: 1, perPage: 10, columnFilters: { unit_name: 'Rig 209' } },
      { page: 1, perPage: 10, columnFilters: { unit_name: 'Rig 209', company_name: 'Abraj' } },
    )).toBe(false);
  });

  it('ignores the scope fields only when they are genuinely equal', () => {
    // Approvals scopes the queue by approver in the DATABASE; a change there
    // must always refetch, never be swallowed as "same query".
    expect(sameQuery(
      { page: 1, perPage: 10, approveStatus: 'pending_approval', approverId: 'u1' },
      { page: 1, perPage: 10, approveStatus: 'pending_approval', approverId: 'u2' },
    )).toBe(false);
  });
});

// ============================================================================
//  countKey decides when the cached exact count may be reused. An exact count
//  over this view costs ~1.3 s, so reuse matters — but reusing it across a
//  different result set would display a wrong total, and reusing it across a
//  different USER would display a total computed under someone else's
//  authorization scope. These tests pin both halves.
// ============================================================================
describe('countKey', () => {
  const base = { page: 1, perPage: 10, category: 'hoisting' as const, search: 'bop' };

  it('is unchanged by paging — paging cannot change how many rows match', () => {
    expect(countKey({ ...base, page: 7 }, 'u1')).toBe(countKey(base, 'u1'));
  });

  it('is unchanged by page size', () => {
    expect(countKey({ ...base, perPage: 250 }, 'u1')).toBe(countKey(base, 'u1'));
  });

  it('is unchanged by sort column or direction', () => {
    expect(countKey({ ...base, sortBy: 'serial_number', sortAsc: true }, 'u1'))
      .toBe(countKey({ ...base, sortBy: 'major_due_date', sortAsc: false }, 'u1'));
  });

  it('changes when a row-restricting filter changes', () => {
    for (const patch of [
      { category: 'rotary' as const }, { unitId: 'u-9' }, { typeId: 't-9' },
      { partId: 'p-9' }, { workingStatus: 'in_use' as const },
      { approveStatus: 'pending_approval' as const },
    ]) {
      expect(countKey({ ...base, ...patch }, 'u1')).not.toBe(countKey(base, 'u1'));
    }
  });

  it('changes when the search changes', () => {
    expect(countKey({ ...base, search: 'valve' }, 'u1')).not.toBe(countKey(base, 'u1'));
  });

  it('changes when a per-column filter is added, altered or removed', () => {
    const none = countKey(base, 'u1');
    const one = countKey({ ...base, columnFilters: { unit_name: 'Rig 209' } }, 'u1');
    const other = countKey({ ...base, columnFilters: { unit_name: 'Rig 306' } }, 'u1');
    expect(one).not.toBe(none);
    expect(other).not.toBe(one);
    expect(countKey({ ...base, columnFilters: {} }, 'u1')).toBe(none);
  });

  it('ignores blank filter values, which restrict nothing', () => {
    expect(countKey({ ...base, columnFilters: { unit_name: '   ' } }, 'u1'))
      .toBe(countKey(base, 'u1'));
  });

  it('does not depend on the order filters happen to be written in', () => {
    expect(countKey({ ...base, columnFilters: { a: '1', b: '2' } }, 'u1'))
      .toBe(countKey({ ...base, columnFilters: { b: '2', a: '1' } }, 'u1'));
  });

  it('never lets a count cross users', () => {
    expect(countKey(base, 'u1')).not.toBe(countKey(base, 'u2'));
  });

  it('never lets a count cross approver scopes', () => {
    // Approvals scopes the queue to one approver in the DATABASE; a total
    // computed for one approver must not be shown to another.
    expect(countKey({ ...base, approverId: 'a1' }, 'u1'))
      .not.toBe(countKey({ ...base, approverId: 'a2' }, 'u1'));
    expect(countKey({ ...base, approverId: 'a1' }, 'u1'))
      .not.toBe(countKey(base, 'u1'));
  });
});
