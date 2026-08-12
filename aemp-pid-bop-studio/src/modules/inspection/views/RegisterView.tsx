// ============================================================================
//  Register (Dashboard) — source-parity landing table: 4 collapsible column
//  groups (Work Unit / Equipment Detail / Inspection Detail / Documentation),
//  RAG-coloured inspection-date cells, per-column search row toggled by
//  "Advanced Search", folder tree, pagination and CSV export.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { fetchRecords } from '../lib/records';
import { getSignedUrl, listFileKindsFor } from '../lib/files';
import { applyColumnSearch, filterByCompliance, paginate } from '../lib/filters';
import { complianceStatus, recordCompliance, type ComplianceStatus } from '../lib/compliance';
import { downloadCsv, recordsToCsv } from '../lib/exportCsv';
import { APPROVE_STATUS_LABELS, CATEGORY_LABELS, FILE_KIND_LABELS,
  WORKING_STATUS_LABELS, type FileKind, type InspFile, type InspectionRecord } from '../types';
import SpecsPopover from '../components/SpecsPopover';
import UnitTree, { type TreeSel } from '../components/UnitTree';
import { EmptyState } from '../InspectionModule';

export function RagChip({ status }: { status: ComplianceStatus }) {
  const label = { overdue: 'Overdue', due_soon: 'Due Soon', compliant: 'Compliant', unknown: '—' }[status];
  return <span className={`insp-rag ${status}`}>{label}</span>;
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100, 250, 500];

/** DOCUMENTATION group columns, in source order. */
const DOC_KINDS: FileKind[] = ['oem_certificate', 'user_manual', 'spare_parts_manual',
  'drawing', 'inspection_certificate', 'major_inspection_certificate'];

// [searchKey, header] per group — the reference's exact column set and order.
const WORK_UNIT_COLS: [string, string][] = [
  ['company', 'Company'], ['unit', 'Unit'],
  ['category', 'Equipment Category'], ['equipment', 'Equipment'],
];
const EQUIPMENT_COLS: [string, string][] = [
  ['part', 'Equipment Part'], ['component', 'Equipment Part Component'],
  ['description', 'Description'], ['oem', 'OEM'], ['serial', 'Serial Number'],
  ['partNumber', 'Part Number'], ['status', 'Equipment Working Status'],
];
const INSPECTION_COLS: [string, string][] = [
  ['intermediateDate', 'Intermediate Inspection Date'],
  ['intermediateDue', 'Intermediate Inspection Due Date'],
  ['majorDate', 'Major Inspection Date'], ['majorDue', 'Major Inspection Due Date'],
  ['inspectionCompany', 'Inspection Company'], ['approveStatus', 'Equipment Inspection Status'],
];

/** RAG background for an inspection-date cell, driven by its own due date. */
function dateCellClass(due: string | null, today: string): string {
  const st = complianceStatus(due, today);
  return st === 'unknown' ? '' : `insp-cell-rag ${st}`;
}

export default function RegisterView() {
  const { canAccess, units } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [rag, setRag] = useState<ComplianceStatus | 'all'>('all');
  const [searchRow, setSearchRow] = useState(true);        // "Advanced Search" toggle
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tree, setTree] = useState(false);
  const [treeSel, setTreeSel] = useState<TreeSel>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [docs, setDocs] = useState<Map<string, Partial<Record<FileKind, InspFile>>>>(new Map());
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    fetchRecords().then((r) => { if (alive) { setRows(r); setLoading(false); } })
      .catch((e) => { if (alive) { setErr((e as Error).message); setLoading(false); } });
    return () => { alive = false; };
  }, [canAccess]);

  const filtered = useMemo(() => {
    let out = rows;
    if (treeSel.company) out = out.filter((r) => (r.companyName ?? 'Unassigned') === treeSel.company);
    if (treeSel.unit) out = out.filter((r) => r.unitName === treeSel.unit);
    out = applyColumnSearch(out, search);
    return filterByCompliance(out, rag, today);
  }, [rows, treeSel, search, rag, today]);

  const { pageRows, total, pages } = paginate(filtered, page, perPage);

  useEffect(() => {                                        // documentation icons per page
    let alive = true;
    listFileKindsFor(pageRows.map((r) => r.id))
      .then((m) => { if (alive) setDocs(m); })
      .catch(() => { /* icons are best-effort */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows.map((r) => r.id).join(',')]);

  const openDoc = async (f: InspFile) => {
    try { window.open(await getSignedUrl(f.storagePath), '_blank', 'noopener'); }
    catch (e) { alert((e as Error).message); }
  };

  const groups: [string, [string, string][]][] = [
    ['WORK UNIT', WORK_UNIT_COLS],
    ['EQUIPMENT DETAIL', EQUIPMENT_COLS],
    ['INSPECTION DETAIL', INSPECTION_COLS],
  ];
  const visCols = (g: string, cols: [string, string][]) => collapsed[g] ? [] : cols;
  const specsShown = !collapsed['EQUIPMENT DETAIL'];
  const docsShown = !collapsed['DOCUMENTATION'];

  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading register…" />;
  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Dashboard</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>
          Equipment inspection compliance across companies and units.
        </span>
        <div style={{ flex: 1 }} />
        <button className="insp-btn primary"
          onClick={() => downloadCsv(recordsToCsv(filtered), 'inspection-register.csv')}>
          ⭳ Export Data
        </button>
        <button className="insp-btn" onClick={() => setTree((v) => !v)}>🗀 Folder Structure</button>
        <button className="insp-btn" onClick={() => { setSearch({}); setTreeSel({}); setRag('all'); setPage(1); }}>
          ⊗ Clear Search
        </button>
        <button className="insp-btn" onClick={() => setSearchRow((v) => !v)}>🔍 Advanced Search</button>
      </div>

      <div className="insp-toolbar">
        <div className="insp-field">
          <label>View</label>
          <select value="equipment" onChange={() => { /* single view, source parity */ }}>
            <option value="equipment">Equipment</option>
          </select>
        </div>
        <div className="insp-field">
          <label>Inspection Status</label>
          <select value={rag} onChange={(e) => { setRag(e.target.value as ComplianceStatus | 'all'); setPage(1); }}>
            <option value="all">All</option>
            <option value="overdue">Overdue (Red)</option>
            <option value="due_soon">Due Soon (Yellow)</option>
            <option value="compliant">Compliant (Green)</option>
          </select>
        </div>
        <div className="insp-field">
          <label>Entries per page</label>
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
            {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>
          Showing {pageRows.length ? (page - 1) * perPage + 1 : 0}–{(page - 1) * perPage + pageRows.length} of {total} entries
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {tree && <UnitTree rows={rows} units={units} sel={treeSel}
          onSelect={(s) => { setTreeSel(s); setPage(1); }} />}

        <div className="insp-table-wrap" style={{ flex: 1 }}>
          <table className="insp-table">
            <thead>
              <tr>
                {groups.map(([g, cols]) => (
                  <th key={g} className="insp-th-group"
                    colSpan={collapsed[g] ? 1 : cols.length + (g === 'EQUIPMENT DETAIL' ? 1 : 0)}>
                    <button className="insp-group-toggle"
                      onClick={() => setCollapsed((c) => ({ ...c, [g]: !c[g] }))}>
                      {collapsed[g] ? '▸' : '▾'} {g}
                    </button>
                  </th>
                ))}
                <th className="insp-th-group" colSpan={docsShown ? DOC_KINDS.length : 1}>
                  <button className="insp-group-toggle"
                    onClick={() => setCollapsed((c) => ({ ...c, DOCUMENTATION: !c.DOCUMENTATION }))}>
                    {docsShown ? '▾' : '▸'} DOCUMENTATION
                  </button>
                </th>
              </tr>
              <tr>
                {visCols('WORK UNIT', WORK_UNIT_COLS).map(([, h]) => <th key={h}>{h}</th>)}
                {collapsed['WORK UNIT'] && <th>…</th>}
                {visCols('EQUIPMENT DETAIL', EQUIPMENT_COLS).map(([, h]) => <th key={h}>{h}</th>)}
                {specsShown ? <th>Specs</th> : <th>…</th>}
                {visCols('INSPECTION DETAIL', INSPECTION_COLS).map(([, h]) => <th key={h}>{h}</th>)}
                {collapsed['INSPECTION DETAIL'] && <th>…</th>}
                {docsShown
                  ? DOC_KINDS.map((k) => <th key={k} className="insp-doc-th">{FILE_KIND_LABELS[k]}</th>)
                  : <th>…</th>}
              </tr>
              {searchRow && (
                <tr>
                  {visCols('WORK UNIT', WORK_UNIT_COLS).map(([key]) => (
                    <th key={key}><input placeholder="Search…" value={search[key] ?? ''}
                      onChange={(e) => { setSearch((s) => ({ ...s, [key]: e.target.value })); setPage(1); }} /></th>
                  ))}
                  {collapsed['WORK UNIT'] && <th />}
                  {visCols('EQUIPMENT DETAIL', EQUIPMENT_COLS).map(([key]) => (
                    <th key={key}><input placeholder="Search…" value={search[key] ?? ''}
                      onChange={(e) => { setSearch((s) => ({ ...s, [key]: e.target.value })); setPage(1); }} /></th>
                  ))}
                  <th />
                  {visCols('INSPECTION DETAIL', INSPECTION_COLS).map(([key]) => (
                    <th key={key}><input placeholder="Search…" value={search[key] ?? ''}
                      onChange={(e) => { setSearch((s) => ({ ...s, [key]: e.target.value })); setPage(1); }} /></th>
                  ))}
                  {collapsed['INSPECTION DETAIL'] && <th />}
                  {docsShown ? DOC_KINDS.map((k) => <th key={k} />) : <th />}
                </tr>
              )}
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const recDocs = docs.get(r.id) ?? {};
                return (
                  <tr key={r.id}>
                    {!collapsed['WORK UNIT'] ? <>
                      <td>{r.companyName ?? '—'}</td>
                      <td>{r.unitName}</td>
                      <td>{CATEGORY_LABELS[r.category]}</td>
                      <td>{r.typeName}</td>
                    </> : <td>…</td>}
                    {!collapsed['EQUIPMENT DETAIL'] ? <>
                      <td>{r.partName ?? ''}</td>
                      <td>{r.componentName ?? ''}</td>
                      <td>{r.componentDescription}</td>
                      <td>{r.oem}</td>
                      <td>{r.serialNumber}</td>
                      <td>{r.partNumber}</td>
                      <td>{WORKING_STATUS_LABELS[r.workingStatus]}</td>
                      <td><SpecsPopover record={r} /></td>
                    </> : <td>…</td>}
                    {!collapsed['INSPECTION DETAIL'] ? <>
                      <td className={dateCellClass(r.intermediateDueDate, today)}>{r.intermediateDate ?? ''}</td>
                      <td>{r.intermediateDueDate ?? ''}</td>
                      <td className={dateCellClass(r.majorDueDate, today)}>{r.majorDate ?? ''}</td>
                      <td>{r.majorDueDate ?? ''}</td>
                      <td>{r.inspectionCompany || '—'}</td>
                      <td>{APPROVE_STATUS_LABELS[r.approveStatus]}</td>
                    </> : <td><RagChip status={recordCompliance(r, today)} /></td>}
                    {docsShown ? DOC_KINDS.map((k) => {
                      const f = recDocs[k];
                      return (
                        <td key={k} style={{ textAlign: 'center' }}>
                          {f && (
                            <button className="insp-btn" style={{ padding: '1px 6px' }}
                              title={`${FILE_KIND_LABELS[k]} — ${f.fileName}`} onClick={() => openDoc(f)}>🗎</button>
                          )}
                        </td>
                      );
                    }) : <td>…</td>}
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr><td colSpan={24} style={{ textAlign: 'center', color: 'var(--dim)' }}>No matching records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="insp-toolbar" style={{ marginTop: 10 }}>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span style={{ fontSize: 12 }}>Page {page} / {pages}</span>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage(pages)}>Last</button>
      </div>
    </div>
  );
}
