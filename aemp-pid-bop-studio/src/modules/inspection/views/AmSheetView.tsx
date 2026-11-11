// ============================================================================
//  Annual Maintenance — the Maintenance Plan sheet as an input form
//  (/inspection/am/new and /inspection/am/:planId/sheet). Planners type the
//  plan in the same layout as the office workbook; Save writes it through
//  insp_am_import exactly like re-importing a revised sheet, so every save is
//  a revision on record. A finalized plan opens read-only.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './am-sheet.css';
import AmSheet from '../components/AmSheet';
import { todayISO, useAmRigs } from '../components/AmShared';
import { guessRig, diffPlans } from '../lib/amImport';
import Icon from '../components/Icon';
import { EmptyState, LoadingState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { breakdown, type AmPlan } from '../lib/am';
import { fetchPlan, importPlan, updatePlan } from '../lib/amApi';
import { finalizeItems, sheetYear, validateSheet, type SheetDraft, type SheetIssue } from '../lib/amSheet';

const EMPTY: SheetDraft = { rigId: '', title: '', plannedStart: null, plannedEnd: null, items: [] };

export default function AmSheetView() {
  const { planId } = useParams();
  const isNew = !planId;
  const navigate = useNavigate();
  const { can } = useInspection();
  const rigs = useAmRigs();
  const [plan, setPlan] = useState<AmPlan | null>(null);
  const [saved, setSaved] = useState<SheetDraft | null>(isNew ? EMPTY : null);
  const [draft, setDraft] = useState<SheetDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SheetIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!planId) return;
    try {
      const d = await fetchPlan(planId);
      const s: SheetDraft = { rigId: d.plan.rigId, title: d.plan.title, plannedStart: d.plan.plannedStart,
        plannedEnd: d.plan.plannedEnd, items: d.items };
      setPlan(d.plan); setSaved(s); setDraft(s); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [planId]);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => !!saved && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // A new plan picks its rig from the project name, as the Excel import does.
  const onDraft = (d: SheetDraft) => {
    if (isNew && d.title !== draft.title && (!draft.rigId || draft.rigId === guessRig(draft.title, rigs)?.id)) {
      d = { ...d, rigId: guessRig(d.title, rigs)?.id ?? d.rigId };
    }
    setDraft(d); setNote(null);
  };

  const locked = !!plan?.finalizedAt;
  const editable = can('am:update') && !locked;

  const leave = (to: string) => {
    if (dirty && !window.confirm('Discard the changes you have not saved?')) return;
    navigate(to);
  };

  const save = async () => {
    const found = validateSheet(draft);
    setIssues(found);
    if (found.length || !saved) return;
    setBusy(true); setNote(null);
    try {
      const items = finalizeItems(draft.items);
      const title = draft.title.trim();
      // The import matches the plan by rig + project name, so a rename goes first.
      if (plan && title.toLowerCase() !== plan.title.trim().toLowerCase()) await updatePlan(plan.id, { title });
      const b = breakdown(items);
      const diff = plan ? diffPlans(saved.items, items) : null;
      const id = await importPlan({
        rigId: draft.rigId, title, year: sheetYear(draft, todayISO()), plannedStart: draft.plannedStart,
        plannedEnd: draft.plannedEnd, fileName: 'Edited in the system', items,
        summary: {
          source: 'sheet', lines: items.length, active: b.total, completed: b.completed, inProgress: b.inProgress,
          notStarted: b.notStarted, progress: Math.round(b.progress * 1000) / 1000,
          ...(diff ? { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, tasksDone: diff.tasksDone } : {}),
        },
      });
      if (isNew) { setSaved(draft); navigate(`/inspection/am/${id}/sheet`, { replace: true }); return; }
      await load();
      setNote(`Saved as revision ${(plan?.revision ?? 0) + 1}.`);
    } catch (e) {
      const m = (e as Error).message;
      setIssues([{ line: null, message: /insp_am_plans_title|duplicate key/.test(m)
        ? 'This rig already has a plan with that project name.' : m }]);
    } finally {
      setBusy(false); // also after creating a plan, whose route change keeps this component mounted
    }
  };

  if (error) return <EmptyState ico="⚠" title="Maintenance plan" desc={error} />;
  if (!saved) return <LoadingState label="Loading maintenance plan…" />;
  if (isNew && !can('am:update')) return <EmptyState ico="🔒" title="Maintenance plan" desc="You do not have permission to create maintenance plans." />;
  const rigName = rigs.find((r) => r.id === draft.rigId)?.name;
  const lineName = (n: number) => { const i = draft.items[n - 1]; return `Line ${i?.sn ?? n}${i?.description ? ` (${i.description.slice(0, 40)})` : ''}`; };

  return (
    <>
      <PageHeader title={isNew ? 'New maintenance plan' : `${plan?.title ?? ''} · Maintenance Plan sheet`}
        subtitle={isNew ? 'Fill in the sheet as in the office workbook, then save.'
          : `${rigName ?? ''} · revision ${plan?.revision ?? 0}${locked ? ' · finalized (read-only)' : ''}`}
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={() => leave(isNew ? '/inspection/am' : `/inspection/am/${planId}`)}>
              ← {isNew ? 'All plans' : 'Plan overview'}</button>
            <button type="button" className="insp-btn" onClick={() => window.print()}>Print</button>
            {editable && (
              <>
                <button type="button" className="insp-btn" disabled={!dirty || busy}
                  onClick={() => { setDraft(saved); setIssues([]); }}>Discard changes</button>
                <button type="button" className="insp-btn primary" disabled={busy || (!isNew && !dirty)} onClick={() => void save()}>
                  <Icon name="upload" /> {busy ? 'Saving…' : isNew ? 'Create plan' : 'Save revision'}</button>
              </>
            )}
          </>
        )} />

      <div className="ams-bar">
        {isNew ? (
          <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><span>Rig</span>
            <select className="insp-input" value={draft.rigId} onChange={(e) => setDraft({ ...draft, rigId: e.target.value })}>
              <option value="">Choose a rig…</option>{rigs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
        ) : <span>Rig: <b>{rigName ?? '—'}</b></span>}
        {dirty && <span style={{ color: 'var(--i-warning, #b45309)' }}>● Unsaved changes</span>}
        {note && <span style={{ color: 'var(--i-success, #15803d)' }}>{note}</span>}
        {editable && <span style={{ color: 'var(--i-muted)', fontSize: 12.5 }}>
          Hover a row for + / ✕ / ↑ ↓ · Alt+Enter in a task adds the next one · Ctrl+; enters today</span>}
      </div>
      {issues.length > 0 && (
        <ul className="ams-issues" role="alert">
          {issues.slice(0, 12).map((x, n) => <li key={n}>{x.line ? `${lineName(x.line)}: ` : ''}{x.message}</li>)}
          {issues.length > 12 && <li>…and {issues.length - 12} more.</li>}
        </ul>
      )}

      <AmSheet draft={draft} editable={editable} onDraft={onDraft} />
    </>
  );
}
