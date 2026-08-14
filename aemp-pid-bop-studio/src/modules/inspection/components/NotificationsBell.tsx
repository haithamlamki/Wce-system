// ============================================================================
//  Compliance alert bell.
//
//  Previously this fetched EVERY inspection record every 5 minutes and derived
//  alerts in JavaScript — roughly 1.8 MB and 7 round trips, repeated forever in
//  the background on every page. It now calls insp_notification_summary
//  (migration 0036), which returns counts plus only the alerts actually shown.
//
//  Polling also pauses while the tab is hidden and refreshes on return, so a
//  backgrounded tab costs nothing.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotificationSummary } from '../lib/records';
import { useInspection } from '../state/InspectionContext';
import { formatDate } from '../lib/format';
import Icon from './Icon';

const REFRESH_MS = 5 * 60_000;

interface AlertRow {
  id: string; serial: string; equipment: string;
  kind: 'intermediate' | 'major'; dueDate: string; days: number;
}
interface CertRow { id: string; fileName: string; dueDate: string; days: number }

interface Summary {
  overdue: number; dueSoon: number;
  certOverdue: number; certDueSoon: number;
  items: AlertRow[]; certItems: CertRow[];
}

const EMPTY: Summary = {
  overdue: 0, dueSoon: 0, certOverdue: 0, certDueSoon: 0, items: [], certItems: [],
};

export default function NotificationsBell() {
  const { canAccess } = useInspection();
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!canAccess) return;
    try {
      const raw = await fetchNotificationSummary();
      setSummary({ ...EMPTY, ...(raw as unknown as Summary) });
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => { void load(); }, REFRESH_MS);
    };
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { void load(); start(); }
    };

    void load();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [canAccess, load]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!canAccess) return null;

  const total = summary.overdue + summary.dueSoon + summary.certOverdue + summary.certDueSoon;

  return (
    <div ref={wrapRef} className="insp-rel">
      <button type="button" className="insp-iconbtn" onClick={() => setOpen((v) => !v)}
        title="Compliance alerts" aria-expanded={open}
        aria-label={`${total} compliance alerts`}>
        <Icon name="bell" />
        {total > 0 && (
          <span className="insp-badge-dot">{total > 99 ? '99+' : total}</span>
        )}
      </button>

      {open && (
        <div className="insp-bell-panel">
          <div className="item" style={{ fontWeight: 700 }}>
            Compliance alerts — {summary.overdue} overdue, {summary.dueSoon} due soon
          </div>
          {err && <div className="item" style={{ color: 'var(--i-danger)' }}>{err}</div>}
          {total === 0 && !err && <div className="item">Nothing due in the next 30 days.</div>}

          {summary.items.map((a) => (
            <div className="item" key={`${a.id}-${a.kind}`}>
              <span className={`insp-badge ${a.days < 0 ? 'danger' : 'warning'}`}>
                {a.days < 0 ? 'Overdue' : 'Due Soon'}
              </span>{' '}
              {a.serial || a.equipment} — {a.kind === 'major' ? 'Major' : 'Intermediate'}
              <div style={{ color: 'var(--i-muted)', fontSize: 11 }}>
                Due {formatDate(a.dueDate)} ({a.days} days)
              </div>
            </div>
          ))}

          {summary.certItems.map((c) => (
            <div className="item" key={c.id}>
              <span className={`insp-badge ${c.days < 0 ? 'danger' : 'warning'}`}>
                {c.days < 0 ? 'Expired' : 'Expiring'}
              </span>{' '}
              {c.fileName}
              <div style={{ color: 'var(--i-muted)', fontSize: 11 }}>
                Expires {formatDate(c.dueDate)} ({c.days} days)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
