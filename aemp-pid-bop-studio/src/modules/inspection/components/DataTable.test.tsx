// ============================================================================
//  Parity guard for the shared list-page chrome replicated from the reference
//  system (docs/inspection-reference-parity.md §3): search placeholder,
//  Filters/Columns buttons, grouped header bands, page-size select and
//  numbered pagination.
// ============================================================================
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DataTable from './DataTable';
import type { Column } from './DataTable';

interface Row { id: string; unit: string; serial: string; due: string }

const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`, unit: `Rig ${100 + i}`, serial: `SN-${i}`, due: '2026-01-01',
}));

const columns: Column<Row>[] = [
  { key: 'unit', header: 'Unit', group: 'Equipment', value: (r) => r.unit },
  { key: 'serial', header: 'Serial', group: 'Equipment', value: (r) => r.serial },
  { key: 'due', header: 'Major Due', group: 'Inspection Schedule', value: (r) => r.due },
];

describe('DataTable — reference list chrome', () => {
  it('renders the page-specific search placeholder plus Filters and Columns', () => {
    const out = renderToStaticMarkup(
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id}
        searchPlaceholder="Search serial, equipment, part…" />,
    );
    expect(out).toContain('placeholder="Search serial, equipment, part…"');
    expect(out).toContain('Filters');
    expect(out).toContain('Columns');
  });

  it('renders the grouped header band above the column row', () => {
    const out = renderToStaticMarkup(
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />,
    );
    // The two Equipment columns share one band cell.
    expect(out).toMatch(/colspan="2"/i);
    expect(out).toContain('Equipment');
    expect(out).toContain('Inspection Schedule');
    expect(out).toContain('class="group"');
  });

  it('offers the reference page sizes and defaults to 10 rows per page', () => {
    const out = renderToStaticMarkup(
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />,
    );
    for (const size of [10, 25, 50, 100, 250, 500]) {
      expect(out).toContain(`value="${size}"`);
    }
    // 12 rows at 10 per page → only the first page is rendered.
    expect(out).toContain('SN-9');
    expect(out).not.toContain('SN-11');
  });

  it('paginates with numbered buttons and reports the row count', () => {
    const out = renderToStaticMarkup(
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />,
    );
    expect(out).toContain('12 records');
    expect(out).toContain('aria-current="page"');
  });

  it('adds a selection column only when selectable', () => {
    const plain = renderToStaticMarkup(
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />,
    );
    expect(plain).not.toContain('Select all rows on this page');

    const selectable = renderToStaticMarkup(
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id}
        selectable selected={new Set<string>()} onSelectedChange={() => {}} />,
    );
    expect(selectable).toContain('Select all rows on this page');
  });

  it('shows the empty state instead of an empty grid', () => {
    const out = renderToStaticMarkup(
      <DataTable rows={[] as Row[]} columns={columns} rowKey={(r) => r.id}
        emptyTitle="No inspection records" emptyDesc="Nothing matches." />,
    );
    expect(out).toContain('No inspection records');
    expect(out).toContain('Nothing matches.');
  });

  it('shows a loading state while rows are being fetched', () => {
    const out = renderToStaticMarkup(
      <DataTable rows={[] as Row[]} columns={columns} rowKey={(r) => r.id} loading />,
    );
    expect(out).toContain('insp-spinner');
    expect(out).toContain('Loading…');
  });

  it('surfaces load errors rather than rendering a silent empty table', () => {
    const out = renderToStaticMarkup(
      <DataTable rows={[] as Row[]} columns={columns} rowKey={(r) => r.id}
        error="permission denied" />,
    );
    expect(out).toContain('Could not load');
    expect(out).toContain('permission denied');
  });
});
