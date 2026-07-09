// ============================================================================
//  Workbook Import wizard — parse (client, strict) → preview per sheet →
//  stage (server) → commit (transactional) → reconciliation summary.
//  Dashboard/Master are never imported (derived). Rollback is available on
//  committed batches until a unit receives newer field entries (server rule).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTubular } from '../state/TubularContext';
import { parseTubularWorkbook, toStageRows, type ParsedWorkbook } from '../lib/workbookImport';

interface BatchRow {
  id: string; filename: string; status: string; uploaded_at: string;
  stats: Record<string, number> | null;
}

const btn: React.CSSProperties = { border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '7px 14px', borderRadius: 7, fontWeight: 600, cursor: 'pointer' };
const primary: React.CSSProperties = { ...btn, border: 0, background: 'var(--accent)', color: '#fff' };
const tdS: React.CSSProperties = { border: '1px solid var(--line)', padding: '5px 8px', font: '12px var(--mono)', textAlign: 'right' };

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
    return <div className="placeholder"><strong>Workbook Import</strong>You do not have the import permission.</div>;
  }

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16, maxWidth: 1100 }}>
      <h2 style={{ fontFamily: 'var(--disp)', margin: '0 0 4px' }}>Workbook Import</h2>
      <p style={{ color: 'var(--dim)', marginTop: 0, fontSize: 13 }}>
        Imports every Rig/Hoist sheet of the Tubular Monitoring workbook. Dashboard and Master are derived and are not import sources.
        Nothing is written until you confirm the preview; a committed import can be rolled back until a unit receives newer field entries.
      </p>

      {error && <div role="alert" style={{ border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>{error}</div>}

      {phase === 'pick' && (
        <label style={{ ...primary, display: 'inline-block' }}>
          Choose workbook (.xlsx)…
          <input type="file" accept=".xlsx" style={{ display: 'none' }}
            onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      )}

      {parsed && phase !== 'pick' && (
        <>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '10px 0', fontFamily: 'var(--mono)', fontSize: 12 }}>
            <span>{filename}</span>
            <span>{parsed.stats.unitSheets} unit sheets</span>
            <span>{parsed.stats.dataRows} rows</span>
            <span style={{ color: parsed.stats.errorRows ? 'var(--red)' : 'var(--green)' }}>{parsed.stats.errorRows} error rows</span>
            <span style={{ color: 'var(--amber)' }}>{parsed.stats.overrideRows} reported-total overrides</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 10 }}>
            Totals — contract {parsed.stats.totals.onContract} · premium {parsed.stats.totals.premium} · class2 {parsed.stats.totals.class2} · class3 {parsed.stats.totals.class3} · scrap {parsed.stats.totals.scrap} · needs-insp {parsed.stats.totals.needsInspection}
          </div>
          {parsed.globalIssues.length > 0 && (
            <ul style={{ color: 'var(--dim)', fontSize: 12.5 }}>
              {parsed.globalIssues.map((i, k) => <li key={k}>[{i.level}] {i.message}</li>)}
            </ul>
          )}
          <table style={{ borderCollapse: 'collapse', marginBottom: 14 }}>
            <thead>
              <tr>{['SHEET', 'DATE', 'ROWS', 'ERRORS', 'WARNINGS', 'OVERRIDES', 'CONTRACT REF'].map((h) => (
                <th key={h} style={{ ...tdS, background: 'var(--sunk)', color: 'var(--dim)' }}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {parsed.units.map((u) => {
                const errs = u.rows.reduce((n, r) => n + (r.issues.some((i) => i.level === 'error') ? 1 : 0), 0);
                const warns = u.rows.reduce((n, r) => n + r.issues.filter((i) => i.level === 'warning').length, 0) + u.issues.filter((i) => i.level === 'warning').length;
                return (
                  <tr key={u.sheetName}>
                    <td style={{ ...tdS, textAlign: 'left' }}>{u.sheetName}</td>
                    <td style={tdS}>{u.dateOfUpdate ?? '—'}</td>
                    <td style={tdS}>{u.rows.length}</td>
                    <td style={{ ...tdS, color: errs ? 'var(--red)' : undefined }}>{errs}</td>
                    <td style={{ ...tdS, color: warns ? 'var(--amber)' : undefined }}>{warns}</td>
                    <td style={tdS}>{u.rows.filter((r) => r.onBoardReported != null).length}</td>
                    <td style={{ ...tdS, textAlign: 'left', color: 'var(--dim)' }}>{u.contractRef ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {phase === 'preview' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={primary} onClick={() => void stageAndCommit()}>
                Stage &amp; commit {parsed.stats.dataRows - parsed.stats.errorRows} rows
              </button>
              <button style={btn} onClick={() => { setParsed(null); setPhase('pick'); }}>Cancel</button>
            </div>
          )}
          {phase === 'committing' && <div style={{ color: 'var(--dim)' }}>Committing…</div>}
          {phase === 'done' && result && (
            <div style={{ border: '1px solid var(--green)', borderRadius: 8, padding: '10px 14px', color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 13 }}>
              ✔ Committed — inserted {result.inserted} · updated {result.updated} · skipped {result.skipped}. Verify the Dashboard/Master totals against the workbook before approving the migration.
            </div>
          )}
        </>
      )}

      <h3 style={{ fontFamily: 'var(--disp)', marginTop: 26 }}>Recent imports</h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td style={{ ...tdS, textAlign: 'left' }}>{new Date(b.uploaded_at).toLocaleString()}</td>
              <td style={{ ...tdS, textAlign: 'left' }}>{b.filename}</td>
              <td style={tdS}>{b.status}</td>
              <td style={{ ...tdS, textAlign: 'left', color: 'var(--dim)' }}>
                {b.stats ? `staged ${b.stats.staged ?? '—'} · inserted ${b.stats.inserted ?? '—'} · updated ${b.stats.updated ?? '—'} · skipped ${b.stats.skipped ?? '—'}` : ''}
              </td>
              <td style={tdS}>
                {b.status === 'committed' && (
                  <button style={{ ...btn, padding: '3px 10px', color: 'var(--red)' }} onClick={() => void rollback(b.id)}>Roll back</button>
                )}
              </td>
            </tr>
          ))}
          {batches.length === 0 && <tr><td style={{ ...tdS, textAlign: 'left', color: 'var(--faint)' }}>No imports yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
