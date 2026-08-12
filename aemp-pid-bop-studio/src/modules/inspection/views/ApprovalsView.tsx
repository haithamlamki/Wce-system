// ============================================================================
//  Pending Approval queue (guide §5.10) — records whose status is
//  pending_approval and whose submitter chose YOU as approver (privileged
//  users see every pending record). Approve All / Approve Selected / Reject.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../state/AuthContext';
import { useInspection } from '../state/InspectionContext';
import { fetchRecords, setApproval } from '../lib/records';
import { isPrivileged } from '../lib/permissions';
import { CATEGORY_LABELS, type InspectionRecord } from '../types';
import LogsDrawer from '../components/LogsDrawer';
import { EmptyState } from '../InspectionModule';

export default function ApprovalsView() {
  const { session, role } = useAuth();
  const { can } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [logsFor, setLogsFor] = useState<InspectionRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setLoading(true);
    fetchRecords().then((r) => { setRows(r); setLoading(false); })
      .catch((e) => { setErr((e as Error).message); setLoading(false); });
  };
  useEffect(reload, []);

  const pending = useMemo(() => rows.filter((r) =>
    r.approveStatus === 'pending_approval'
    && (isPrivileged(role) || r.approverId === session?.user.id)), [rows, role, session]);

  const act = async (ids: string[], approve: boolean) => {
    if (ids.length === 0) { alert('Nothing selected.'); return; }
    const reason = approve ? undefined : (prompt('Reject reason (optional)') ?? undefined);
    setBusy(true);
    try {
      const n = await setApproval(ids, approve, reason);
      alert(`${approve ? 'Approved' : 'Rejected'} ${n} record(s).`);
      setSelected(new Set()); reload();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!can('insp_approve')) {
    return <EmptyState ico="⚿" title="Approval permission required"
      desc="Ask your administrator for the insp_approve permission." />;
  }
  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading your approval queue…" />;
  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Pending Approval</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>
          Records waiting for your sign-off. Open the history before approving if you want to see what changed.
        </span>
        <div style={{ flex: 1 }} />
        <button className="insp-btn primary" disabled={busy || pending.length === 0}
          onClick={() => act(pending.map((r) => r.id), true)}>✓ Approve All ({pending.length})</button>
        <button className="insp-btn" disabled={busy || selected.size === 0}
          onClick={() => act([...selected], true)}>✓ Approve Selected ({selected.size})</button>
        <button className="insp-btn" disabled={busy || selected.size === 0}
          onClick={() => act([...selected], false)}>✗ Reject Selected</button>
      </div>

      <div className="insp-table-wrap">
        <table className="insp-table" style={{ minWidth: 900 }}>
          <thead><tr>
            <th><input type="checkbox"
              checked={pending.length > 0 && pending.every((r) => selected.has(r.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((r) => r.id)) : new Set())} /></th>
            <th>Unit</th><th>Category</th><th>Equipment</th><th>Part</th>
            <th>Serial Number</th><th>OEM</th><th>Interm. Due</th><th>Major Due</th><th>History</th>
          </tr></thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selected.has(r.id)}
                  onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
                <td>{r.unitName}</td><td>{CATEGORY_LABELS[r.category]}</td>
                <td>{r.typeName}</td><td>{r.partName ?? ''}</td>
                <td>{r.serialNumber}</td><td>{r.oem}</td>
                <td>{r.intermediateDueDate ?? ''}</td><td>{r.majorDueDate ?? ''}</td>
                <td><button className="insp-btn" style={{ padding: '2px 8px' }}
                  onClick={() => setLogsFor(r)}>🗒</button></td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--dim)' }}>
                Nothing waiting for your approval. ✅
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {logsFor && <LogsDrawer record={logsFor} onClose={() => setLogsFor(null)} />}
    </div>
  );
}
