// ============================================================================
//  What the table asks the DATABASE for, in server mode.
//
//  Guards the defect that shipped: `Column.key` is a UI identity (`serial`) and
//  was sent straight into `order=`, so PostgREST answered "column
//  insp_records_expanded.serial does not exist" and the table showed
//  "Could not load". Every sortable header and every per-column filter was
//  affected.
//
//  Also guards the other half of that fix: a column with no `field` has no
//  database column behind it (the Specification columns live inside a jsonb
//  payload), so it must offer no sort and no filter rather than emit a name the
//  database will reject.
// ============================================================================
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataTable from './DataTable';
import type { Column, ServerMode } from './DataTable';

interface Row { id: string; serial: string; diameters: string }
const ROWS: Row[] = [{ id: 'r1', serial: 'ABC-1', diameters: '5 in' }];

const COLUMNS: Column<Row>[] = [
  // A normal column: UI key differs from the database column on purpose.
  { key: 'serial', field: 'serial_number', header: 'Serial', value: (r) => r.serial },
  // A Specification column: derived from jsonb, no database column to name.
  { key: 'spec:Diameters', header: 'Diameters', value: (r) => r.diameters },
];

let container: HTMLDivElement;
let root: Root;

function render(server: ServerMode) {
  act(() => {
    root.render(
      <StrictMode>
        <DataTable rows={ROWS} columns={COLUMNS} rowKey={(r) => r.id} server={server} />
      </StrictMode>,
    );
  });
}

/** The payload of the most recent emission. */
function lastPayload(fn: { mock: { calls: unknown[][] } }) {
  const { calls } = fn.mock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return calls[calls.length - 1][0] as any;
}

/** The table debounces control changes by 250 ms before emitting. */
function flushDebounce() {
  act(() => { vi.advanceTimersByTime(400); });
}

function headerFor(text: string): HTMLTableCellElement {
  const ths = [...container.querySelectorAll('thead th')];
  const th = ths.find((h) => h.textContent?.replace(/[▲▼⇅]/g, '').trim() === text);
  if (!th) throw new Error(`no header ${text}`);
  return th as HTMLTableCellElement;
}

function clickButton(label: string) {
  const btn = [...container.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`no button ${label}`);
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

beforeEach(() => {
  // Tells React this is an act() environment, so it does not warn on every render.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('DataTable server query', () => {
  it('sorts by the DATABASE column, not the UI key', () => {
    const onChange = vi.fn();
    render({ total: 1, page: 1, perPage: 10, onChange });
    flushDebounce();
    onChange.mockClear();

    act(() => { headerFor('Serial').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    flushDebounce();

    expect(onChange).toHaveBeenCalled();
    const { sortBy } = lastPayload(onChange);
    expect(sortBy).toBe('serial_number');
    // The exact regression: the UI key must never reach the database.
    expect(sortBy).not.toBe('serial');
  });

  it('keys per-column filters by the DATABASE column', () => {
    const onChange = vi.fn();
    render({ total: 1, page: 1, perPage: 10, onChange });
    flushDebounce();
    clickButton('Filters');

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Filter by Serial"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(input, 'ABC');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    flushDebounce();

    const { columnFilters } = lastPayload(onChange);
    expect(columnFilters).toEqual({ serial_number: 'ABC' });
    expect(columnFilters).not.toHaveProperty('serial');
  });

  it('offers no sort or filter for a column with no database column behind it', () => {
    const onChange = vi.fn();
    render({ total: 1, page: 1, perPage: 10, onChange });
    flushDebounce();
    onChange.mockClear();

    const th = headerFor('Diameters');
    expect(th.className).not.toContain('sortable');
    expect(th.querySelector('.arrow')).toBeNull();

    clickButton('Filters');
    expect(container.querySelector('input[aria-label="Filter by Diameters"]')).toBeNull();

    // Clicking it must not emit an order the database cannot satisfy.
    act(() => { th.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    flushDebounce();
    for (const call of onChange.mock.calls) expect(call[0].sortBy).toBeNull();
  });

  it('stops emitting once the controls have settled', () => {
    // The refetch loop that exhausted the connection pool began here: the table
    // re-emitting forever. After the initial settle it must go quiet on its own.
    const onChange = vi.fn();
    render({ total: 1, page: 1, perPage: 10, onChange });
    flushDebounce();
    const afterSettle = onChange.mock.calls.length;
    flushDebounce();
    flushDebounce();
    expect(onChange.mock.calls.length).toBe(afterSettle);
  });

  it('follows the page the parent owns, so a filter change can reset paging', () => {
    const onChange = vi.fn();
    render({ total: 500, page: 3, perPage: 10, onChange });
    flushDebounce();
    onChange.mockClear();

    // The parent narrows the result set and resets to page 1.
    render({ total: 8, page: 1, perPage: 10, onChange });
    flushDebounce();

    expect(lastPayload(onChange).page).toBe(1);
  });
});
