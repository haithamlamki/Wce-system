// ============================================================================
//  Inspection Metrics — KPI cards + Chart.js charts + upcoming inspections.
//  All aggregation is client-side over the RLS-filtered record set.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useInspection } from '../state/InspectionContext';
import { fetchRecords } from '../lib/records';
import { complianceStatus, daysUntil, recordCompliance } from '../lib/compliance';
import { CATEGORY_LABELS, WORKING_STATUS_LABELS, type InspectionRecord } from '../types';
import { EmptyState } from '../InspectionModule';

Chart.register(...registerables);

const PALETTE = ['#2f6fd6', '#2e9e5b', '#e0a52e', '#d64545', '#8a5bd6',
  '#3aa7a0', '#d6609a', '#e07b39', '#6bab48', '#5b74d6'];

function ChartCanvas({ kind, labels, data, title }: {
  kind: 'doughnut' | 'bar' | 'line'; labels: string[]; data: number[]; title: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, {
      type: kind,
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderColor: PALETTE[0],
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: kind === 'doughnut', position: 'right' }, title: { display: false } },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, labels.join('|'), data.join('|')]);
  return (
    <div className="insp-card" style={{ height: 280 }}>
      <b style={{ fontSize: 12.5 }}>{title}</b>
      <div style={{ height: 230 }}><canvas ref={ref} /></div>
    </div>
  );
}

function countBy<T>(rows: T[], key: (r: T) => string): [string[], number[]] {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return [sorted.map(([k]) => k), sorted.map(([, v]) => v)];
}

export default function MetricsView() {
  const { units } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [unitId, setUnitId] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetchRecords().then((r) => { setRows(r); setLoading(false); })
      .catch((e) => { setErr((e as Error).message); setLoading(false); });
  }, []);

  const scoped = useMemo(() => unitId ? rows.filter((r) => r.unitId === unitId) : rows, [rows, unitId]);

  const kpis = useMemo(() => ({
    total: scoped.length,
    approved: scoped.filter((r) => r.approveStatus === 'approved').length,
    pending: scoped.filter((r) => r.approveStatus === 'pending_approval').length,
    overdue: scoped.filter((r) => recordCompliance(r, today) === 'overdue').length,
  }), [scoped, today]);

  const [typeLabels, typeData] = useMemo(() => {
    const [l, d] = countBy(scoped, (r) => r.typeName);
    return [l.slice(0, 10), d.slice(0, 10)];
  }, [scoped]);
  const [statusLabels, statusData] = useMemo(
    () => countBy(scoped, (r) => WORKING_STATUS_LABELS[r.workingStatus]), [scoped]);
  const [catLabels, catData] = useMemo(
    () => countBy(scoped, (r) => CATEGORY_LABELS[r.category]), [scoped]);
  const [unitLabels, unitData] = useMemo(() => countBy(scoped, (r) => r.unitName), [scoped]);
  const [companyLabels, companyData] = useMemo(
    () => countBy(scoped, (r) => r.companyName ?? 'Unassigned'), [scoped]);
  const [monthLabels, monthData] = useMemo(() => {
    const m = new Map<string, number>();
    scoped.forEach((r) => {
      [r.intermediateDate, r.majorDate].forEach((d) => {
        if (d) { const k = d.slice(0, 7); m.set(k, (m.get(k) ?? 0) + 1); }
      });
    });
    const keys = [...m.keys()].sort().slice(-12);
    return [keys, keys.map((k) => m.get(k) ?? 0)] as [string[], number[]];
  }, [scoped]);

  const upcoming = useMemo(() => {
    const items: { r: InspectionRecord; type: 'Intermediate' | 'Major'; due: string; days: number }[] = [];
    scoped.forEach((r) => {
      (['Intermediate', 'Major'] as const).forEach((t) => {
        const due = t === 'Intermediate' ? r.intermediateDueDate : r.majorDueDate;
        if (!due) return;
        const st = complianceStatus(due, today);
        if (st === 'overdue' || st === 'due_soon') {
          items.push({ r, type: t, due, days: daysUntil(due, today) ?? 0 });
        }
      });
    });
    return items.sort((a, b) => a.days - b.days).slice(0, 50);
  }, [scoped, today]);

  if (loading) return <EmptyState ico="◌" title="Loading" desc="Crunching inspection data…" />;
  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Equipment Inspection Metrics</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>Real-time insights and analytics for equipment inspection data</span>
        <div style={{ flex: 1 }} />
        <div className="insp-field"><label>Filter by Unit</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">All Units</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
      </div>

      <div className="insp-kpis">
        <div className="insp-kpi"><div className="num">{kpis.total}</div><div className="lbl">Total Inspections</div></div>
        <div className="insp-kpi"><div className="num" style={{ color: 'var(--green)' }}>{kpis.approved}</div><div className="lbl">Approved</div></div>
        <div className="insp-kpi"><div className="num" style={{ color: '#b70' }}>{kpis.pending}</div><div className="lbl">Pending Approval</div></div>
        <div className="insp-kpi"><div className="num" style={{ color: '#d33' }}>{kpis.overdue}</div><div className="lbl">Overdue Inspections</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <ChartCanvas kind="doughnut" labels={typeLabels} data={typeData} title="Equipment Type Distribution" />
        <ChartCanvas kind="bar" labels={statusLabels} data={statusData} title="Status Distribution" />
        <ChartCanvas kind="bar" labels={catLabels} data={catData} title="By Category" />
        <ChartCanvas kind="bar" labels={unitLabels.slice(0, 15)} data={unitData.slice(0, 15)} title="Unit Distribution" />
        <ChartCanvas kind="line" labels={monthLabels} data={monthData} title="Monthly Inspection Trends" />
        <ChartCanvas kind="bar" labels={companyLabels} data={companyData} title="Company Distribution" />
      </div>

      <div className="insp-card" style={{ marginTop: 12 }}>
        <b style={{ fontSize: 12.5 }}>Upcoming Inspections (Next 30 Days)</b>
        <div className="insp-table-wrap" style={{ marginTop: 8 }}>
          <table className="insp-table" style={{ minWidth: 700 }}>
            <thead><tr>
              <th>Serial Number</th><th>Equipment Type</th><th>Unit</th>
              <th>Inspection Type</th><th>Due Date</th><th>Days Until Due</th>
            </tr></thead>
            <tbody>
              {upcoming.map((u, i) => (
                <tr key={`${u.r.id}-${u.type}-${i}`}>
                  <td>{u.r.serialNumber || '—'}</td><td>{u.r.typeName}</td><td>{u.r.unitName}</td>
                  <td>{u.type}</td><td>{u.due}</td>
                  <td style={{ color: u.days < 0 ? '#d33' : 'inherit', fontWeight: 700 }}>{u.days} days</td>
                </tr>
              ))}
              {upcoming.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--dim)' }}>Nothing due in the next 30 days 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
