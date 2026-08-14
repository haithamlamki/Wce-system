// ============================================================================
//  Shared list-page table — replicates the reference system's standard list
//  pattern: search box, Filters/Columns buttons, sortable headers, optional
//  grouped header band, page-size select and numbered pagination.
//  See docs/inspection-reference-parity.md §3.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';

export interface Column<T> {
  /** Stable key; also the Columns-menu identity. */
  key: string;
  header: string;
  /** Band label shown in the grouped header row (reference: Equipment, …). */
  group?: string;
  /** Cell renderer; falls back to `value`. */
  render?: (row: T) => ReactNode;
  /** Sort/search value. Required for sortable or searchable columns. */
  value?: (row: T) => string | number | null;
  align?: 'left' | 'right';
  sortable?: boolean;
  hidden?: boolean;
  /** Off by default but offered in the Columns menu (reference behaviour). */
  defaultHidden?: boolean;
  /** Always shown and absent from the Columns menu (reference: Unit, Remarks). */
  pinned?: boolean;
  /** Placeholder for this column's Filters input; defaults to `Header…`. */
  filterPlaceholder?: string;
  /** Set false for columns the reference leaves without a filter input. */
  filterable?: boolean;
  width?: number;
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  searchPlaceholder?: string;
  /** Extra filters surfaced inside the Filters popover. */
  filters?: FilterDef[];
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  rowActions?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyDesc?: string;
  /** Rendered between the toolbar and the table (e.g. bulk-action bar). */
  aboveTable?: ReactNode;
  initialPageSize?: number;
}

const PAGE_SIZES = [10, 25, 50, 100, 250, 500];

export default function DataTable<T>({
  rows, columns, rowKey, loading, error, searchPlaceholder = 'Search…',
  filters, selectable, selected, onSelectedChange, rowActions,
  emptyTitle = 'Nothing to show', emptyDesc = 'No records match the current filters.',
  aboveTable, initialPageSize = 10,
}: Props<T>) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPageSize);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const defaultHidden = useMemo(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
    [columns],
  );
  const [hidden, setHidden] = useState<ReadonlySet<string>>(defaultHidden);
  // The reference's "Filters" button reveals a per-column search row inside the
  // table head; "Columns" opens a grouped visibility menu.
  const [showFilters, setShowFilters] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [openMenu, setOpenMenu] = useState<'columns' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [openMenu]);

  const visible = useMemo(
    () => columns.filter((c) => !c.hidden && !hidden.has(c.key)),
    [columns, hidden],
  );

  /** Columns menu, grouped by band exactly like the reference's menu. */
  const menuGroups = useMemo(() => {
    const out: { label: string; items: Column<T>[] }[] = [];
    for (const c of columns) {
      if (c.hidden || c.pinned) continue;
      const label = c.group ?? 'Columns';
      const found = out.find((g) => g.label === label);
      if (found) found.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [columns]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const active = Object.entries(colFilters)
      .map(([k, v]) => [k, v.trim().toLowerCase()] as const)
      .filter(([, v]) => v !== '');
    if (!needle && active.length === 0) return rows;
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return rows.filter((r) => {
      if (needle && !columns.some((c) => {
        const v = c.value?.(r);
        return v != null && String(v).toLowerCase().includes(needle);
      })) return false;
      return active.every(([key, term]) => {
        const v = byKey.get(key)?.value?.(r);
        return v != null && String(v).toLowerCase().includes(term);
      });
    });
  }, [rows, q, colFilters, columns]);

  const sorted = useMemo(() => {
    if (!sort) return searched;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return searched;
    const get = col.value;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = get(a); const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * mul;
    });
  }, [searched, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * perPage, current * perPage);

  useEffect(() => { setPage(1); }, [q, perPage, rows]);

  const toggleSort = (c: Column<T>) => {
    if (!c.value || c.sortable === false) return;
    setSort((s) => (s?.key === c.key
      ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key: c.key, dir: 'asc' }));
  };

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected?.has(rowKey(r)));
  const toggleAll = () => {
    if (!onSelectedChange) return;
    const next = new Set(selected ?? []);
    if (allOnPage) pageRows.forEach((r) => next.delete(rowKey(r)));
    else pageRows.forEach((r) => next.add(rowKey(r)));
    onSelectedChange(next);
  };
  const toggleOne = (id: string) => {
    if (!onSelectedChange) return;
    const next = new Set(selected ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedChange(next);
  };

  const groups = useMemo(() => {
    if (!visible.some((c) => c.group)) return null;
    const out: { label: string; span: number }[] = [];
    for (const c of visible) {
      const label = c.group ?? '';
      const last = out[out.length - 1];
      if (last && last.label === label) last.span += 1;
      else out.push({ label, span: 1 });
    }
    return out;
  }, [visible]);

  const leadCols = selectable ? 1 : 0;
  const tailCols = rowActions ? 1 : 0;
  const colSpan = visible.length + leadCols + tailCols;

  const pageButtons = useMemo(() => {
    const list: number[] = [];
    const from = Math.max(1, current - 2);
    const to = Math.min(pageCount, from + 4);
    for (let i = from; i <= to; i += 1) list.push(i);
    return list;
  }, [current, pageCount]);

  return (
    <div>
      <div className="insp-toolbar">
        <div className="insp-search">
          <span className="mag" aria-hidden="true">⌕</span>
          <input
            className="insp-input" type="search" value={q}
            placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="grow">
          {filters?.map((f) => (
            <label className="insp-inline-filter" key={f.key}>
              <span>{f.label}</span>
              <select className="insp-select" value={f.value}
                onChange={(e) => f.onChange(e.target.value)}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          <button type="button" className={`insp-btn${showFilters ? ' active' : ''}`}
            aria-pressed={showFilters}
            onClick={() => {
              setShowFilters((v) => {
                if (v) setColFilters({});
                return !v;
              });
            }}>
            <Icon name="filter" /> Filters
          </button>
          <div className="insp-rel" ref={openMenu ? menuRef : undefined}>
            <button type="button" className="insp-btn"
              aria-expanded={openMenu === 'columns'} aria-haspopup="menu"
              onClick={() => setOpenMenu((m) => (m === 'columns' ? null : 'columns'))}>
              <Icon name="columns" /> Columns
            </button>
            {openMenu === 'columns' && (
              <div className="insp-popover insp-colmenu" role="menu" aria-label="Columns">
                <div className="title">Columns</div>
                <button type="button" role="menuitem" className="reset"
                  disabled={hidden.size === defaultHidden.size
                    && [...defaultHidden].every((k) => hidden.has(k))}
                  onClick={() => setHidden(new Set(defaultHidden))}>
                  Reset columns
                </button>
                {menuGroups.map((g) => (
                  <div key={g.label}>
                    <div className="grp">{g.label}</div>
                    {g.items.map((c) => {
                      const on = !hidden.has(c.key);
                      return (
                        <button key={c.key} type="button" role="menuitemcheckbox" aria-checked={on}
                          onClick={() => setHidden((h) => {
                            const n = new Set(h);
                            if (n.has(c.key)) n.delete(c.key); else n.add(c.key);
                            return n;
                          })}>
                          <span className="tick" aria-hidden="true">{on ? '✓' : ''}</span>
                          {c.header}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {aboveTable}

      <div className="insp-table-wrap">
        <table className="insp-table">
          <thead>
            {groups && (
              <tr>
                {selectable && <th className="group" aria-hidden="true" />}
                {groups.map((g, i) => (
                  <th key={`${g.label}-${i}`} className="group" colSpan={g.span}>{g.label}</th>
                ))}
                {rowActions && <th className="group" aria-hidden="true" />}
              </tr>
            )}
            <tr>
              {selectable && (
                <th style={{ width: 34 }}>
                  <input type="checkbox" checked={allOnPage} onChange={toggleAll}
                    aria-label="Select all rows on this page" />
                </th>
              )}
              {visible.map((c) => (
                <th key={c.key}
                  className={c.value && c.sortable !== false ? 'sortable' : undefined}
                  style={{ textAlign: c.align === 'right' ? 'right' : undefined, width: c.width }}
                  onClick={() => toggleSort(c)}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.header}
                  {c.value && c.sortable !== false && (
                    <span className="arrow" aria-hidden="true">
                      {sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  )}
                </th>
              ))}
              {rowActions && <th aria-label="Actions" style={{ width: 90 }} />}
            </tr>
            {showFilters && (
              <tr className="insp-filterrow-th">
                {selectable && <th />}
                {visible.map((c) => (
                  <th key={c.key}>
                    {c.value && c.filterable !== false && (
                      <input
                        className="insp-input" type="search"
                        value={colFilters[c.key] ?? ''}
                        placeholder={c.filterPlaceholder ?? `${c.header}…`}
                        aria-label={`Filter by ${c.header}`}
                        onChange={(e) => setColFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                      />
                    )}
                  </th>
                ))}
                {rowActions && <th />}
              </tr>
            )}
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={colSpan}>
                <div className="insp-empty"><span className="insp-spinner" /><div className="d">Loading…</div></div>
              </td></tr>
            )}
            {!loading && error && (
              <tr><td colSpan={colSpan}>
                <div className="insp-empty"><div className="ico">⚠</div><div className="t">Could not load</div><div className="d">{error}</div></div>
              </td></tr>
            )}
            {!loading && !error && pageRows.length === 0 && (
              <tr><td colSpan={colSpan}>
                <div className="insp-empty"><div className="ico">☰</div><div className="t">{emptyTitle}</div><div className="d">{emptyDesc}</div></div>
              </td></tr>
            )}
            {!loading && !error && pageRows.map((r) => {
              const id = rowKey(r);
              return (
                <tr key={id}>
                  {selectable && (
                    <td>
                      <input type="checkbox" checked={selected?.has(id) ?? false}
                        onChange={() => toggleOne(id)} aria-label="Select row" />
                    </td>
                  )}
                  {visible.map((c) => (
                    <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>
                      {c.render ? c.render(r) : (c.value?.(r) ?? '—')}
                    </td>
                  ))}
                  {rowActions && <td><div className="rowacts">{rowActions(r)}</div></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="insp-tablefoot">
        <label>
          <select className="insp-select" value={perPage} aria-label="Rows per page"
            onChange={(e) => setPerPage(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span>{sorted.length} record{sorted.length === 1 ? '' : 's'}</span>
        <div className="pages">
          <button type="button" className="insp-pagebtn" disabled={current <= 1}
            onClick={() => setPage(current - 1)} aria-label="Previous page">‹</button>
          {pageButtons.map((n) => (
            <button key={n} type="button"
              className={`insp-pagebtn${n === current ? ' active' : ''}`}
              aria-current={n === current ? 'page' : undefined}
              onClick={() => setPage(n)}>{n}</button>
          ))}
          {/* The reference always offers a jump to the last page. */}
          {pageCount > (pageButtons[pageButtons.length - 1] ?? 1) && (
            <>
              {pageCount > (pageButtons[pageButtons.length - 1] ?? 1) + 1 && <span aria-hidden="true">…</span>}
              <button type="button" className="insp-pagebtn"
                onClick={() => setPage(pageCount)}>{pageCount}</button>
            </>
          )}
          <button type="button" className="insp-pagebtn" disabled={current >= pageCount}
            onClick={() => setPage(current + 1)} aria-label="Next page">›</button>
        </div>
      </div>
    </div>
  );
}
