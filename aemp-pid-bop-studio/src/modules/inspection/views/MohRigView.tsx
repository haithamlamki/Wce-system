// ============================================================================
//  Major Overhaul — one rig's plan (the HTML's "Rig Page"): every active MOH
//  item with its source (manual unit / inspection auto-fill / none), last and
//  next MOH, status and a year-by-year matrix. Year cells open the project
//  details; units, applicability and projects are editable with moh:update.
// ============================================================================
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Chart from '../components/Chart';
import Icon from '../components/Icon';
import { Badge, Card, EmptyState, LoadingState, PageHeader } from '../components/ui';
import { exportCsv, Kpi, PlanControls, StatusBadge, statusLabel, useMohPlan } from '../components/MohShared';
import { ProjectDrawer, UnitDrawer } from '../components/MohDrawers';
import { useInspection } from '../state/InspectionContext';
import {
  blankProject, MOH_CATEGORIES, MOH_STATUSES, projectKey, summarize,
  type MohItem, type MohProject, type MohUnit, type PlanRow,
} from '../lib/moh';
import { deleteUnit, setApplicable } from '../lib/mohApi';

type UnitEdit = { item: MohItem; unit: Partial<MohUnit> | null };
type ProjectEdit = { project: MohProject; title: string };

const interval = (i: MohItem) => (i.interval
  ? i.basis === 'hours' ? `${i.interval.toLocaleString('en-US')} h` : `${i.interval} yr`
  : '—');

export default function MohRigView() {
  const { rigId = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useInspection();
  const editable = can('moh:update');
  const plan = useMohPlan();
  const { years, data, error, projects } = plan;
  const rig = plan.rigs.find((r) => r.id === rigId);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [unitEdit, setUnitEdit] = useState<UnitEdit | null>(null);
  const [projectEdit, setProjectEdit] = useState<ProjectEdit | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const rigRows = useMemo(() => plan.rows.filter((r) => r.rigId === rigId), [plan.rows, rigId]);
  const s = useMemo(() => summarize(rigRows, years), [rigRows, years]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rigRows.filter((r) => {
      if (category && r.item.category !== category) return false;
      if (status && r.calc.status !== status) return false;
      if (year && !r.calc.years.includes(Number(year))) return false;
      if (!needle) return true;
      return `${r.item.description} ${r.unit?.assetNumber ?? ''} ${r.unit?.equipmentNumber ?? ''}`.toLowerCase().includes(needle);
    });
  }, [rigRows, q, category, status, year]);

  const done = async () => { setUnitEdit(null); setProjectEdit(null); await plan.reload(); };

  const toggle = async (r: PlanRow) => {
    try { await setApplicable(r.rigId, r.item.id, !r.applicable); await plan.reload(); }
    catch (e) { setMsg((e as Error).message); }
  };
  const remove = async (u: MohUnit, item: MohItem) => {
    if (!window.confirm(`Remove this ${item.description} unit and its project details?`)) return;
    try { await deleteUnit(u.id); await plan.reload(); } catch (e) { setMsg((e as Error).message); }
  };
  const addUnit = (r: PlanRow) => setUnitEdit({
    item: r.item,
    // Seed a new unit with the inspection-derived date so the user only confirms it.
    unit: r.source === 'inspection' && r.insp?.lastMajor ? { lastMohDate: r.insp.lastMajor } : null,
  });
  const openProject = (r: PlanRow, y: number) => {
    const existing = projects.get(projectKey(r.rigId, r.item.id, r.unit?.id ?? null, y));
    const tag = r.unit?.assetNumber || r.unit?.equipmentNumber;
    setProjectEdit({ project: existing ?? blankProject(r, y), title: `${rig?.name} · ${r.item.description}${tag ? ` · ${tag}` : ''}` });
  };

  if (!data && !error) return <LoadingState label="Loading MOH plan…" />;
  if (data && !rig) {
    return <EmptyState ico="?" title="Rig not found" desc="This rig does not exist or is outside your access scope." />;
  }
  const rigName = rig?.name ?? '';
  const span = `${years[0]}–${years[years.length - 1]}`;

  const exportRig = () => exportCsv(`MOH_${rigName}_${span}.csv`,
    ['S.No.', 'Equipment', 'Category', 'Asset No.', 'Equipment No.', 'Interval', 'Source', 'Last MOH', 'Next MOH',
      'Status', 'Status detail', ...years.map(String), 'Remarks'],
    shown.map((r) => [r.item.sno, r.item.description, r.item.category, r.unit?.assetNumber ?? '', r.unit?.equipmentNumber ?? '',
      interval(r.item), r.source, r.lastLabel, r.calc.nextDue, statusLabel(r.calc.status), r.calc.detail,
      ...years.map((y) => (r.calc.years.includes(y)
        ? projects.get(projectKey(r.rigId, r.item.id, r.unit?.id ?? null, y))?.status ?? 'MOH' : '')),
      r.unit?.remarks ?? '']));

  return (
    <>
      <PageHeader title={`${rigName} – Major Overhaul Plan`}
        subtitle={`Equipment MOH plan · ${span}`}
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={() => navigate('/inspection/moh')}>← All rigs</button>
            <button type="button" className="insp-btn" onClick={exportRig}><Icon name="export" /> Export CSV</button>
          </>
        )} />

      {(error || msg) && (
        <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>{error || msg}</div>
      )}

      <div className="insp-kpis">
        <Kpi label="Equipment units" value={s.units} />
        <Kpi label="MOH overdue" value={s.overdue} tone="danger" />
        <Kpi label="Due this year" value={s.dueThis} tone="warning" />
        <Kpi label="Due next year" value={s.dueNext} />
        <Kpi label={`MOH projects · ${years.length} yrs`} value={s.projects} caption={s.highest ? `peak ${s.highest}` : undefined} />
        <Kpi label="Missing last MOH" value={s.missing} />
      </div>

      <div className="insp-filterrow" style={{ marginTop: 16 }}>
        <PlanControls startYear={plan.startYear} horizon={plan.horizon} onStart={plan.setStartYear} onHorizon={plan.setHorizon} />
        <label className="fld"><span>Search</span>
          <input className="insp-input" placeholder="Equipment / asset no." value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="fld"><span>Category</span>
          <select className="insp-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {MOH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <label className="fld"><span>Status</span>
          <select className="insp-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {MOH_STATUSES.map((st) => <option key={st} value={st}>{statusLabel(st)}</option>)}
          </select></label>
        <label className="fld"><span>MOH year</span>
          <select className="insp-input" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select></label>
      </div>

      <div className="insp-table-wrap">
        <table className="insp-table">
          <thead>
            <tr>
              <th>S.No.</th>{editable && <th title="Applicable to this rig">Appl.</th>}
              <th>Equipment</th><th>Asset / Eq. No.</th><th>Interval</th><th>Source</th>
              <th>Last MOH</th><th>Next MOH</th><th>Status</th>
              {years.map((y) => <th key={y} style={{ textAlign: 'center' }}>{y}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} style={r.applicable ? undefined : { opacity: 0.55 }}>
                <td>{r.item.sno}</td>
                {editable && (
                  <td><input type="checkbox" aria-label={`${r.item.description} applicable`} checked={r.applicable}
                    onChange={() => toggle(r)} /></td>
                )}
                <td><b>{r.item.description}</b><div style={{ color: 'var(--i-muted)', fontSize: 11.5 }}>{r.item.category}</div></td>
                <td>{[r.unit?.assetNumber, r.unit?.equipmentNumber].filter(Boolean).join(' / ') || '—'}</td>
                <td>{interval(r.item)}</td>
                <td>
                  {r.source === 'manual' && <Badge tone="info">Manual</Badge>}
                  {r.source === 'inspection' && (
                    <span title={`${r.insp?.components} component(s) with major inspections, ${r.insp?.overdueComponents} overdue`}>
                      <Badge tone="neutral">Inspection</Badge></span>
                  )}
                  {r.source === 'none' && '—'}
                </td>
                <td>{r.lastLabel}</td>
                <td>{r.calc.nextDue}</td>
                <td><StatusBadge status={r.calc.status} />
                  {r.calc.detail && <div style={{ color: 'var(--i-muted)', fontSize: 11.5, marginTop: 2 }}>{r.calc.detail}</div>}</td>
                {years.map((y) => {
                  if (!r.calc.years.includes(y)) return <td key={y} style={{ textAlign: 'center', color: 'var(--i-muted)' }}>—</td>;
                  const pst = projects.get(projectKey(r.rigId, r.item.id, r.unit?.id ?? null, y))?.status;
                  const tone = pst === 'Completed' ? 'success' : pst === 'Deferred' ? 'warning' : pst && pst !== 'Not Started' ? 'info' : 'neutral';
                  return (
                    <td key={y} style={{ textAlign: 'center' }}>
                      <button type="button" className="insp-chip" title="MOH project details" onClick={() => openProject(r, y)}
                        style={{ cursor: 'pointer', border: 0, background: 'none', padding: 0 }}>
                        <Badge tone={tone}>{pst === 'Completed' ? '✓ Done' : pst && pst !== 'Not Started' ? pst : 'MOH'}</Badge>
                      </button>
                    </td>
                  );
                })}
                <td>
                  <span style={{ display: 'flex', gap: 4 }}>
                    {r.unit ? (
                      <>
                        <button type="button" className="insp-iconbtn" title={editable ? 'Edit unit' : 'View unit'}
                          onClick={() => setUnitEdit({ item: r.item, unit: r.unit })}><Icon name="edit" /></button>
                        {editable && <button type="button" className="insp-iconbtn" title="Remove unit"
                          onClick={() => remove(r.unit as MohUnit, r.item)}><Icon name="delete" /></button>}
                      </>
                    ) : null}
                    {editable && <button type="button" className="insp-iconbtn"
                      title={r.unit ? 'Add another unit' : 'Enter last MOH (adds a unit)'} onClick={() => addUnit(r)}><Icon name="plus" /></button>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <EmptyState title="No equipment matches" desc="Adjust the filters above." />}
      </div>

      <div className="insp-grid-2" style={{ marginTop: 18 }}>
        <Card title="MOH Projects by Year">
          <Chart type="bar" labels={years.map(String)}
            series={[{ label: 'MOH projects', data: years.map((y) => s.annual[y]), color: '--i-brand' }]} />
        </Card>
        <Card title="MOH Workload by Equipment Category">
          <Chart type="bar" horizontal height={Math.max(220, MOH_CATEGORIES.length * 24)} labels={[...MOH_CATEGORIES]}
            series={[{ label: 'MOH projects', data: MOH_CATEGORIES.map((c) => s.byCategory[c] ?? 0), color: '--i-accent' }]} />
        </Card>
      </div>

      {unitEdit && rig && (
        <UnitDrawer key={`${unitEdit.item.id}|${unitEdit.unit?.id ?? 'new'}`} item={unitEdit.item} rigId={rig.id} rigName={rig.name} unit={unitEdit.unit}
          readOnly={!editable} onClose={() => setUnitEdit(null)} onSaved={done} />
      )}
      {projectEdit && (
        <ProjectDrawer key={projectKey(projectEdit.project.rigId, projectEdit.project.itemId,
          projectEdit.project.mohUnitId, projectEdit.project.year)} project={projectEdit.project} title={projectEdit.title} readOnly={!editable}
          onClose={() => setProjectEdit(null)} onSaved={done} />
      )}
    </>
  );
}
