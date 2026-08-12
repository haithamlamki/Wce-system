// ============================================================================
//  Data Display — records of one category: equipment dropdown + part chips,
//  row selection, bulk inspection-date update, approve/reject, exports.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { bulkUpdateDates, fetchRecords, setApproval } from '../lib/records';
import { applyColumnSearch, paginate } from '../lib/filters';
import { recordCompliance } from '../lib/compliance';
import { downloadCsv, recordsToCsv } from '../lib/exportCsv';
import { APPROVE_STATUS_LABELS, WORKING_STATUS_LABELS, frequencyLabel,
  type InspCategory, type InspectionRecord } from '../types';
import SpecsPopover from '../components/SpecsPopover';
import { RagChip } from './RegisterView';
import { EmptyState } from '../InspectionModule';

export default function DataDisplayTab({ category }: { category: InspCategory }) {
  const { can, types, parts } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string>('');
  const [partSel, setPartSel] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [bulkMajor, setBulkMajor] = useState('');
  const [bulkInter, setBulkInter] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const catTypes = useMemo(() => types.filter((t) => t.category === category), [types, category]);
  const typeParts = useMemo(() => parts.filter((p) => p.typeId === typeId), [parts, typeId]);

  const reload = () => {
    setLoading(true);
    fetchRecords({ category })
      .then((r) => { setRows(r); setLoading(false); })
      .catch((e) => { setErr((e as Error).message); setLoading(false); });
  };
  useEffect(() => { reload(); setTypeId(''); setPartSel(new Set()); setSelected(new Set()); setPage(1); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category]);

  const filtered = useMemo(() => {
    let out = rows;
    if (typeId) out = out.filter((r) => r.typeId === typeId);
    if (partSel.size) out = out.filter((r) => r.partId !== null && partSel.has(r.partId));
    return applyColumnSearch(out, search);
  }, [rows, typeId, partSel, search]);

  const { pageRows, total, pages } = paginate(filtered, page, perPage);
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allChecked) pageRows.forEach((r) => n.delete(r.id));
    else pageRows.forEach((r) => n.add(r.id));
    return n;
  });

  const applyBulkDates = async () => {
    if (selected.size === 0) { alert('Select rows first.'); return; }
    if (!bulkMajor && !bulkInter) { alert('Pick a major and/or intermediate date.'); return; }
    setBusy(true);
    try {
      const n = await bulkUpdateDates([...selected], bulkMajor || null, bulkInter || null);
      alert(`Updated ${n} record(s).`);
      setSelected(new Set()); reload();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const doApproval = async (approve: boolean) => {
    if (selected.size === 0) { alert('Select rows first.'); return; }
    const reason = approve ? undefined : (prompt('Reject reason (optional)') ?? undefined);
    setBusy(true);
    try {
      const n = await setApproval([...selected], approve, reason);
      alert(`${approve ? 'Approved' : 'Rejected'} ${n} record(s).`);
      setSelected(new Set()); reload();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading records…" />;
  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <button className="insp-btn primary"
          onClick={() => downloadCsv(recordsToCsv(filtered), 'inspection-data.csv')}>⭳ Export Data</button>
        <button className="insp-btn" disabled={selected.size === 0}
          onClick={() => downloadCsv(recordsToCsv(filtered.filter((r) => selected.has(r.id))), 'inspection-selected.csv')}>
          ⭳ Export Selected ({selected.size})
        </button>
        {can('insp_approve') && (<>
          <button className="insp-btn" disabled={busy || selected.size === 0} onClick={() => doApproval(true)}>✓ Approve</button>
          <button className="insp-btn" disabled={busy || selected.size === 0} onClick={() => doApproval(false)}>✗ Reject</button>
        </>)}
      </div>

      <div className="insp-toolbar insp-card">
        <div className="insp-field">
          <label>Equipment</label>
          <select value={typeId} onChange={(e) => { setTypeId(e.target.value); setPartSel(new Set()); setPage(1); }}>
            <option value="">All equipment</option>
            {catTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="insp-field" style={{ flex: 1 }}>
          <label>Equipment Part</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {typeParts.length === 0 && <span style={{ color: 'var(--dim)', fontSize: 12 }}>Select an equipment type</span>}
            {typeParts.map((p) => (
              <button key={p.id} className="insp-btn"
                style={partSel.has(p.id) ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
                onClick={() => { setPartSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); setPage(1); }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {can('insp_data_entry') && (
        <div className="insp-toolbar insp-card">
          <b style={{ fontSize: 12.5 }}>Bulk Update Inspection Dates</b>
          <span style={{ color: 'var(--dim)', fontSize: 11.5 }}>Select rows, then apply dates to all of them.</span>
          <div className="insp-field"><label>Major Inspection Date</label>
            <input type="date" value={bulkMajor} onChange={(e) => setBulkMajor(e.target.value)} /></div>
          <div className="insp-field"><label>Intermediate Inspection Date</label>
            <input type="date" value={bulkInter} onChange={(e) => setBulkInter(e.target.value)} /></div>
          <button className="insp-btn primary" disabled={busy} onClick={applyBulkDates}>🗓 Update Dates</button>
        </div>
      )}

      <div className="insp-table-wrap">
        <table className="insp-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              <th>Unit</th><th>Equipment</th><th>Part</th><th>Component</th><th>OEM</th>
              <th>Working Status</th><th>Serial Number</th><th>Part Number</th>
              <th>Inspection Company</th>
              <th>Interm. Date</th><th>Interm. Due</th><th>Interm. Freq</th>
              <th>Major Date</th><th>Major Due</th><th>Major Freq</th>
              <th>Year</th><th>Remarks</th><th>Specs</th><th>Approve Status</th><th>RAG</th>
            </tr>
            <tr>
              <th />
              {(['unit','equipment','part','component','oem','status','serial','partNumber','inspectionCompany'] as const).map((k) => (
                <th key={k}><input placeholder="Search…" value={search[k] ?? ''}
                  onChange={(e) => { setSearch((s) => ({ ...s, [k]: e.target.value })); setPage(1); }} /></th>
              ))}
              <th /><th /><th /><th /><th /><th /><th /><th /><th />
              <th><input placeholder="Search…" value={search.approveStatus ?? ''}
                onChange={(e) => { setSearch((s) => ({ ...s, approveStatus: e.target.value })); setPage(1); }} /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selected.has(r.id)}
                  onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
                <td>{r.unitName}</td><td>{r.typeName}</td><td>{r.partName ?? ''}</td>
                <td>{r.componentName ?? ''}</td><td>{r.oem}</td>
                <td>{WORKING_STATUS_LABELS[r.workingStatus]}</td>
                <td>{r.serialNumber}</td><td>{r.partNumber}</td><td>{r.inspectionCompany}</td>
                <td>{r.intermediateDate ?? ''}</td><td>{r.intermediateDueDate ?? ''}</td>
                <td>{r.intermediateFreqMonths ? frequencyLabel(r.intermediateFreqMonths) : ''}</td>
                <td>{r.majorDate ?? ''}</td><td>{r.majorDueDate ?? ''}</td>
                <td>{r.majorFreqMonths ? frequencyLabel(r.majorFreqMonths) : ''}</td>
                <td>{r.manufactureYear ?? ''}</td><td>{r.remarks}</td>
                <td><SpecsPopover record={r} /></td>
                <td>{APPROVE_STATUS_LABELS[r.approveStatus]}</td>
                <td><RagChip status={recordCompliance(r, today)} /></td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={21} style={{ textAlign: 'center', color: 'var(--dim)' }}>No records for this filter</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="insp-toolbar" style={{ marginTop: 10 }}>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span style={{ fontSize: 12 }}>Page {page} / {pages} · {total} entries</span>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage(pages)}>Last</button>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
          {[10, 25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>
    </div>
  );
}
