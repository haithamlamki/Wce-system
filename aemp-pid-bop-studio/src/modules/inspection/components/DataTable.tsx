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
  /**
   * Database column backing this UI column. Required for server-side sorting
   * and per-column filtering, because `key` is a UI identity (`serial`) and the
   * database column is not (`serial_number`). Columns without a field are not
   * offered for server-side sort/filter rather than sending an invalid name.
   */
  field?: string;
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

/**
 * Supplied when the DATABASE performs search, filtering, sorting and paging.
 * `rows` then contains only the current page, and `total` is the filtered count
 * from the server — the component stops doing any of that work itself.
 */
export interface ServerMode {
  total: number;
  page: number;
  perPage: number;
  loading?: boolean;
  onChange: (next: {
    page: number;
    perPage: number;
    search: string;
    sortBy: string | null;
    sortAsc: boolean;
    columnFilters: Record<string, string>;
  }) => void;
}

interface Props<T> {
  rows: T[];
  server?: ServerMode;
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
  rows, server, columns, rowKey, loading, error, searchPlaceholder = 'Search…',
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
  // Columns can arrive after mount (the Specifications band is derived from the
  // catalog, which loads asynchronously). Apply `defaultHidden` to each column
  // the first time it is seen, so late arrivals still start hidden without
  // overriding a choice the user has since made.
  const seenKeys = useRef<Set<string>>(new Set(columns.map((c) => c.key)));
  useEffect(() => {
    const unseen = columns.filter((c) => !seenKeys.current.has(c.key));
    if (unseen.length === 0) return;
    unseen.forEach((c) => seenKeys.current.add(c.key));
    const late = unseen.filter((c) => c.defaultHidden).map((c) => c.key);
    if (late.length > 0) setHidden((h) => new Set([...h, ...late]));
  }, [columns]);
  // The reference's "Filters" button reveals a per-column search row inside the
  // table head; "Columns" opens a grouped visibility menu.
  const [showFilters, setShowFilters] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  // `openMenu` is 'columns' for the toolbar menu or `band:<label>` for the
  // per-band menu the reference puts in the grouped header.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [collapsedBands, setCollapsedBands] = useState<ReadonlySet<string>>(new Set());
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

  // A collapsed band keeps only its pinned columns, exactly as the reference's
  // chevron control behaves (collapsing "Equipment" leaves "Unit" standing).
  const visible = useMemo(
    () => columns.filter((c) => {
      if (c.hidden || hidden.has(c.key)) return false;
      if (c.group && collapsedBands.has(c.group) && !c.pinned) return false;
      return true;
    }),
    [columns, hidden, collapsedBands],
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

  const isServerMode = !!server;

  const searched = useMemo(() => {
    // In server mode the database has already applied search and filters.
    if (isServerMode) return rows;
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
  }, [rows, q, colFilters, columns, isServerMode]);

  const sorted = useMemo(() => {
    // Server mode: the database already ordered these rows.
    if (isServerMode) return searched;
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
  }, [searched, sort, columns, isServerMode]);

  const totalRows = server ? server.total : sorted.length;
  const effPerPage = server ? server.perPage : perPage;
  const pageCount = Math.max(1, Math.ceil(totalRows / effPerPage));
  const current = server ? server.page : Math.min(page, pageCount);
  const pageRows = server ? sorted : sorted.slice((current - 1) * perPage, current * perPage);
  const busy = loading || server?.loading;

  useEffect(() => { if (!isServerMode) setPage(1); }, [q, perPage, rows, isServerMode]);

  // In server mode the parent owns the page number, so an externally driven
  // reset — a category chip narrowing the result set to fewer pages than the
  // current cursor — pulls this component's cursor back with it.
  const serverPage = server?.page;
  useEffect(() => { if (serverPage !== undefined) setPage(serverPage); }, [serverPage]);

  // Server mode: report control changes upward, debouncing typed input so a
  // search does not fire a query per keystroke.
  const onChangeRef = useRef(server?.onChange);
  onChangeRef.current = server?.onChange;
  // Read through a ref rather than a dependency: `columns` is rebuilt on every
  // parent render, so depending on it would re-fire this effect after each
  // fetch and spin the query forever.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  useEffect(() => {
    if (!isServerMode) return undefined;
    const t = setTimeout(() => {
      // Translate UI column keys to database column names; a column without a
      // `field` cannot be sorted or filtered server-side, so it is dropped
      // rather than sent as an invalid column name.
      const fieldOf = (key: string) => columnsRef.current.find((c) => c.key === key)?.field;
      const filters: Record<string, string> = {};
      for (const [key, value] of Object.entries(colFilters)) {
        const f = fieldOf(key);
        if (f && value.trim()) filters[f] = value;
      }
      onChangeRef.current?.({
        page, perPage, search: q,
        sortBy: sort ? fieldOf(sort.key) ?? null : null,
        sortAsc: sort?.dir !== 'desc',
        columnFilters: filters,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [isServerMode, page, perPage, q, sort, colFilters]);

  /** A column the database cannot order or filter by (no backing `field`). */
  const notQueryable = (c: Column<T>) => isServerMode && !c.field;

  const toggleSort = (c: Column<T>) => {
    if (!c.value || c.sortable === false || notQueryable(c)) return;
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
          <div className="insp-rel" ref={openMenu === 'columns' ? menuRef : undefined}>
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
                {groups.map((g, i) => {
                  const toggleable = columns.filter(
                    (c) => (c.group ?? '') === g.label && !c.hidden && !c.pinned,
                  );
                  const collapsed = collapsedBands.has(g.label);
                  return (
                    <th key={`${g.label}-${i}`} className="group" colSpan={g.span}>
                      {g.label && (
                        <span className="bandhead">
                          <span>{g.label}</span>
                          {toggleable.length > 0 && (
                            <span className="insp-rel">
                              <button type="button" className="insp-iconbtn xs"
                                aria-label={`${g.label} column visibility`} aria-haspopup="menu"
                                aria-expanded={openMenu === `band:${g.label}`}
                                onClick={() => setOpenMenu(
                                  (m) => (m === `band:${g.label}` ? null : `band:${g.label}`),
                                )}>
                                <Icon name="band-columns" size={13} />
                              </button>
                              {openMenu === `band:${g.label}` && (
                                <div className="insp-popover insp-colmenu" role="menu"
                                  aria-label={`${g.label} columns`} ref={menuRef}>
                                  <button type="button" role="menuitem" className="reset"
                                    onClick={() => setHidden((h) => {
                                      const n = new Set(h);
                                      toggleable.forEach((c) => {
                                        if (c.defaultHidden) n.add(c.key); else n.delete(c.key);
                                      });
                                      return n;
                                    })}>
                                    Reset columns
                                  </button>
                                  {toggleable.map((c) => {
                                    const on = !hidden.has(c.key);
                                    return (
                                      <button key={c.key} type="button" role="menuitemcheckbox"
                                        aria-checked={on}
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
                              )}
                            </span>
                          )}
                          <button type="button" className="insp-iconbtn xs"
                            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${g.label}`}
                            onClick={() => setCollapsedBands((s) => {
                              const n = new Set(s);
                              if (n.has(g.label)) n.delete(g.label); else n.add(g.label);
                              return n;
                            })}>
                            <Icon name={collapsed ? 'band-expand' : 'band-collapse'} size={13} />
                          </button>
                        </span>
                      )}
                    </th>
                  );
                })}
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
                  className={c.value && c.sortable !== false && !notQueryable(c) ? 'sortable' : undefined}
                  style={{ textAlign: c.align === 'right' ? 'right' : undefined, width: c.width }}
                  onClick={() => toggleSort(c)}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.header}
                  {c.value && c.sortable !== false && !notQueryable(c) && (
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
                    {c.value && c.filterable !== false && !notQueryable(c) && (
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
            {busy && (
              <tr><td colSpan={colSpan}>
                <div className="insp-empty"><span className="insp-spinner" /><div className="d">Loading…</div></div>
              </td></tr>
            )}
            {!busy && error && (
              <tr><td colSpan={colSpan}>
                <div className="insp-empty"><div className="ico">⚠</div><div className="t">Could not load</div><div className="d">{error}</div></div>
              </td></tr>
            )}
            {!busy && !error && pageRows.length === 0 && (
              <tr><td colSpan={colSpan}>
                <div className="insp-empty"><div className="ico">☰</div><div className="t">{emptyTitle}</div><div className="d">{emptyDesc}</div></div>
              </td></tr>
            )}
            {!busy && !error && pageRows.map((r) => {
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
          <select className="insp-select" value={effPerPage} aria-label="Rows per page"
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span>{totalRows} record{totalRows === 1 ? '' : 's'}</span>
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
