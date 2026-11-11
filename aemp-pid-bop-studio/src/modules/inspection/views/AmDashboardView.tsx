// ============================================================================
//  Annual Maintenance — all rigs. Every rig's yearly AM plan (imported from the
//  office "Maintenance Plan - Gantt Chart" workbook): window vs the contract's
//  allowed days, progress, how the rig is paid while down and the estimated
//  revenue impact, CAT IV due. Plus each rig's contract terms.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './am.css';
import './moh.css';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import Icon from '../components/Icon';
import AmImportPanel from '../components/AmImportPanel';
import AmContractPanel from '../components/AmContractPanel';
import { PlanStatusBadge, ProgressBar, todayISO, useAmRigs } from '../components/AmShared';
import { Kpi } from '../components/MohShared';
import { Badge, EmptyState, LoadingState, PageHeader, SectionTitle } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import {
  RATE_BASIS_LABEL, blankContract, catIvState, fmtDate, money, nextCatIvYear, payment,
  type AmContract, type AmPlan, type Payment,
} from '../lib/am';
import { fetchOverview, type AmOverview, type PlanSummary } from '../lib/amApi';

interface Row { plan: AmPlan; rig: string; s: PlanSummary | undefined; pay: Payment; cat: 'due' | 'ok' | 'unknown' }
interface ContractRow { id: string; name: string; c: AmContract; saved: boolean }

const EMPTY: PlanSummary = { active: 0, completed: 0, inProgress: 0, notStarted: 0, notApplicable: 0, progress: 0 };

export default function AmDashboardView() {
  const { can } = useInspection();
  const navigate = useNavigate();
  const rigs = useAmRigs();
  const editable = can('am:update');
  const [data, setData] = useState<AmOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [showImport, setShowImport] = useState(false);
  const [editRig, setEditRig] = useState<ContractRow | null>(null);

  const reload = useCallback(async () => {
    try { setData(await fetchOverview()); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const today = todayISO();
  const rigName = useMemo(() => new Map(rigs.map((r) => [r.id, r.name])), [rigs]);
  const yearOptions = useMemo(() => [...new Set([new Date().getFullYear(), ...(data?.plans ?? []).map((p) => p.year)])]
    .sort((a, b) => b - a), [data]);

  const rows: Row[] = useMemo(() => (data?.plans ?? [])
    .filter((p) => !year || p.year === Number(year))
    .map((plan) => ({
      plan, rig: rigName.get(plan.rigId) ?? '—', s: data?.summary.get(plan.id), pay: payment(plan, today),
      cat: plan.includesCatIv ? 'due' as const : catIvState(data?.contracts.get(plan.rigId), plan.year),
    }))
    .sort((a, b) => (a.plan.plannedStart ?? '9999').localeCompare(b.plan.plannedStart ?? '9999')), [data, year, rigName, today]);

  const contractRows: ContractRow[] = useMemo(() => rigs.map((r) => {
    const c = data?.contracts.get(r.id);
    return { id: r.id, name: r.name, c: c ?? blankContract(r.id), saved: !!c };
  }), [rigs, data]);

  const kpi = useMemo(() => {
    const loss: Record<string, number> = {};
    let days = 0, over = 0, prog = 0, withSummary = 0;
    for (const r of rows) {
      days += r.pay.days ?? 0;
      if (r.pay.overrunDays > 0) over += 1;
      if (r.pay.loss !== null) loss[r.plan.currency] = (loss[r.plan.currency] ?? 0) + r.pay.loss;
      if (r.s) { prog += r.s.progress; withSummary += 1; }
    }
    return {
      days, over, progress: withSummary ? prog / withSummary : 0,
      loss: Object.entries(loss).map(([c, v]) => money(v, c)).join(' · ') || '—',
      running: rows.filter((r) => r.plan.status === 'In Progress').length,
      catDue: rows.filter((r) => r.cat === 'due').length,
    };
  }, [rows]);

  const open = (id: string) => navigate(`/inspection/am/${id}`);

  const columns: Column<Row>[] = [
    { key: 'rig', header: 'Rig', sortable: true, value: (r) => r.rig },
    { key: 'plan', header: 'Plan', sortable: true, value: (r) => r.plan.title,
      render: (r) => <a href={`/inspection/am/${r.plan.id}`} onClick={(e) => { e.preventDefault(); open(r.plan.id); }}>{r.plan.title}</a> },
    { key: 'window', header: 'AM window', sortable: true, value: (r) => r.plan.plannedStart ?? '',
      render: (r) => `${fmtDate(r.plan.plannedStart)} → ${fmtDate(r.plan.plannedEnd)}` },
    { key: 'days', header: 'Days / allowed', align: 'right', sortable: true, value: (r) => r.pay.days ?? 0,
      render: (r) => (
        <span style={{ color: r.pay.overrunDays ? 'var(--i-danger)' : undefined, fontWeight: r.pay.overrunDays ? 600 : 400 }}
          title={r.pay.source === 'actual' ? 'Actual days' : 'Planned days'}>
          {r.pay.days ?? '—'} / {r.plan.allowedDays}{r.pay.source === 'actual' ? ' (act.)' : ''}
        </span>) },
    { key: 'status', header: 'Status', sortable: true, value: (r) => r.plan.status,
      render: (r) => <PlanStatusBadge status={r.plan.status} finalized={!!r.plan.finalizedAt} /> },
    { key: 'progress', header: 'Progress', sortable: true, value: (r) => r.s?.progress ?? 0,
      render: (r) => <ProgressBar value={r.s?.progress ?? 0} /> },
    { key: 'lines', header: 'Done / active', align: 'right', value: (r) => (r.s ?? EMPTY).completed,
      render: (r) => `${(r.s ?? EMPTY).completed} / ${(r.s ?? EMPTY).active}` },
    { key: 'basis', header: 'Paid during AM', value: (r) => r.plan.rateBasis,
      render: (r) => `${RATE_BASIS_LABEL[r.plan.rateBasis]}${r.plan.rateBasis === 'full' ? '' : ` (${r.plan.ratePercent}%)`}` },
    { key: 'loss', header: 'Est. revenue impact', align: 'right', sortable: true, value: (r) => r.pay.loss ?? -1,
      render: (r) => money(r.pay.loss === null ? null : -r.pay.loss, r.plan.currency) },
    { key: 'cativ', header: 'CAT IV', value: (r) => r.cat,
      render: (r) => (r.cat === 'due' ? <Badge tone="danger">Due</Badge> : r.cat === 'ok' ? 'Not due' : '—') },
    { key: 'rev', header: 'Rev.', align: 'right', value: (r) => r.plan.revision },
  ];

  const contractColumns: Column<ContractRow>[] = [
    { key: 'rig', header: 'Rig', sortable: true, value: (r) => r.name },
    { key: 'client', header: 'Client', sortable: true, value: (r) => r.c.client },
    { key: 'days', header: 'AM days allowed', align: 'right', sortable: true, value: (r) => r.c.amDaysAllowed },
    { key: 'basis', header: 'Paid during AM', value: (r) => r.c.rateBasis,
      render: (r) => `${RATE_BASIS_LABEL[r.c.rateBasis]} · ${r.c.ratePercent}%` },
    { key: 'over', header: 'Over-run rate', align: 'right', value: (r) => r.c.overrunRatePercent, render: (r) => `${r.c.overrunRatePercent}%` },
    { key: 'rate', header: 'Daily rate', align: 'right', value: (r) => r.c.dailyRate ?? -1, render: (r) => money(r.c.dailyRate, r.c.currency) },
    { key: 'cat', header: 'CAT IV (last → next)', value: (r) => nextCatIvYear(r.c) ?? 0,
      render: (r) => `${fmtDate(r.c.lastCatIvDate)} → ${nextCatIvYear(r.c) ?? '—'} (${r.c.catIvCycleYears} yr)` },
    { key: 'edit', header: '', render: (r) => (
      <button type="button" className="insp-btn" onClick={() => setEditRig(r)}>
        {editable ? (r.saved ? 'Edit' : 'Set terms') : 'View'}</button>) },
  ];

  return (
    <>
      <PageHeader title="Annual Maintenance"
        subtitle="Yearly AM plans per rig — window vs contract allowance, progress, payment basis and CAT IV"
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={() => window.print()} disabled={!data}>Print</button>
            {editable && (
              <button type="button" className="insp-btn primary" onClick={() => setShowImport((v) => !v)} disabled={!data}>
                <Icon name="upload" /> Import Excel plan</button>
            )}
          </>
        )} />

      {error && <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>{error}</div>}

      {showImport && data && (
        <div className="am-noprint" style={{ marginBottom: 14 }}>
          <AmImportPanel rigs={rigs} plans={data.plans} onClose={() => setShowImport(false)}
            onImported={async (id) => { await reload(); open(id); }} />
        </div>
      )}
      {editRig && (
        <div className="am-noprint" style={{ marginBottom: 14 }}>
          <AmContractPanel key={editRig.id} rigName={editRig.name} contract={editRig.c} editable={editable}
            onClose={() => setEditRig(null)} onSaved={reload} />
        </div>
      )}

      <div className="insp-filterrow">
        <label className="fld"><span>Plan year</span>
          <select className="insp-input" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      {!data && !error ? <LoadingState label="Loading maintenance plans…" /> : (
        <>
          <div className="insp-kpis">
            <Kpi label="AM plans" value={rows.length} caption={year ? `in ${year}` : 'all years'} />
            <Kpi label="Running now" value={kpi.running} />
            <Kpi label="Average progress" value={`${Math.round(kpi.progress * 100)}%`} />
            <Kpi label="AM rig-days" value={kpi.days} caption="actual where started, else planned" />
            <Kpi label="Over allowance" value={kpi.over} tone={kpi.over ? 'danger' : undefined} caption="plans beyond contract days" />
            <Kpi label="Est. revenue impact" value={kpi.loss} caption="vs full daily rate" />
            <Kpi label="CAT IV due" value={kpi.catDue} tone={kpi.catDue ? 'warning' : undefined} />
          </div>

          <SectionTitle>Plans</SectionTitle>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.plan.id} loading={!data}
            searchPlaceholder="Search plans…" emptyTitle="No maintenance plans"
            emptyDesc={editable ? 'Import a rig\'s Maintenance Plan workbook to start.' : 'No plans for this year in your scope.'} />

          <SectionTitle>Rig contract terms</SectionTitle>
          {contractRows.length ? (
            <DataTable rows={contractRows} columns={contractColumns} rowKey={(r) => r.id} loading={!data}
              searchPlaceholder="Search rigs…" emptyTitle="No rigs" />
          ) : <EmptyState title="No rigs in your scope" />}
          <p style={{ color: 'var(--i-muted)', fontSize: 12, marginTop: 10 }}>
            Revenue impact compares what the rig earns during the AM — days within the allowance at the contract&apos;s AM
            rate, days beyond it at the over-run rate — with a full daily rate for every AM day. Rigs without terms
            default to 5 days at full rate.
          </p>
        </>
      )}
    </>
  );
}
