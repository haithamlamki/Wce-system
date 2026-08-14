// ============================================================================
//  Notification bell — overdue / due-soon inspections and expiring
//  certificates, computed client-side from RLS-scoped data (Task 5 lib).
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { buildAlerts, type AlertItem } from '../lib/compliance';
import { DASHBOARD_COLUMNS, fetchRecords } from '../lib/records';
import { listExpiringFiles } from '../lib/files';
import { useInspection } from '../state/InspectionContext';
import { formatDate } from '../lib/format';
import Icon from './Icon';

const REFRESH_MS = 5 * 60_000;

export default function NotificationsBell() {
  const { canAccess } = useInspection();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    const load = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        // Narrow column set: the bell refreshes on an interval and only needs
        // serial + due dates, not the jsonb specs payload.
        const [records, files] = await Promise.all([
          fetchRecords({ columns: DASHBOARD_COLUMNS }), listExpiringFiles(),
        ]);
        if (alive) setAlerts(buildAlerts(records, files, today));
      } catch { /* bell is best-effort; views surface real errors */ }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [canAccess]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!canAccess) return null;
  const overdue = alerts.filter((a) => a.severity === 'overdue').length;

  return (
    <div ref={wrapRef} className="insp-rel">
      <button type="button" className="insp-iconbtn" onClick={() => setOpen((v) => !v)}
        title="Compliance alerts" aria-label={`${alerts.length} compliance alerts`}
        aria-expanded={open}>
        <Icon name="bell" />
        {alerts.length > 0 && (
          <span className="insp-badge-dot">{alerts.length > 99 ? '99+' : alerts.length}</span>
        )}
      </button>
      {open && (
        <div className="insp-bell-panel">
          <div className="item" style={{ fontWeight: 700 }}>
            Compliance alerts — {overdue} overdue, {alerts.length - overdue} due soon
          </div>
          {alerts.slice(0, 60).map((a) => (
            <div className="item" key={a.id}>
              <span className={`insp-badge ${a.severity === 'overdue' ? 'danger' : 'warning'}`}>
                {a.severity === 'overdue' ? 'Overdue' : 'Due Soon'}
              </span>{' '}
              {a.label}
              <div style={{ color: 'var(--i-muted)', fontSize: 11 }}>
                {a.kind === 'certificate' ? 'Expires' : 'Due'} {formatDate(a.dueDate)} ({a.daysUntil} days)
              </div>
            </div>
          ))}
          {alerts.length === 0 && <div className="item">All clear — nothing overdue or due soon. ✅</div>}
        </div>
      )}
    </div>
  );
}
