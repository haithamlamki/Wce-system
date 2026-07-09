// Cloud projects panel (PRD FR-59) — save the current project to Supabase,
// reopen any saved project, and browse/restore its revision history.
import { useCallback, useEffect, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import type { ProjectSummary, ProjectVersionSummary } from '../lib/cloud';

export default function CloudPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { saveCloud, listCloud, loadCloud, cloudId, listVersions, restoreVersion } = useProject();
  const [rows, setRows] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [histFor, setHistFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectVersionSummary[] | null>(null);

  // listCloud is a stable useCallback ([] deps in ProjectContext), so wrapping
  // refresh keeps ITS identity stable too — the effect below still fires only
  // when `open` actually changes, not on every render.
  const refresh = useCallback(() => listCloud().then(setRows).catch((e) => setMsg(e.message)), [listCloud]);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  if (!open) return null;

  async function save() {
    setBusy(true); setMsg('');
    try {
      const id = await saveCloud(note.trim() || undefined);
      setMsg(id ? 'Saved to cloud ✓ (revision recorded)' : 'Cloud not configured');
      setNote('');
      await refresh();
      if (id && histFor === id) await openHistory(id); // refresh open history
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function open_(id: string) {
    setBusy(true); setMsg('');
    try { await loadCloud(id); setMsg('Loaded ✓'); onClose(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function openHistory(id: string) {
    setVersions(null);
    try { setVersions(await listVersions(id)); }
    catch (e) { setMsg(`History unavailable — apply migration 0005. (${(e as Error).message})`); setVersions([]); }
  }
  async function toggleHistory(id: string) {
    if (histFor === id) { setHistFor(null); return; }
    setHistFor(id); await openHistory(id);
  }
  async function restore(versionId: string) {
    if (!confirm('Restore this version onto the canvas? It replaces the current project (Save afterwards to record it as a new revision).')) return;
    setBusy(true); setMsg('');
    try { await restoreVersion(versionId); setMsg('Restored ✓ — review, then Save to keep it.'); onClose(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--disp)', margin: 0 }}>☁ Cloud projects</h2>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--dim)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <input style={inp} placeholder="Revision note (optional) — e.g. 'added kill manifold'" value={note} onChange={(e) => setNote(e.target.value)} />
        <button style={primary} disabled={busy} onClick={save}>Save current project{cloudId ? ' (update)' : ''}</button>
        {msg && <div style={{ fontSize: 12, color: 'var(--accent)', margin: '8px 0' }}>{msg}</div>}

        <div style={{ marginTop: 12, maxHeight: '50vh', overflowY: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ color: 'var(--faint)', fontSize: 13, padding: '10px 0' }}>No saved projects yet.</div>
          ) : rows.map((r) => (
            <div key={r.id} style={{ marginBottom: 6 }}>
              <div style={row}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{r.rig_name}</span>
                  <span style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    {r.reference_date || '—'} · {new Date(r.updated_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={btn} disabled={busy} onClick={() => toggleHistory(r.id)}>{histFor === r.id ? 'Hide' : '⏱ History'}</button>
                  <button style={{ ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} disabled={busy} onClick={() => open_(r.id)}>Open</button>
                </div>
              </div>

              {histFor === r.id && (
                <div style={hist}>
                  {versions === null ? (
                    <div style={{ fontSize: 12, color: 'var(--faint)', padding: '6px 0' }}>Loading…</div>
                  ) : versions.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--faint)', padding: '6px 0' }}>No revisions recorded yet.</div>
                  ) : versions.map((v) => (
                    <div key={v.id} style={histRow}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>rev {v.revision}</span>
                        <span style={{ color: 'var(--faint)', fontSize: 11, marginLeft: 8 }}>{new Date(v.created_at).toLocaleString()}</span>
                        {v.note && <div style={{ fontSize: 11.5 }}>{v.note}</div>}
                      </div>
                      <button style={btn} disabled={busy} onClick={() => restore(v.id)}>Restore</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(8,16,24,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 22, width: 500, boxShadow: 'var(--shadow)' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontSize: 12.5, marginBottom: 8 };
const primary: React.CSSProperties = { width: '100%', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 8 };
const btn: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', color: 'var(--ink)', borderRadius: 7, padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const hist: React.CSSProperties = { border: '1px solid var(--line2)', borderTop: 0, borderRadius: '0 0 8px 8px', padding: '4px 12px', background: 'var(--sunk)' };
const histRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' };
