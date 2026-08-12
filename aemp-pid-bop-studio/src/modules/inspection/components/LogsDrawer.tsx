// ============================================================================
//  LogsDrawer — the record's history of changes (guide §5.9): who, when, what,
//  with per-field "old value → new value" rows. Newest first.
// ============================================================================
import { useEffect, useState } from 'react';
import { fetchRecordLogs, type InspRecordLog } from '../lib/records';
import { formatChanges } from '../lib/logsFormat';
import { useInspection } from '../state/InspectionContext';
import type { InspectionRecord } from '../types';

const ACTION_LABELS = { created: 'Created', updated: 'Updated', deleted: 'Deleted' } as const;

export default function LogsDrawer({ record, onClose }: {
  record: InspectionRecord; onClose: () => void;
}) {
  const { approvers } = useInspection();
  const [logs, setLogs] = useState<InspRecordLog[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    fetchRecordLogs(record.id).then(setLogs).catch((e) => setErr((e as Error).message));
  }, [record.id]);

  const nameOf = (id: string | null) =>
    id ? (approvers.find((a) => a.id === id)?.name ?? id.slice(0, 8)) : 'system';

  return (
    <div className="insp-drawer" role="dialog" aria-label="Record history">
      <div className="insp-toolbar">
        <b>History — {record.serialNumber || record.typeName}</b>
        <div style={{ flex: 1 }} />
        <button className="insp-btn" onClick={onClose}>✕ Close</button>
      </div>

      {err && <div style={{ color: '#d33', fontSize: 12 }}>{err}</div>}
      {logs === null && !err && <div style={{ color: 'var(--dim)', fontSize: 12.5 }}>Loading history…</div>}
      {logs?.length === 0 && <div style={{ color: 'var(--dim)', fontSize: 12.5 }}>No changes recorded yet.</div>}

      {logs?.map((l) => (
        <div key={l.id} className="insp-card" style={{ marginBottom: 8, padding: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
            <span className={`insp-rag ${l.action === 'deleted' ? 'overdue' : l.action === 'created' ? 'compliant' : 'due_soon'}`}>
              {ACTION_LABELS[l.action]}
            </span>
            <b>{nameOf(l.actor)}</b>
            <span style={{ color: 'var(--dim)', fontSize: 11.5 }}>
              {new Date(l.createdAt).toLocaleString()}
            </span>
            <div style={{ flex: 1 }} />
            <button className="insp-btn" style={{ padding: '2px 8px' }}
              onClick={() => setOpenId(openId === l.id ? null : l.id)}>
              {openId === l.id ? 'Hide' : 'View Changes'}
            </button>
          </div>
          {openId === l.id && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {formatChanges(l.changes).map((c) => (
                <div key={c.field} style={{ padding: '3px 0', borderBottom: '1px solid var(--line2)' }}>
                  <span style={{ color: 'var(--dim)' }}>{c.field}:</span>{' '}
                  {c.from} <span style={{ color: 'var(--accent)' }}>→</span> <b>{c.to}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
