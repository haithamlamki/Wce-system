// ============================================================================
//  Annual Maintenance — import the office "Maintenance Plan" workbook.
//  Pick file → confirm rig / project name → preview totals, warnings and the
//  diff against the stored revision → import (one transaction). Re-importing
//  the same project name replaces the plan's lines and logs a new revision,
//  which is how the sheet's changes up to day zero are carried in.
// ============================================================================
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Card } from './ui';
import { breakdown, bySection, pct, type AmPlan } from '../lib/am';
import { fetchPlan, importPlan } from '../lib/amApi';
import { choosePlanSheet, diffPlans, guessRig, parsePlanSheet, readWorkbook, type ParsedPlan, type PlanDiff } from '../lib/amImport';

interface Rig { id: string; name: string }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function AmImportPanel({ rigs, plans, fixedRigId, onClose, onImported }: {
  rigs: Rig[]; plans: AmPlan[]; fixedRigId?: string;
  onClose: () => void; onImported: (planId: string) => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [rigId, setRigId] = useState(fixedRigId ?? '');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [diff, setDiff] = useState<PlanDiff | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const existing = useMemo(() => plans.find((p) => p.rigId === rigId && same(p.title, title)), [plans, rigId, title]);

  const loadDiff = async (p: ParsedPlan, rig: string, t: string) => {
    const match = plans.find((x) => x.rigId === rig && same(x.title, t));
    setDiff(null);
    if (!match) return;
    try { setDiff(diffPlans((await fetchPlan(match.id)).items, p.items)); } catch { /* preview only */ }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name); setParsed(null); setErr(null); setDone(null); setDiff(null);
    try {
      const p = parsePlanSheet(choosePlanSheet(await readWorkbook(f)));
      if (!p.items.length) throw new Error('No equipment lines were found under the header row.');
      const rig = fixedRigId ?? guessRig(p.title, rigs)?.id ?? '';
      setParsed(p); setRigId(rig); setTitle(p.title); setYear(p.year ? String(p.year) : '');
      if (rig) await loadDiff(p, rig, p.title);
    } catch (e) { setErr((e as Error).message); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const y = Math.trunc(Number(year));
  const yearOk = y >= 2000 && y <= 2200;
  const blocked = !parsed || !rigId || !title.trim() || !yearOk || !!existing?.finalizedAt;

  const run = async () => {
    if (!parsed || blocked) return;
    setBusy(true); setErr(null);
    const b = breakdown(parsed.items);
    try {
      const id = await importPlan({
        rigId, title, year: y, plannedStart: parsed.plannedStart, plannedEnd: parsed.plannedEnd, fileName,
        items: parsed.items,
        summary: {
          lines: parsed.items.length, active: b.total, completed: b.completed, inProgress: b.inProgress,
          notStarted: b.notStarted, progress: Math.round(b.progress * 1000) / 1000, warnings: parsed.warnings.length,
          ...(diff ? { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, tasksDone: diff.tasksDone } : {}),
        },
      });
      setDone(existing ? `Revision ${existing.revision + 1} of "${title}" imported.` : `"${title}" imported.`);
      setParsed(null); setDiff(null);
      await onImported(id);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const b = parsed ? breakdown(parsed.items) : null;
  const mismatch = parsed && b && parsed.reported.totalTasks !== null
    && (parsed.reported.totalTasks !== b.total || (parsed.reported.completed !== null && parsed.reported.completed !== b.completed));
  const note = (color: string, children: ReactNode) => (
    <div style={{ color, fontSize: 12.5, marginTop: 8 }}>{children}</div>);

  return (
    <Card title="Import maintenance plan from Excel"
      extra={<button type="button" className="insp-iconbtn" aria-label="Close" onClick={onClose}>✕</button>}>
      <p style={{ marginTop: 0, color: 'var(--i-muted)', fontSize: 12.5 }}>
        Upload the rig&apos;s <b>Maintenance Plan – Gantt Chart</b> workbook as the office keeps it (the
        &quot;Maintenance Plan&quot; sheet: project name and dates on top, then sections, equipment lines and their
        scope-of-work checklists). Importing the same project name again replaces the plan with the new revision and
        keeps a history entry — re-import as often as the sheet changes until day zero. Finalized plans are locked.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="insp-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          Choose workbook…</button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.xlsm" aria-label="Maintenance plan workbook"
          onChange={(e) => void pick(e.target.files?.[0])} />
        {fileName && <span style={{ color: 'var(--i-muted)', fontSize: 12.5 }}>{fileName}</span>}
      </div>

      {err && note('var(--i-danger)', err)}
      {done && note('var(--i-success)', done)}

      {parsed && b && (
        <div style={{ marginTop: 14 }}>
          <div className="insp-filterrow" style={{ marginBottom: 10 }}>
            <label className="fld"><span>Rig</span>
              <select className="insp-input" value={rigId} disabled={!!fixedRigId}
                onChange={(e) => { setRigId(e.target.value); void loadDiff(parsed, e.target.value, title); }}>
                <option value="">— choose rig —</option>
                {rigs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="fld"><span>Project name</span>
              <input className="insp-input" value={title} maxLength={120} style={{ width: 220 }}
                onChange={(e) => setTitle(e.target.value)} onBlur={() => void loadDiff(parsed, rigId, title)} />
            </label>
            <label className="fld"><span>Plan year</span>
              <input className="insp-input" type="number" min={2000} max={2200} value={year} style={{ width: 100 }}
                onChange={(e) => setYear(e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
            <span><b>{parsed.items.length}</b> equipment lines</span>
            <span><b>{b.total}</b> active · <b>{b.notApplicable}</b> not applicable</span>
            <span><b>{b.completed}</b> completed · <b>{b.inProgress}</b> in progress · <b>{b.notStarted}</b> not started</span>
            <span><b>{b.tasks}</b> checklist items</span>
            <span>Progress <b>{pct(b.progress)}</b></span>
            <span>Window <b>{parsed.plannedStart ?? '—'}</b> → <b>{parsed.plannedEnd ?? '—'}</b></span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--i-muted)', marginTop: 6 }}>
            {bySection(parsed.items).map((s) => `${s.section}: ${s.b.total} (${pct(s.b.progress)})`).join('  ·  ')}
          </div>
          {mismatch && note('var(--i-warning)', <>
            The sheet header says {parsed.reported.totalTasks} tasks / {parsed.reported.completed} completed; the lines
            read give {b.total} / {b.completed}. Check the sheet for rows outside the table.</>)}
          {!rigId && note('var(--i-danger)', 'Choose the rig this plan belongs to.')}
          {!yearOk && note('var(--i-danger)', 'Enter the plan year.')}
          {existing?.finalizedAt && note('var(--i-danger)',
            `"${existing.title}" is finalized. Reopen it on its plan page to import a new revision.`)}
          {existing && !existing.finalizedAt && note('inherit', <>
            Updates <b>{existing.title}</b> (currently revision {existing.revision})
            {diff && <> — {diff.added.length} lines added, {diff.removed.length} removed, {diff.changed.length} changed,
              {' '}{diff.tasksDone} checklist items newly done{diff.tasksUndone ? `, ${diff.tasksUndone} un-done` : ''}.</>}</>)}
          {!existing && rigId && note('inherit', 'Creates a new plan; the rig\'s contract terms are copied into it.')}

          {parsed.warnings.length > 0 && (
            <ul style={{ maxHeight: 160, overflow: 'auto', margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
              {parsed.warnings.slice(0, 200).map((w, i) => <li key={i} style={{ color: 'var(--i-warning)' }}>Row {w.row}: {w.message}</li>)}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="insp-btn primary" disabled={busy || blocked} onClick={() => void run()}>
              {busy ? 'Importing…' : existing ? 'Import new revision' : 'Import plan'}</button>
            <button type="button" className="insp-btn" disabled={busy} onClick={() => setParsed(null)}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}
