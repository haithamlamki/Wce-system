// ============================================================================
//  Workbook Import wizard — parse (client, strict) → preview per sheet →
//  stage (server) → commit (transactional) → reconciliation summary, wrapped
//  in the prototype design language (section-head, panel, tbl-scroll, btn,
//  st badges). Dashboard/Master are never imported (derived). Rollback is
//  available on committed batches until a unit receives newer field entries.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTubular } from '../state/TubularContext';
import { parseTubularWorkbook, toStageRows, type ParsedWorkbook } from '../lib/workbookImport';

interface BatchRow {
  id: string; filename: string; status: string; uploaded_at: string;
  stats: Record<string, number> | null;
}

const BATCH_ST: Record<string, string> = {
  committed: 'surplus', staged: 'balanced', rolled_back: 'nodata', failed: 'short',
};

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function ImportView() {
  const { hasPerm } = useTubular();
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [filename, setFilename] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [phase, setPhase] = useState<'pick' | 'preview' | 'committing' | 'done'>('pick');
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<BatchRow[]>([]);

  const loadBatches = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('import_batches')
      .select('id, filename, status, uploaded_at, stats')
      .order('uploaded_at', { ascending: false })
      .limit(10);
    setBatches((data ?? []) as BatchRow[]);
  }, []);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const buf = await f.arrayBuffer();
      setFileHash(await sha256Hex(buf));
      setFilename(f.name);
      setParsed(await parseTubularWorkbook(buf));
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stageAndCommit = async () => {
    if (!supabase || !parsed) return;
    setPhase('committing'); setError('');
    try {
      const { data: staged, error: e1 } = await supabase.rpc('stage_import', {
        p_filename: filename, p_file_hash: fileHash, p_rows: toStageRows(parsed),
      });
      if (e1) throw new Error(e1.message);
      const { data: committed, error: e2 } = await supabase.rpc('commit_import', {
        p_batch_id: (staged as { batch_id: string }).batch_id,
      });
      if (e2) throw new Error(e2.message);
      setResult(committed as Record<string, number>);
      setPhase('done');
      await loadBatches();
    } catch (e) {
      setError(`Import failed — nothing was written. ${e instanceof Error ? e.message : String(e)}`);
      setPhase('preview');
    }
  };

  const rollback = async (id: string) => {
    if (!supabase) return;
    setError('');
    const { error: e } = await supabase.rpc('rollback_import', { p_batch_id: id });
    if (e) setError(`Rollback refused: ${e.message}`);
    await loadBatches();
  };

  if (!hasPerm('import')) {
    return (
      <section className="view">
        <div className="empty-cert"><div className="ico">⬆</div><div className="title">Workbook Import</div><div className="desc">You do not have the import permission.</div></div>
      </section>
    );
  }

  return (
    <section className="view" id="view-import">
      <div className="section-head">
        <div className="section-title">Workbook Import</div>
        <div className="section-sub">Monthly Tubular Monitoring workbook · staged, previewed, committed transactionally</div>
      </div>

      <div className="amap-note" style={{ marginBottom: 14 }}>
        Imports every Rig/Hoist sheet. Dashboard and Master are derived and are not import sources.
        Nothing is written until you confirm the preview; a committed import can be rolled back until
        a unit receives newer field entries.
      </div>

      {error && (
        <div role="alert" className="panel" style={{ borderColor: 'var(--red)', color: 'var(--red-2)', marginBottom: 14, fontSize: 12.5 }}>
          {error}
        </div>
      )}

      {phase === 'pick' && (
        <label className="btn" style={{ display: 'inline-flex' }}>
          ⬆ Choose workbook (.xlsx)…
          <input type="file" accept=".xlsx" style={{ display: 'none' }}
            onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      )}

      {parsed && phase !== 'pick' && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h3>Preview — {filename}</h3>
            <span className="badge">{parsed.stats.unitSheets} unit sheets · {parsed.stats.dataRows} rows</span>
          </div>

          <div className="unit-bar" style={{ marginBottom: 12 }}>
            <span className="meta-chip">Errors: <span className="v" style={{ color: parsed.stats.errorRows ? 'var(--red-2)' : 'var(--green)' }}>{parsed.stats.errorRows}</span></span>
            <span className="meta-chip">Reported-total overrides: <span className="v" style={{ color: 'var(--c-class3)' }}>{parsed.stats.overrideRows}</span></span>
            <span className="meta-chip">Contract: <span className="v">{parsed.stats.totals.onContract}</span></span>
            <span className="meta-chip">Premium: <span className="v">{parsed.stats.totals.premium}</span></span>
            <span className="meta-chip">C2: <span className="v">{parsed.stats.totals.class2}</span></span>
            <span className="meta-chip">C3: <span className="v">{parsed.stats.totals.class3}</span></span>
            <span className="meta-chip">Scrap: <span className="v">{parsed.stats.totals.scrap}</span></span>
            <span className="meta-chip">Needs Insp: <span className="v">{parsed.stats.totals.needsInspection}</span></span>
          </div>

          {parsed.globalIssues.length > 0 && (
            <ul style={{ color: 'var(--text-3)', fontSize: 12, margin: '0 0 12px 18px' }}>
              {parsed.globalIssues.map((i, k) => <li key={k}>[{i.level}] {i.message}</li>)}
            </ul>
          )}

          <div className="tbl-scroll">
            <table>
              <thead>
                <tr><th>Sheet</th><th className="mono">Date</th><th className="mono">Rows</th><th className="mono">Errors</th><th className="mono">Warnings</th><th className="mono">Overrides</th><th>Contract Ref</th></tr>
              </thead>
              <tbody>
                {parsed.units.map((u) => {
                  const errs = u.rows.reduce((n, r) => n + (r.issues.some((i) => i.level === 'error') ? 1 : 0), 0);
                  const warns = u.rows.reduce((n, r) => n + r.issues.filter((i) => i.level === 'warning').length, 0) + u.issues.filter((i) => i.level === 'warning').length;
                  return (
                    <tr key={u.sheetName}>
                      <td className="mono">{u.sheetName}</td>
                      <td className="num">{u.dateOfUpdate ?? '—'}</td>
                      <td className="num">{u.rows.length}</td>
                      <td className="num" style={{ color: errs ? 'var(--red-2)' : undefined }}>{errs}</td>
                      <td className="num" style={{ color: warns ? 'var(--c-class3)' : undefined }}>{warns}</td>
                      <td className="num">{u.rows.filter((r) => r.onBoardReported != null).length}</td>
                      <td style={{ color: 'var(--text-3)' }}>{u.contractRef ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
            {phase === 'preview' && (
              <>
                <button className="btn" onClick={() => void stageAndCommit()}>
                  Stage &amp; commit {parsed.stats.dataRows - parsed.stats.errorRows} rows
                </button>
                <button className="btn alt" onClick={() => { setParsed(null); setPhase('pick'); }}>Cancel</button>
              </>
            )}
            {phase === 'committing' && <span style={{ color: 'var(--text-3)', fontSize: 12.5 }}>Committing…</span>}
            {phase === 'done' && result && (
              <span className="st surplus">
                ✔ Committed — inserted {result.inserted} · updated {result.updated} · skipped {result.skipped}
              </span>
            )}
          </div>
          {phase === 'done' && result && (
            <div className="amap-note" style={{ marginTop: 10 }}>
              Verify the Dashboard/Master totals against the workbook. Roll back below if anything is off.
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Recent Imports</h3>
          <span className="badge">{batches.length} batches</span>
        </div>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr><th>When</th><th>File</th><th>Status</th><th>Result</th><th /></tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No imports yet.</td></tr>
              )}
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{new Date(b.uploaded_at).toLocaleString()}</td>
                  <td>{b.filename}</td>
                  <td><span className={`st ${BATCH_ST[b.status] ?? 'nodata'}`}>{b.status.replace('_', ' ').toUpperCase()}</span></td>
                  <td style={{ color: 'var(--text-3)' }}>
                    {b.stats ? `staged ${b.stats.staged ?? '—'} · inserted ${b.stats.inserted ?? '—'} · updated ${b.stats.updated ?? '—'} · skipped ${b.stats.skipped ?? '—'}` : ''}
                  </td>
                  <td>
                    {b.status === 'committed' && (
                      <button className="btn-tr danger" onClick={() => void rollback(b.id)}>Roll back</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
