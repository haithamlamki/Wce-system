// ============================================================================
//  Dashboard — replicates the reference landing page (see
//  docs/inspection-reference-parity.md §5): a KPI row followed by four
//  analytic sections. Metrics are aggregated BY POSTGRES via insp_dashboard
//  (migration 0036) — this page transfers a few kB of JSON and no record rows.
//  RAG status is always computed from due dates, never stored.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../state/AuthContext';
import { Card, EmptyState, LoadingState, PageHeader, SectionTitle } from '../components/ui';
import Chart from '../components/Chart';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { fetchDashboard } from '../lib/records';
import { frequencyLabel } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Split = Record<'compliant' | 'dueSoon' | 'overdue', number>;

/** Shape returned by the insp_dashboard RPC (migration 0036). */
interface SplitRow extends Split { label: string }
interface DashboardStats {
  total: number; scheduled: number; overdue: number; dueSoon: number; compliant: number;
  obligations: number; worstOverdueDays: number;
  aging: Record<string, number>;
  forecast: Record<string, number>;
  rigCompliance: { label: string; value: number }[];
  byCategory: SplitRow[]; byRig: SplitRow[]; byStatus: SplitRow[];
  kind: { label: string; total: number; overdue: number }[];
  frequency: { months: number; onTrack: number; overdue: number; total: number }[];
  ageBuckets: Record<string, number>;
  avgAge: number;
  oemTop: { label: string; value: number }[];
  oemCount: number;
  trend: { month: string; intermediate: number; major: number }[];
  pending: number; approved: number;
  avgApprovalDays: number | null; approvedLast30: number;
  quality: Record<string, number>;
}

const SPLIT_COLORS: Record<keyof Split, string> = {
  compliant: '--i-success', dueSoon: '--i-warning', overdue: '--i-danger',
};

function Kpi({ label, value, caption, tone, ico }: {
  label: string; value: string; caption?: string; tone?: 'danger' | 'warning'; ico?: IconName;
}) {
  return (
    <div className="insp-kpi">
      <div>
        <div className="lbl">{label}</div>
        <div className={`num${tone ? ` ${tone}` : ''}`}>{value}</div>
        {caption && <div className="cap">{caption}</div>}
      </div>
      {ico && <div className="kico"><Icon name={ico} /></div>}
    </div>
  );
}

function Gauge({ pct }: { pct: number }) {
  const tone = pct < 50 ? '--i-danger' : pct < 80 ? '--i-warning' : '--i-success';
  const word = pct < 50 ? 'Critical' : pct < 80 ? 'At risk' : 'Healthy';
  return (
    <Chart
      type="doughnut" height={230}
      labels={['Compliant', 'Not compliant']}
      series={[{
        label: 'Compliance', data: [pct, 100 - pct], color: tone,
        sliceColors: [tone, '--i-surface-2'],
      }]}
      centerText={{ value: String(pct), caption: word }}
    />
  );
}


export default function DashboardView() {
  const { fullName } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dist, setDist] = useState<'Category' | 'Rig' | 'Status'>('Category');


  // Metrics come from insp_dashboard (migration 0036): Postgres aggregates and
  // returns a few kB of JSON. This page no longer downloads any record rows.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await fetchDashboard();
        if (alive) setStats(raw as unknown as DashboardStats);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Reshapes the RPC payload into the structure the charts below already use,
  // so the presentation is unchanged by moving aggregation into the database.
  const m = useMemo(() => {
    if (!stats) return null;
    const toMap = (arr: SplitRow[] = []) => new Map<string, Split>(
      arr.map((r) => [r.label, { compliant: r.compliant, dueSoon: r.dueSoon, overdue: r.overdue }]),
    );
    const scheduled = stats.scheduled ?? 0;
    return {
      total: stats.total ?? 0,
      scheduled,
      overdue: stats.overdue ?? 0,
      dueSoon: stats.dueSoon ?? 0,
      compliant: stats.compliant ?? 0,
      obligations: stats.obligations ?? 0,
      worstOverdueDays: stats.worstOverdueDays ?? 0,
      score: scheduled ? Math.round(((stats.compliant ?? 0) / scheduled) * 100) : 0,
      coverage: stats.total ? Math.round((scheduled / stats.total) * 100) : 0,
      aging: stats.aging ?? {},
      forecast: stats.forecast ?? {},
      rigCompliance: (stats.rigCompliance ?? []).map((r) => ({ ...r, caption: `${r.value}%` })),
      byCat: toMap(stats.byCategory),
      byRig: toMap(stats.byRig),
      byStatus: toMap(stats.byStatus),
      kind: stats.kind ?? [],
      freqRows: (stats.frequency ?? []).map((f) => ({
        label: frequencyLabel(f.months), onTrack: f.onTrack, overdue: f.overdue,
      })),
      ageBuckets: stats.ageBuckets ?? {},
      avgAge: String(stats.avgAge ?? 0),
      oemRows: stats.oemTop ?? [],
      oemCount: stats.oemCount ?? 0,
      trend: (stats.trend ?? []).map((t) => {
        const [y, mo] = t.month.split('-').map(Number);
        return { label: `${MONTHS[mo - 1]} ${String(y).slice(2)}`, intermediate: t.intermediate, major: t.major };
      }),
      pending: stats.pending ?? 0,
      approved: stats.approved ?? 0,
      avgApprovalDays: stats.avgApprovalDays ?? null,
      approvedLast30: stats.approvedLast30 ?? 0,
      hasApprovalTiming: stats.avgApprovalDays != null,
      quality: Object.entries(stats.quality ?? {}).map(([label, value]) => ({ label, value })),
      complete: (() => {
        const missing = Object.values(stats.quality ?? {}).reduce((a, b) => a + b, 0);
        const fields = (stats.total ?? 0) * Object.keys(stats.quality ?? {}).length;
        return fields ? Math.round(((fields - missing) / fields) * 100) : 100;
      })(),
    };
  }, [stats]);

  if (loading || !m) return <LoadingState label="Loading dashboard…" />;


  const distRows = (dist === 'Category' ? m.byCat : dist === 'Rig' ? m.byRig : m.byStatus);
  const distList = [...distRows.entries()]
    .sort((a, b) => (b[1].compliant + b[1].dueSoon + b[1].overdue) - (a[1].compliant + a[1].dueSoon + a[1].overdue))
    .slice(0, 12)
    .map(([label, split]) => ({ label, split }));

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${fullName || 'there'}.`} />

      {error && (
        <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>
          Could not load inspection records: {error}
        </div>
      )}

      <div className="insp-kpis">
        <Kpi label="Compliance Score" value={`${m.score}%`} ico="kpi-compliance"
          caption={`${m.compliant}/${m.scheduled} scheduled`} />
        <Kpi label="Overdue" value={String(m.overdue)} tone="danger" ico="kpi-overdue"
          caption={m.worstOverdueDays ? `worst ${m.worstOverdueDays}d` : undefined} />
        <Kpi label="Due next 30" value={String(m.dueSoon)} tone="warning" ico="kpi-due" />
        <Kpi label="Coverage" value={`${m.coverage}%`} ico="kpi-coverage"
          caption={`${m.obligations} obligations`} />
        <Kpi label="Avg approval" ico="kpi-approval"
          value={m.avgApprovalDays === null ? '—' : m.avgApprovalDays.toFixed(1)}
          caption={m.hasApprovalTiming ? 'days' : 'days · not yet recorded'} />
      </div>

      <SectionTitle>Compliance &amp; Risk</SectionTitle>
      <div className="insp-grid-2">
        <Card title="Compliance Score"><Gauge pct={m.score} /></Card>
        <Card title="Overdue Aging">
          <Chart type="bar"
            labels={Object.keys(m.aging)}
            series={[{ label: 'Overdue', data: Object.values(m.aging), color: '--i-danger' }]} />
        </Card>
        <Card title="Compliance by Rig">
          {m.rigCompliance.length ? (
            <Chart type="bar" horizontal height={Math.max(220, m.rigCompliance.length * 24)}
              labels={m.rigCompliance.map((r) => r.label)}
              series={[{ label: '% compliant', data: m.rigCompliance.map((r) => r.value), color: '--i-danger' }]} />
          ) : <EmptyState title="No rig data" />}
        </Card>
        <Card title="Distribution" extra={
          <span className="insp-segmented">
            {(['Category', 'Rig', 'Status'] as const).map((k) => (
              <button key={k} type="button" className={dist === k ? 'active' : ''}
                onClick={() => setDist(k)}>{k}</button>
            ))}
          </span>
        }>
          <Chart type="bar" stacked showLegend height={Math.max(240, distList.length * 26)}
            labels={distList.map((d) => d.label)}
            series={[
              { label: 'compliant', data: distList.map((d) => d.split.compliant), color: SPLIT_COLORS.compliant },
              { label: 'dueSoon', data: distList.map((d) => d.split.dueSoon), color: SPLIT_COLORS.dueSoon },
              { label: 'overdue', data: distList.map((d) => d.split.overdue), color: SPLIT_COLORS.overdue },
            ]} />
        </Card>
      </div>

      <SectionTitle>Planning &amp; Behaviour</SectionTitle>
      <div className="insp-grid-3">
        <Card title="Due Forecast">
          <Chart type="bar"
            labels={Object.keys(m.forecast)}
            series={[{ label: 'Due', data: Object.values(m.forecast), color: '--i-brand' }]} />
        </Card>
        <Card title="Inspection Kind">
          <Chart type="bar" showLegend
            labels={m.kind.map((k) => k.label)}
            series={[
              { label: 'total', data: m.kind.map((k) => k.total), color: '--i-brand' },
              { label: 'overdue', data: m.kind.map((k) => k.overdue), color: '--i-danger' },
            ]} />
        </Card>
        <Card title="Frequency Mix">
          <Chart type="bar" showLegend
            labels={m.freqRows.map((f) => f.label)}
            series={[
              { label: 'onTrack', data: m.freqRows.map((f) => f.onTrack), color: '--i-success' },
              { label: 'overdue', data: m.freqRows.map((f) => f.overdue), color: '--i-danger' },
            ]} />
        </Card>
      </div>

      <SectionTitle>Fleet &amp; Assets</SectionTitle>
      <div className="insp-grid-3">
        <Card title={`Equipment Age · avg ${m.avgAge} yrs`}>
          <Chart type="bar"
            labels={Object.keys(m.ageBuckets)}
            series={[{ label: 'Records', data: Object.values(m.ageBuckets), color: '--i-brand' }]} />
        </Card>
        <Card title={`OEM Concentration · ${m.oemCount} distinct OEMs`}>
          <Chart type="bar" horizontal height={Math.max(220, m.oemRows.length * 24)}
            labels={m.oemRows.map((o) => o.label)}
            series={[{ label: 'Records', data: m.oemRows.map((o) => o.value), color: '--i-brand' }]} />
        </Card>
        <Card title="Activity Trend">
          <Chart type="line" showLegend
            labels={m.trend.map((t) => t.label)}
            series={[
              { label: 'intermediate', data: m.trend.map((t) => t.intermediate), color: '--i-info' },
              { label: 'major', data: m.trend.map((t) => t.major), color: '--i-brand' },
            ]} />
        </Card>
      </div>

      <SectionTitle>Process &amp; Governance</SectionTitle>
      <div className="insp-grid-2">
        <Card title="Approval Health">
          <div className="insp-kpis" style={{ marginBottom: 10 }}>
            <Kpi label="Pending" value={String(m.pending)} />
            <Kpi label="Avg approval" caption="days"
              value={m.avgApprovalDays === null ? '—' : m.avgApprovalDays.toFixed(1)} />
            <Kpi label="Approved 30d" value={m.hasApprovalTiming ? String(m.approvedLast30) : '—'} />
          </div>
          <Chart type="bar" height={180}
            labels={['Approved', 'Pending Approval']}
            series={[{ label: 'Records', data: [m.approved, m.pending], color: '--i-brand' }]} />
        </Card>
        <Card title={`Data Quality · ${m.complete}% complete`}>
          <Chart type="bar"
            labels={m.quality.map((q) => q.label)}
            series={[{ label: 'missing', data: m.quality.map((q) => q.value), color: '--i-warning' }]} />
          <div className="insp-legend"><span>missing values per field</span></div>
        </Card>
      </div>
    </>
  );
}
