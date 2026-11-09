// ============================================================================
//  Major Overhaul Dashboard — the "All Rigs" page of the MOH planner HTML,
//  fed live from the system (migration 0053 + major-inspection auto-fill).
//  KPIs, consolidated annual workload, rig × year matrix and charts over a
//  configurable horizon (default 10 years). Each rig opens its own plan page.
// ============================================================================
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Chart from '../components/Chart';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import Icon from '../components/Icon';
import MohItemsPanel from '../components/MohItemsPanel';
import { Card, EmptyState, LoadingState, PageHeader, SectionTitle } from '../components/ui';
import { exportCsv, Kpi, PlanControls, useMohPlan } from '../components/MohShared';
import { useInspection } from '../state/InspectionContext';
import { MOH_CATEGORIES, summarize, type PlanRow, type Summary } from '../lib/moh';

interface RigSummary { id: string; name: string; s: Summary; auto: number }

const STATUS_SLICES = [
  { key: 'OVERDUE', label: 'Overdue', color: '--i-danger' },
  { key: 'DUE THIS YEAR', label: 'Due this year', color: '--i-warning' },
  { key: 'DUE NEXT YEAR', label: 'Due next year', color: '--i-success' },
  { key: 'PLANNED', label: 'Planned', color: '--i-info' },
  { key: 'NOT DUE IN PLAN', label: 'Not due in plan', color: '--i-accent' },
  { key: 'NO LAST MOH DATA', label: 'No data', color: '--i-muted' },
] as const;

export default function MohDashboardView() {
  const { can } = useInspection();
  const navigate = useNavigate();
  const plan = useMohPlan();
  const { rows, years, rigs, data, error } = plan;
  const [category, setCategory] = useState('');
  const [showItems, setShowItems] = useState(false);
  const editable = can('moh:update');

  const shown: PlanRow[] = useMemo(
    () => (category ? rows.filter((r) => r.item.category === category) : rows), [rows, category]);
  const total = useMemo(() => summarize(shown, years), [shown, years]);
  const perRig: RigSummary[] = useMemo(() => rigs.map((rig) => {
    const rr = shown.filter((r) => r.rigId === rig.id);
    return { id: rig.id, name: rig.name, s: summarize(rr, years),
      auto: rr.filter((r) => r.source === 'inspection' && r.applicable).length };
  }), [rigs, shown, years]);

  const open = (id: string) => navigate(`/inspection/moh/${id}`);
  const span = `${years[0]}–${years[years.length - 1]}`;

  const exportSummary = () => exportCsv(`MOH_All_Rigs_${span}.csv`,
    ['Rig', 'Equipment units', 'Overdue', 'Due this year', 'Due next year', 'Missing last MOH',
      'Auto-filled from inspections', ...years.map(String), 'Total MOH'],
    perRig.map((r) => [r.name, r.s.units, r.s.overdue, r.s.dueThis, r.s.dueNext, r.s.missing, r.auto,
      ...years.map((y) => r.s.annual[y]), r.s.projects]));

  const columns: Column<RigSummary>[] = [
    { key: 'rig', header: 'Rig', sortable: true, value: (r) => r.name,
      render: (r) => <a href={`/inspection/moh/${r.id}`} onClick={(e) => { e.preventDefault(); open(r.id); }}>{r.name}</a> },
    { key: 'units', header: 'Units', align: 'right', sortable: true, value: (r) => r.s.units },
    { key: 'overdue', header: 'Overdue', align: 'right', sortable: true, value: (r) => r.s.overdue,
      render: (r) => <span style={{ color: r.s.overdue ? 'var(--i-danger)' : undefined, fontWeight: r.s.overdue ? 600 : 400 }}>{r.s.overdue}</span> },
    { key: 'this', header: 'Due this year', align: 'right', sortable: true, value: (r) => r.s.dueThis },
    { key: 'next', header: 'Due next year', align: 'right', sortable: true, value: (r) => r.s.dueNext },
    { key: 'missing', header: 'Missing data', align: 'right', sortable: true, value: (r) => r.s.missing },
    { key: 'auto', header: 'From inspections', align: 'right', sortable: true, value: (r) => r.auto },
    { key: 'projects', header: `MOH ${span}`, align: 'right', sortable: true, value: (r) => r.s.projects },
  ];

  return (
    <>
      <PageHeader title="Major Overhaul Dashboard"
        subtitle={`Consolidated MOH workload and overdue exposure across all rigs · ${span}`}
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={exportSummary} disabled={!data}>
              <Icon name="export" /> Export CSV</button>
            {editable && (
              <button type="button" className="insp-btn" onClick={() => setShowItems((v) => !v)}>
                <Icon name="columns" /> Equipment master</button>
            )}
          </>
        )} />

      {error && <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>{error}</div>}

      {showItems && data && (
        <MohItemsPanel items={data.items} onClose={() => setShowItems(false)} onSaved={plan.reload} />
      )}

      <div className="insp-filterrow">
        <PlanControls startYear={plan.startYear} horizon={plan.horizon}
          onStart={plan.setStartYear} onHorizon={plan.setHorizon} />
        <label className="fld">
          <span>Category</span>
          <select className="insp-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {MOH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {!data && !error ? <LoadingState label="Loading MOH plan…" /> : (
        <>
          <div className="insp-kpis">
            <Kpi label="Rigs" value={rigs.length} />
            <Kpi label="Equipment units" value={total.units} />
            <Kpi label="MOH overdue" value={total.overdue} tone="danger" />
            <Kpi label="Due this year" value={total.dueThis} tone="warning" />
            <Kpi label="Due next year" value={total.dueNext} />
            <Kpi label={`MOH projects · ${years.length} yrs`} value={total.projects}
              caption={total.highest ? `peak ${total.highest}` : undefined} />
            <Kpi label="Missing last MOH" value={total.missing} caption="enter on rig pages" />
          </div>

          <SectionTitle>Workload</SectionTitle>
          <div className="insp-grid-2">
            <Card title="MOH Projects by Year – All Rigs">
              <Chart type="bar" labels={years.map(String)}
                series={[{ label: 'MOH projects', data: years.map((y) => total.annual[y]), color: '--i-brand' }]} />
            </Card>
            <Card title="MOH Status Distribution">
              <Chart type="doughnut" showLegend labels={STATUS_SLICES.map((s) => s.label)}
                centerText={{ value: String(total.units), caption: 'units' }}
                series={[{ label: 'Units', data: STATUS_SLICES.map((s) => total.byStatus[s.key]),
                  color: '--i-brand', sliceColors: STATUS_SLICES.map((s) => s.color) }]} />
            </Card>
            <Card title="MOH Projects by Rig">
              {perRig.length ? (
                <Chart type="bar" horizontal height={Math.max(220, perRig.length * 22)}
                  labels={perRig.map((r) => r.name)}
                  series={[{ label: 'MOH projects', data: perRig.map((r) => r.s.projects), color: '--i-info' }]} />
              ) : <EmptyState title="No rigs in your scope" />}
            </Card>
            <Card title="MOH Workload by Equipment Category">
              <Chart type="bar" horizontal height={Math.max(220, MOH_CATEGORIES.length * 24)}
                labels={[...MOH_CATEGORIES]}
                series={[{ label: 'MOH projects', data: MOH_CATEGORIES.map((c) => total.byCategory[c] ?? 0), color: '--i-accent' }]} />
            </Card>
          </div>

          <SectionTitle>Rig-by-Rig Summary</SectionTitle>
          <DataTable rows={perRig} columns={columns} rowKey={(r) => r.id} loading={!data}
            searchPlaceholder="Search rigs…" emptyTitle="No rigs" emptyDesc="No rigs are inside your access scope." />

          <SectionTitle>All Rigs – Workload Matrix</SectionTitle>
          <div className="insp-table-wrap">
            <table className="insp-table">
              <thead>
                <tr><th>Rig</th>{years.map((y) => <th key={y} style={{ textAlign: 'center' }}>{y}</th>)}
                  <th style={{ textAlign: 'center' }}>Total</th></tr>
              </thead>
              <tbody>
                {perRig.map((r) => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => open(r.id)}>
                    <td><b>{r.name}</b></td>
                    {years.map((y) => <td key={y} style={{ textAlign: 'center' }}>{r.s.annual[y] || '—'}</td>)}
                    <td style={{ textAlign: 'center' }}><b>{r.s.projects}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th>All rigs</th>{years.map((y) => <th key={y} style={{ textAlign: 'center' }}>{total.annual[y]}</th>)}
                  <th style={{ textAlign: 'center' }}>{total.projects}</th></tr>
              </tfoot>
            </table>
          </div>
          <p style={{ color: 'var(--i-muted)', fontSize: 12, marginTop: 10 }}>
            Last MOH is taken from a rig's manually entered units; where none exist, the oldest approved, in-service
            major-inspection date of the linked equipment types is used. Not-applicable items are excluded.
          </p>
        </>
      )}
    </>
  );
}
