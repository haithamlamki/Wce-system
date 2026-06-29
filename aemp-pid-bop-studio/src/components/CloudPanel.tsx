// Cloud projects panel (PRD FR-59) — save the current project to Supabase and
// reopen any saved project. Shown only when Supabase is configured.
import { useEffect, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import type { ProjectSummary } from '../lib/cloud';

export default function CloudPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { saveCloud, listCloud, loadCloud, cloudId } = useProject();
  const [rows, setRows] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = () => listCloud().then(setRows).catch((e) => setMsg(e.message));
  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line */ }, [open]);

  if (!open) return null;

  async function save() {
    setBusy(true); setMsg('');
    try { const id = await saveCloud(); setMsg(id ? 'Saved to cloud ✓' : 'Cloud not configured'); await refresh(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function open_(id: string) {
    setBusy(true); setMsg('');
    try { await loadCloud(id); setMsg('Loaded ✓'); onClose(); }
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
        <button style={primary} disabled={busy} onClick={save}>Save current project{cloudId ? ' (update)' : ''}</button>
        {msg && <div style={{ fontSize: 12, color: 'var(--accent)', margin: '8px 0' }}>{msg}</div>}
        <div style={{ marginTop: 12, maxHeight: '46vh', overflowY: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ color: 'var(--faint)', fontSize: 13, padding: '10px 0' }}>No saved projects yet.</div>
          ) : rows.map((r) => (
            <button key={r.id} style={row} disabled={busy} onClick={() => open_(r.id)}>
              <span style={{ fontWeight: 600 }}>{r.rig_name}</span>
              <span style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                {r.reference_date || '—'} · {new Date(r.updated_at).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(8,16,24,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 22, width: 460, boxShadow: 'var(--shadow)' };
const primary: React.CSSProperties = { width: '100%', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const row: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 8, cursor: 'pointer', marginBottom: 6, color: 'var(--ink)', textAlign: 'left' };
