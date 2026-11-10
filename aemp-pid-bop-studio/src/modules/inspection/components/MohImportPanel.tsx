// ============================================================================
//  Major Overhaul — Excel import panel (dashboard). Pick a file → preview what
//  will be created / updated and every row problem → import. Rows with errors
//  are skipped; warnings are shown but still imported.
// ============================================================================
import { useRef, useState } from 'react';
import { Card } from './ui';
import type { Rig } from '../lib/moh';
import { applyImport, type ImportResult, type MohData } from '../lib/mohApi';
import { downloadTemplate, isBlocking, planImport, readSheet, type ImportPlan } from '../lib/mohImport';

export default function MohImportPanel({ rigs, data, onClose, onImported }: {
  rigs: Rig[]; data: MohData; onClose: () => void; onImported: () => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name); setPlan(null); setErr(null); setResult(null);
    try {
      const aoa = await readSheet(f);
      setPlan(planImport(aoa, { rigs, items: data.items.filter((i) => i.active), units: data.units,
        projects: data.projects, rigMeta: data.rigMeta }));
    } catch (e) { setErr((e as Error).message); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true); setErr(null);
    try {
      const res = await applyImport(plan, (d, t) => setProgress(`${d} / ${t}`));
      setResult(res); setPlan(null);
      await onImported();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false); setProgress('');
  };

  const issues = plan ? [...plan.errors.filter(isBlocking), ...plan.errors.filter((e) => !isBlocking(e))] : [];
  const skipped = new Set(plan?.errors.filter(isBlocking).map((e) => e.row)).size;
  const nothing = plan && !plan.units.length && !plan.rigMeta.length;

  return (
    <Card title="Import from Excel" extra={<button type="button" className="insp-iconbtn" aria-label="Close" onClick={onClose}>✕</button>}>
      <p style={{ marginTop: 0, color: 'var(--i-muted)', fontSize: 12.5 }}>
        One row per equipment unit on a rig. The <b>Rig</b> must be a rig in your scope and <b>Equipment</b> must match the
        equipment master; nothing new is created from the file. Units are matched by asset or equipment number, and only
        the cells you fill in are changed. Add a <b>Planned MOH Year</b> to set that year&apos;s project status, cost,
        vendor and PO / PR. Dates: YYYY-MM-DD or DD/MM/YYYY.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="insp-btn" onClick={() => void downloadTemplate(rigs[0]?.name ?? 'Rig 101')}>
          Download template</button>
        <button type="button" className="insp-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          Choose file…</button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" aria-label="MOH import file"
          onChange={(e) => void pick(e.target.files?.[0])} />
        {fileName && <span style={{ color: 'var(--i-muted)', fontSize: 12.5 }}>{fileName}</span>}
      </div>

      {err && <div style={{ color: 'var(--i-danger)', marginTop: 12 }}>{err}</div>}

      {plan && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
            <span><b>{plan.rows}</b> data rows</span>
            <span><b>{plan.newUnits}</b> new units</span>
            <span><b>{plan.updatedUnits}</b> units updated</span>
            <span><b>{plan.projects.length}</b> project years</span>
            <span><b>{plan.rigMeta.length}</b> rig details</span>
            <span style={{ color: skipped ? 'var(--i-danger)' : undefined }}><b>{skipped}</b> rows skipped</span>
          </div>
          {issues.length > 0 && (
            <ul style={{ maxHeight: 180, overflow: 'auto', margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
              {issues.slice(0, 200).map((e, i) => (
                <li key={i} style={{ color: isBlocking(e) ? 'var(--i-danger)' : 'var(--i-warning)' }}>Row {e.row}: {e.message}</li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button type="button" className="insp-btn primary" disabled={busy || !!nothing} onClick={run}>
              {busy ? `Importing… ${progress}` : 'Import'}</button>
            <button type="button" className="insp-btn" disabled={busy} onClick={() => setPlan(null)}>Cancel</button>
            {nothing && <span style={{ color: 'var(--i-muted)', fontSize: 12.5 }}>Nothing to import.</span>}
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          Imported <b>{result.units}</b> units, <b>{result.projects}</b> project years and <b>{result.rigs}</b> rig details.
          {result.failed.length > 0 && (
            <ul style={{ color: 'var(--i-danger)', margin: '6px 0 0', paddingLeft: 18 }}>
              {result.failed.slice(0, 50).map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
