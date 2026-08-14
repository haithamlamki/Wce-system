// ============================================================================
//  Dashboard — replicates the reference landing page (see
//  docs/inspection-reference-parity.md §5): a KPI row followed by four
//  analytic sections. Every figure is derived client-side from the records the
//  caller is allowed to read; RAG status is always computed, never stored.
//
//  Where our schema has no source column for one of the reference's figures
//  (approval turnaround needs an approved_at timestamp that insp_records does
//  not carry) the tile renders an em dash instead of inventing a number.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../state/AuthContext';
import { Card, EmptyState, LoadingState, PageHeader, SectionTitle } from '../components/ui';
import Chart from '../components/Chart';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { DASHBOARD_COLUMNS, fetchRecords } from '../lib/records';
import { complianceStatus, daysUntil, recordCompliance } from '../lib/compliance';
import type { ComplianceStatus } from '../lib/compliance';
import { CATEGORY_LABELS, frequencyLabel } from '../types';
import type { InspectionRecord } from '../types';

const TODAY = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Split = Record<'compliant' | 'dueSoon' | 'overdue', number>;

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

function emptySplit(): Split { return { compliant: 0, dueSoon: 0, overdue: 0 }; }

function addTo(map: Map<string, Split>, key: string, status: ComplianceStatus) {
  if (status === 'unknown') return;
  const s = map.get(key) ?? emptySplit();
  if (status === 'compliant') s.compliant += 1;
  else if (status === 'due_soon') s.dueSoon += 1;
  else s.overdue += 1;
  map.set(key, s);
}

export default function DashboardView() {
  const { fullName } = useAuth();
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dist, setDist] = useState<'Category' | 'Rig' | 'Status'>('Category');
  const today = TODAY();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await fetchRecords({ columns: DASHBOARD_COLUMNS });
        if (alive) setRecords(rows);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const m = useMemo(() => {
    const statuses = records.map((r) => recordCompliance(r, today));
    const scheduled = statuses.filter((s) => s !== 'unknown').length;
    const overdue = statuses.filter((s) => s === 'overdue').length;
    const dueSoon = statuses.filter((s) => s === 'due_soon').length;
    const compliant = statuses.filter((s) => s === 'compliant').length;
    const obligations = records.reduce(
      (n, r) => n + (r.intermediateDueDate ? 1 : 0) + (r.majorDueDate ? 1 : 0), 0,
    );

    // Overdue aging + due forecast, over every individual due date.
    const aging = { '1-30': 0, '31-60': 0, '60+': 0 };
    const forecast = { 'Next 30': 0, '31-60': 0, '61-90': 0 };
    let worstOverdueDays = 0;
    for (const r of records) {
      for (const due of [r.intermediateDueDate, r.majorDueDate]) {
        const d = daysUntil(due, today);
        if (d === null) continue;
        if (d < 0) {
          const late = -d;
          worstOverdueDays = Math.max(worstOverdueDays, late);
          if (late <= 30) aging['1-30'] += 1;
          else if (late <= 60) aging['31-60'] += 1;
          else aging['60+'] += 1;
        } else if (d <= 30) forecast['Next 30'] += 1;
        else if (d <= 60) forecast['31-60'] += 1;
        else if (d <= 90) forecast['61-90'] += 1;
      }
    }

    // Compliance by rig — percent compliant, ascending (worst first).
    const byRig = new Map<string, Split>();
    const byCat = new Map<string, Split>();
    const byStatus = new Map<string, Split>();
    records.forEach((r, i) => {
      const s = statuses[i];
      addTo(byRig, r.unitName, s);
      addTo(byCat, CATEGORY_LABELS[r.category], s);
      addTo(byStatus, r.approveStatus === 'approved' ? 'Approved' : 'Pending Approval', s);
    });
    const rigCompliance = [...byRig.entries()]
      .map(([label, s]) => {
        const total = s.compliant + s.dueSoon + s.overdue;
        return { label, value: total ? Math.round((s.compliant / total) * 100) : 0 };
      })
      .sort((a, b) => a.value - b.value)
      .slice(0, 20)
      .map((r) => ({ ...r, caption: `${r.value}%` }));

    // Inspection kind: total and overdue per kind.
    const kind = [
      {
        label: 'Intermediate',
        total: records.filter((r) => r.intermediateDueDate).length,
        overdue: records.filter((r) => complianceStatus(r.intermediateDueDate, today) === 'overdue').length,
      },
      {
        label: 'Major',
        total: records.filter((r) => r.majorDueDate).length,
        overdue: records.filter((r) => complianceStatus(r.majorDueDate, today) === 'overdue').length,
      },
    ];

    // Frequency mix: on-track vs overdue per distinct frequency.
    const freq = new Map<number, { onTrack: number; overdue: number }>();
    for (const r of records) {
      for (const [months, due] of [
        [r.intermediateFreqMonths, r.intermediateDueDate] as const,
        [r.majorFreqMonths, r.majorDueDate] as const,
      ]) {
        if (!months) continue;
        const cur = freq.get(months) ?? { onTrack: 0, overdue: 0 };
        if (complianceStatus(due, today) === 'overdue') cur.overdue += 1; else cur.onTrack += 1;
        freq.set(months, cur);
      }
    }
    const freqRows = [...freq.entries()]
      .sort((a, b) => (b[1].onTrack + b[1].overdue) - (a[1].onTrack + a[1].overdue))
      .map(([months, v]) => ({
        label: frequencyLabel(months),
        onTrack: v.onTrack,
        overdue: v.overdue,
      }));

    // Equipment age from manufacture year.
    const year = new Date().getUTCFullYear();
    const ageBuckets = { '0-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '20+': 0, Unknown: 0 };
    let ageSum = 0; let ageN = 0;
    for (const r of records) {
      if (!r.manufactureYear) { ageBuckets.Unknown += 1; continue; }
      const age = year - r.manufactureYear;
      ageSum += age; ageN += 1;
      if (age <= 5) ageBuckets['0-5'] += 1;
      else if (age <= 10) ageBuckets['6-10'] += 1;
      else if (age <= 15) ageBuckets['11-15'] += 1;
      else if (age <= 20) ageBuckets['16-20'] += 1;
      else ageBuckets['20+'] += 1;
    }

    // OEM concentration.
    const oem = new Map<string, number>();
    for (const r of records) {
      const key = r.oem.trim() || 'Unspecified';
      oem.set(key, (oem.get(key) ?? 0) + 1);
    }
    const oemRows = [...oem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([label, value]) => ({ label, value }));

    // Activity trend over the last 12 months, by inspection date.
    const trend: { label: string; intermediate: number; major: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const prefix = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      trend.push({
        label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
        intermediate: records.filter((r) => r.intermediateDate?.startsWith(prefix)).length,
        major: records.filter((r) => r.majorDate?.startsWith(prefix)).length,
      });
    }

    const pending = records.filter((r) => r.approveStatus === 'pending_approval').length;
    const approved = records.filter((r) => r.approveStatus === 'approved').length;

    const quality = [
      { label: 'Due date', value: records.filter((r) => !r.intermediateDueDate && !r.majorDueDate).length },
      { label: 'Serial', value: records.filter((r) => !r.serialNumber.trim()).length },
      { label: 'Frequency', value: records.filter((r) => !r.intermediateFreqMonths && !r.majorFreqMonths).length },
      { label: 'Manuf. year', value: records.filter((r) => !r.manufactureYear).length },
      { label: 'OEM', value: records.filter((r) => !r.oem.trim()).length },
    ];
    const fields = records.length * quality.length;
    const complete = fields ? Math.round(((fields - quality.reduce((n, q) => n + q.value, 0)) / fields) * 100) : 100;

    return {
      total: records.length, scheduled, overdue, dueSoon, compliant, obligations, worstOverdueDays,
      score: scheduled ? Math.round((compliant / scheduled) * 100) : 0,
      coverage: records.length ? Math.round((scheduled / records.length) * 100) : 0,
      aging, forecast, rigCompliance, byRig, byCat, byStatus, kind, freqRows,
      ageBuckets, avgAge: ageN ? (ageSum / ageN).toFixed(1) : '0', oemRows, oemCount: oem.size,
      trend, pending, approved, quality, complete,
    };
  }, [records, today]);

  if (loading) return <LoadingState label="Loading dashboard…" />;

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
        <Kpi label="Compliance Score" value={`${m.score}%`} ico="gauge"
          caption={`${m.compliant}/${m.scheduled} scheduled`} />
        <Kpi label="Overdue" value={String(m.overdue)} tone="danger" ico="alert"
          caption={m.worstOverdueDays ? `worst ${m.worstOverdueDays}d` : undefined} />
        <Kpi label="Due next 30" value={String(m.dueSoon)} tone="warning" ico="timer" />
        <Kpi label="Coverage" value={`${m.coverage}%`} ico="target"
          caption={`${m.obligations} obligations`} />
        {/* insp_records has no approved_at timestamp, so turnaround is unavailable. */}
        <Kpi label="Avg approval" value="—" caption="days" ico="approvals" />
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
            {/* Needs an approved_at column to compute; not present in insp_records. */}
            <Kpi label="Avg approval" value="—" caption="days" />
            <Kpi label="Approved 30d" value="—" />
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
