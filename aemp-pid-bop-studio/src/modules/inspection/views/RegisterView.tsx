// ============================================================================
//  Register (Dashboard) — the source system's landing table: folder tree
//  (Company → Unit), RAG inspection-status filter, per-column search,
//  pagination and CSV export. RAG is computed live (enhancement).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { fetchRecords } from '../lib/records';
import { applyColumnSearch, filterByCompliance, paginate } from '../lib/filters';
import { recordCompliance, type ComplianceStatus } from '../lib/compliance';
import { downloadCsv, recordsToCsv } from '../lib/exportCsv';
import { APPROVE_STATUS_LABELS, CATEGORY_LABELS, WORKING_STATUS_LABELS,
  type InspectionRecord } from '../types';
import SpecsPopover from '../components/SpecsPopover';
import UnitTree, { type TreeSel } from '../components/UnitTree';
import { EmptyState } from '../InspectionModule';

export function RagChip({ status }: { status: ComplianceStatus }) {
  const label = { overdue: 'Overdue', due_soon: 'Due Soon', compliant: 'Compliant', unknown: '—' }[status];
  return <span className={`insp-rag ${status}`}>{label}</span>;
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100, 250, 500];

const CORE_COLS: [string, string][] = [                    // [searchKey, header]
  ['company', 'Company'], ['unit', 'Unit'], ['category', 'Equipment Category'],
  ['equipment', 'Equipment'], ['part', 'Equipment Part'], ['component', 'Part Component'],
  ['description', 'Description'], ['oem', 'OEM'], ['serial', 'Serial Number'],
];
const ADV_COLS: [string, string][] = [
  ['partNumber', 'Part Number'], ['status', 'Working Status'],
  ['inspectionCompany', 'Inspection Company'], ['approveStatus', 'Approve Status'],
];

export default function RegisterView() {
  const { canAccess, units } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [rag, setRag] = useState<ComplianceStatus | 'all'>('all');
  const [advanced, setAdvanced] = useState(false);
  const [tree, setTree] = useState(false);
  const [treeSel, setTreeSel] = useState<TreeSel>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
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
  const cols = advanced ? [...CORE_COLS, ...ADV_COLS] : CORE_COLS;

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
        <button className="insp-btn" onClick={() => setAdvanced((v) => !v)}>🔍 Advanced Search</button>
      </div>

      <div className="insp-toolbar">
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
          Showing {pageRows.length ? (page - 1) * perPage + 1 : 0}–{(page - 1) * perPage + pageRows.length} of {total}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {tree && <UnitTree rows={rows} units={units} sel={treeSel}
          onSelect={(s) => { setTreeSel(s); setPage(1); }} />}

        <div className="insp-table-wrap" style={{ flex: 1 }}>
          <table className="insp-table">
            <thead>
              <tr>
                {cols.map(([, h]) => <th key={h}>{h}</th>)}
                <th>Specs</th>
                {advanced && <><th>Interm. Date</th><th>Interm. Due</th><th>Major Date</th><th>Major Due</th></>}
                <th>Inspection Status</th>
              </tr>
              <tr>
                {cols.map(([key]) => (
                  <th key={key}>
                    <input placeholder="Search…" value={search[key] ?? ''}
                      onChange={(e) => { setSearch((s) => ({ ...s, [key]: e.target.value })); setPage(1); }} />
                  </th>
                ))}
                <th />{advanced && <><th /><th /><th /><th /></>}<th />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.companyName ?? '—'}</td>
                  <td>{r.unitName}</td>
                  <td>{CATEGORY_LABELS[r.category]}</td>
                  <td>{r.typeName}</td>
                  <td>{r.partName ?? ''}</td>
                  <td>{r.componentName ?? ''}</td>
                  <td>{r.componentDescription}</td>
                  <td>{r.oem}</td>
                  <td>{r.serialNumber}</td>
                  {advanced && <>
                    <td>{r.partNumber}</td>
                    <td>{WORKING_STATUS_LABELS[r.workingStatus]}</td>
                    <td>{r.inspectionCompany}</td>
                    <td>{APPROVE_STATUS_LABELS[r.approveStatus]}</td>
                  </>}
                  <td><SpecsPopover record={r} /></td>
                  {advanced && <>
                    <td>{r.intermediateDate ?? ''}</td><td>{r.intermediateDueDate ?? ''}</td>
                    <td>{r.majorDate ?? ''}</td><td>{r.majorDueDate ?? ''}</td>
                  </>}
                  <td><RagChip status={recordCompliance(r, today)} /></td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={20} style={{ textAlign: 'center', color: 'var(--dim)' }}>No matching records</td></tr>
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
