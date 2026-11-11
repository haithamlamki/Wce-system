// ============================================================================
//  Annual Maintenance — one rig's plan (the workbook's Maintenance Plan +
//  Gantt Chart + Summary sheets in one page). Header KPIs, AM window and
//  payment at the contract terms, department breakdown, Gantt, the lines with
//  their checklists, and the import revision history. Finalize on the last day
//  freezes the plan (DB trigger); reopen lifts it. Export writes the office
//  layout back out so the planners can keep working in Excel and re-import.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './am.css';
import './moh.css';
import Chart from '../components/Chart';
import AmGantt from '../components/AmGantt';
import AmImportPanel from '../components/AmImportPanel';
import AmItemsTable from '../components/AmItemsTable';
import { TermsFields } from '../components/AmContractPanel';
import { PlanStatusBadge, todayISO, useAmRigs } from '../components/AmShared';
import { Kpi, PrintHeader, printedOn } from '../components/MohShared';
import Icon from '../components/Icon';
import { Badge, Card, EmptyState, LoadingState, PageHeader, SectionTitle } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import {
  PLAN_STATUSES, RATE_BASIS_LABEL, breakdown, bySection, catIvState, derivedStatus, fmtDate, money, nextCatIvYear,
  payment, pct, type AmItem, type AmPlan, type AmTask, type PlanStatus,
} from '../lib/am';
import {
  deletePlan, fetchPlan, setFinalized, setTaskDone, updateItem, updatePlan, type ItemPatch, type PlanDetail,
} from '../lib/amApi';
import { downloadPlanWorkbook } from '../lib/amExport';

const R = { textAlign: 'right' } as const;

export default function AmPlanView() {
  const { planId = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useInspection();
  const rigs = useAmRigs();
  const [d, setD] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = useCallback(async () => {
    try { setD(await fetchPlan(planId)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [planId]);
  useEffect(() => { void reload(); }, [reload]);

  const canEdit = can('am:update');
  const locked = !!d?.plan.finalizedAt;
  const editable = canEdit && !locked;
  const today = todayISO();
  const rigName = rigs.find((r) => r.id === d?.plan.rigId)?.name ?? '';
  const b = useMemo(() => breakdown(d?.items ?? []), [d]);
  const sections = useMemo(() => bySection(d?.items ?? []), [d]);

  const fail = (e: unknown) => { setMsg((e as Error).message); void reload(); };

  /** Optimistic tick; the line's status follows its checklist. */
  const onToggle = (item: AmItem, task: AmTask) => {
    if (!d || !task.id) return;
    const next: AmItem = { ...item, tasks: item.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) };
    next.status = derivedStatus(next);
    setD({ ...d, items: d.items.map((i) => (i.id === item.id ? next : i)) });
    void (async () => {
      try {
        await setTaskDone(task.id!, !task.done);
        if (next.status !== item.status && item.id) await updateItem(item.id, { status: next.status });
        setMsg(null);
      } catch (e) { fail(e); }
    })();
  };

  const onPatch = async (item: AmItem, patch: ItemPatch) => {
    if (!item.id) return;
    await updateItem(item.id, patch);
    await reload();
  };

  if (error) return <EmptyState ico="⚠" title="Maintenance plan" desc={error} />;
  if (!d) return <LoadingState label="Loading maintenance plan…" />;
  const { plan, items, revisions, contract } = d;
  const pay = payment(plan, today);
  const cat = plan.includesCatIv ? 'due' : catIvState(contract ?? undefined, plan.year);
  const lines = [rigName, `Revision ${plan.revision}`, `${fmtDate(plan.plannedStart)} → ${fmtDate(plan.plannedEnd)}`, printedOn()];

  return (
    <>
      <PageHeader title={plan.title}
        subtitle={`${rigName} · ${plan.year} · revision ${plan.revision}${plan.sourceFile ? ` · ${plan.sourceFile}` : ''}`}
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={() => navigate('/inspection/am')}>← All plans</button>
            <button type="button" className="insp-btn" onClick={() => void downloadPlanWorkbook(plan, items).catch(fail)}>
              <Icon name="export" /> Export Excel</button>
            <button type="button" className="insp-btn" onClick={() => window.print()}>Print</button>
            {editable && (
              <button type="button" className="insp-btn" onClick={() => setShowImport((v) => !v)}>
                <Icon name="upload" /> Import revision</button>
            )}
            {canEdit && (
              <button type="button" className={`insp-btn${locked ? '' : ' primary'}`}
                onClick={() => void setFinalized(plan.id, !locked).then(reload).catch(fail)}>
                {locked ? 'Reopen plan' : 'Finalize plan'}</button>
            )}
          </>
        )} />
      <PrintHeader title={`${plan.title} – Annual Maintenance`} lines={lines} remarks={plan.notes} />

      {msg && <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>{msg}</div>}
      {locked && (
        <div className="insp-card am-noprint" style={{ marginBottom: 14 }}>
          Finalized {fmtDate(plan.finalizedAt!.slice(0, 10))} — lines and checklists are locked. Reopen to change them.
        </div>
      )}
      {showImport && (
        <div className="am-noprint" style={{ marginBottom: 14 }}>
          <AmImportPanel rigs={rigs} plans={[plan]} fixedRigId={plan.rigId} onClose={() => setShowImport(false)}
            onImported={async () => { setShowImport(false); await reload(); }} />
        </div>
      )}

      <div className="insp-kpis">
        <Kpi label="Total tasks" value={b.total} caption={`${b.notApplicable} not applicable`} />
        <Kpi label="Completed" value={b.completed} />
        <Kpi label="In progress" value={b.inProgress} tone={b.inProgress ? 'warning' : undefined} />
        <Kpi label="Not started" value={b.notStarted} />
        <Kpi label="Overall progress" value={pct(b.progress)} caption={`${b.tasksDone} / ${b.tasks} checklist items`} />
        <Kpi label="AM days" value={`${pay.days ?? '—'} / ${plan.allowedDays}`}
          tone={pay.overrunDays ? 'danger' : undefined} caption={pay.source === 'actual' ? 'actual vs allowed' : 'planned vs allowed'} />
        <Kpi label="Est. revenue impact" value={money(pay.loss === null ? null : -pay.loss, plan.currency)}
          caption={pay.loss === null ? 'set a daily rate' : `${RATE_BASIS_LABEL[plan.rateBasis]} ${plan.ratePercent}%`} />
      </div>

      <SectionTitle>AM window &amp; payment</SectionTitle>
      <PlanTerms key={`${plan.id}:${plan.revision}:${plan.finalizedAt ?? ''}`} plan={plan} editable={canEdit}
        onSaved={reload} onError={fail} />
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, margin: '10px 0 4px' }}>
        <span>Within allowance: <b>{pay.withinDays}</b> days at {plan.ratePercent}%</span>
        <span>Beyond allowance: <b style={{ color: pay.overrunDays ? 'var(--i-danger)' : undefined }}>{pay.overrunDays}</b> days at {plan.overrunRatePercent}%</span>
        <span>Earned: <b>{money(pay.earned, plan.currency)}</b> of {money(pay.fullRate, plan.currency)} at full rate</span>
        <span>CAT IV: {cat === 'due' ? <Badge tone="danger">Due this AM</Badge> : cat === 'ok'
          ? `next due ${contract ? nextCatIvYear(contract) : '—'}` : 'set the last CAT IV date in the rig contract terms'}</span>
      </div>

      <SectionTitle>Progress by department</SectionTitle>
      <div className="insp-grid-2">
        <div className="insp-table-wrap">
          <table className="insp-table">
            <thead><tr><th>Department</th><th style={R}>Active</th><th style={R}>Completed</th>
              <th style={R}>In progress</th><th style={R}>Not started</th><th style={R}>Progress</th></tr></thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.section}><td><b>{s.section}</b></td><td style={R}>{s.b.total}</td><td style={R}>{s.b.completed}</td>
                  <td style={R}>{s.b.inProgress}</td><td style={R}>{s.b.notStarted}</td><td style={R}>{pct(s.b.progress)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><th>Total</th><th style={R}>{b.total}</th><th style={R}>{b.completed}</th>
              <th style={R}>{b.inProgress}</th><th style={R}>{b.notStarted}</th><th style={R}>{pct(b.progress)}</th></tr></tfoot>
          </table>
        </div>
        <Card title="Progress by department">
          <Chart type="bar" horizontal height={Math.max(160, sections.length * 40)} labels={sections.map((s) => s.section)}
            series={[{ label: 'Progress %', data: sections.map((s) => Math.round(s.b.progress * 100)), color: '--i-brand' }]} />
        </Card>
      </div>

      <SectionTitle>Gantt chart</SectionTitle>
      <Card title={`Schedule · AM window ${fmtDate(plan.plannedStart)} → ${fmtDate(plan.plannedEnd)}`}>
        <AmGantt items={items} windowStart={plan.actualStart ?? plan.plannedStart}
          windowEnd={plan.actualEnd ?? plan.plannedEnd} today={today} />
      </Card>

      <SectionTitle>Maintenance plan</SectionTitle>
      <AmItemsTable items={items} editable={editable} onToggle={onToggle} onPatch={onPatch} />

      <SectionTitle>Revision history</SectionTitle>
      <div className="insp-table-wrap">
        <table className="insp-table">
          <thead><tr><th>Rev.</th><th>Imported</th><th>File</th><th>Lines</th><th>Progress</th><th>Changes vs previous</th></tr></thead>
          <tbody>
            {revisions.map((r) => {
              const s = r.summary as Record<string, number | undefined>;
              return (
                <tr key={r.id}><td>{r.revision}</td><td>{new Date(r.importedAt).toLocaleString('en-GB')}</td><td>{r.fileName}</td>
                  <td>{s.lines ?? '—'}</td><td>{typeof s.progress === 'number' ? pct(s.progress) : '—'}</td>
                  <td>{s.added === undefined ? 'First import' : `+${s.added} / −${s.removed ?? 0} lines, ${s.changed ?? 0} changed, ${s.tasksDone ?? 0} tasks done`}</td></tr>
              );
            })}
            {!revisions.length && <tr><td colSpan={6} style={{ color: 'var(--i-muted)' }}>No imports recorded.</td></tr>}
          </tbody>
        </table>
      </div>

      {canEdit && !locked && (
        <div className="am-noprint" style={{ marginTop: 24, display: 'flex', gap: 8, alignItems: 'center' }}>
          {!confirmDelete ? (
            <button type="button" className="insp-btn" onClick={() => setConfirmDelete(true)}><Icon name="delete" /> Delete plan</button>
          ) : (
            <>
              <span>Delete &quot;{plan.title}&quot; and its history?</span>
              <button type="button" className="insp-btn primary"
                onClick={() => void deletePlan(plan.id).then(() => navigate('/inspection/am')).catch(fail)}>Yes, delete</button>
              <button type="button" className="insp-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Status, actual window and the plan's own copy of the contract terms. */
function PlanTerms({ plan, editable, onSaved, onError }: {
  plan: AmPlan; editable: boolean; onSaved: () => Promise<void>; onError: (e: unknown) => void;
}) {
  const [p, setP] = useState(plan);
  const [busy, setBusy] = useState(false);
  const badActual = !!p.actualStart && !!p.actualEnd && p.actualEnd < p.actualStart;
  const dirty = JSON.stringify(p) !== JSON.stringify(plan);

  const save = async () => {
    setBusy(true);
    try {
      await updatePlan(plan.id, {
        status: p.status, actualStart: p.actualStart, actualEnd: p.actualEnd, allowedDays: p.allowedDays,
        rateBasis: p.rateBasis, ratePercent: p.ratePercent, overrunRatePercent: p.overrunRatePercent,
        dailyRate: p.dailyRate, currency: p.currency, includesCatIv: p.includesCatIv, notes: p.notes,
      });
      await onSaved();
    } catch (e) { onError(e); }
    setBusy(false);
  };

  return (
    <div className="insp-card">
      <div className="insp-filterrow">
        <div className="fld"><span>Planned window</span>
          <b style={{ padding: '6px 0' }}>{fmtDate(plan.plannedStart)} → {fmtDate(plan.plannedEnd)}</b></div>
        <label className="fld"><span>Plan status</span>
          <select className="insp-input" disabled={!editable} value={p.status}
            onChange={(e) => setP({ ...p, status: e.target.value as PlanStatus })}>
            {PLAN_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select></label>
        <label className="fld"><span>Actual start (day zero)</span>
          <input className="insp-input" type="date" disabled={!editable} value={p.actualStart ?? ''}
            onChange={(e) => setP({ ...p, actualStart: e.target.value || null })} /></label>
        <label className="fld"><span>Actual end</span>
          <input className="insp-input" type="date" disabled={!editable} value={p.actualEnd ?? ''}
            onChange={(e) => setP({ ...p, actualEnd: e.target.value || null })} /></label>
        <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" disabled={!editable} checked={p.includesCatIv}
            onChange={(e) => setP({ ...p, includesCatIv: e.target.checked })} /> <span>Includes CAT IV</span></label>
        <div className="fld"><span>&nbsp;</span><PlanStatusBadge status={plan.status} finalized={!!plan.finalizedAt} /></div>
      </div>
      <TermsFields value={p} disabled={!editable} onChange={(t) => setP({ ...p, ...t })} />
      <label className="fld" style={{ display: 'block' }}><span>Notes</span>
        <textarea className="insp-input" rows={2} maxLength={4000} style={{ width: '100%' }} disabled={!editable}
          value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} /></label>
      {badActual && <div style={{ color: 'var(--i-danger)', fontSize: 12.5 }}>Actual end is before actual start.</div>}
      {editable && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }} className="am-noprint">
          <button type="button" className="insp-btn primary" disabled={!dirty || busy || badActual} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save window & terms'}</button>
          <button type="button" className="insp-btn" disabled={!dirty || busy} onClick={() => setP(plan)}>Reset</button>
        </div>
      )}
    </div>
  );
}
