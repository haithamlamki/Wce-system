// ============================================================================
//  Help — generated User Manual + Symbols Guide (printable) and the rig
//  manuals library (admin upload/remove; everyone view + download).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { useAuth } from '../state/AuthContext';
import { USER_MANUAL_HTML, symbolsGuideHtml } from '../lib/manualContent';
import { deleteManual, getManualUrl, listManuals, uploadManual, type ManualRow } from '../lib/cloud';

type Tab = 'manual' | 'symbols' | 'rig';

function printDoc(title: string, html: string) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print / save as PDF.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font:14px/1.6 Inter,system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 18px;color:#1b2a38}
    h1{font-size:22px} h2{font-size:16px;margin-top:22px;border-bottom:1px solid #dde3e9;padding-bottom:4px}
    code{background:#f1f4f7;padding:1px 5px;border-radius:4px;font-size:12.5px} ul,ol{padding-left:20px}</style>
    </head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>`);
  w.document.close();
}

export default function HelpView() {
  const { canEdit, cloudEnabled } = useProject();
  const { rig } = useAuth();
  const [tab, setTab] = useState<Tab>('manual');
  const symbols = useMemo(() => symbolsGuideHtml(), []);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['manual', 'User Manual'], ['symbols', 'Symbols Guide'], ['rig', 'Rig Manuals']] as Array<[Tab, string]>).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...seg, ...(tab === t ? segOn : {}) }}>{label}</button>
        ))}
      </div>

      {tab === 'manual' && <Doc title="AEMP P&ID & BOP Studio — User Manual" html={USER_MANUAL_HTML} />}
      {tab === 'symbols' && <Doc title="Symbols Guide" html={symbols} />}
      {tab === 'rig' && <RigManuals canEdit={canEdit} cloudEnabled={cloudEnabled} rig={rig} />}
    </div>
  );
}

function Doc({ title, html }: { title: string; html: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button style={btn} onClick={() => printDoc(title, html)}>⎙ Print / Save PDF</button>
      </div>
      <article style={doc} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function RigManuals({ canEdit, cloudEnabled, rig }: { canEdit: boolean; cloudEnabled: boolean; rig: string | null }) {
  const [rows, setRows] = useState<ManualRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');

  const refresh = () => listManuals().then(setRows).catch((e) => { setMsg(`Manuals unavailable — apply migration 0007. (${e.message})`); setRows([]); });
  useEffect(() => { if (cloudEnabled) refresh(); else setRows([]); /* eslint-disable-next-line */ }, [cloudEnabled]);

  async function upload() {
    if (!file || !title.trim()) { setMsg('Pick a file and enter a title.'); return; }
    setBusy(true); setMsg('');
    try { await uploadManual(file, title.trim(), rig); setTitle(''); setFile(null); await refresh(); setMsg('Uploaded ✓'); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  async function open(path: string) {
    try { const url = await getManualUrl(path); if (url) window.open(url, '_blank'); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function remove(m: ManualRow) {
    if (!confirm(`Delete manual "${m.title}"?`)) return;
    setBusy(true);
    try { await deleteManual(m.id, m.path); await refresh(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  const builtIn = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: 8, marginBottom: 10 }}>
      <div>
        <div style={{ fontWeight: 600 }}>Rig 103 — original P&amp;ID (Excel)</div>
        <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>Rig 103 · hand-drawn source register + diagram</div>
      </div>
      <a href="refs/rig103-pid-source.xlsx" download style={{ ...btn, textDecoration: 'none', color: 'var(--accent)' }}>Download</a>
    </div>
  );

  if (!cloudEnabled) return <div style={{ maxWidth: 760 }}>{builtIn}<div style={doc}>Connect the cloud (Supabase) to store and download additional rig manuals.</div></div>;

  return (
    <div style={{ maxWidth: 760 }}>
      {builtIn}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: 12 }}>
          <input style={inp} placeholder="Manual title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12 }} />
          <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{rig ? `rig ${rig}` : 'global'}</span>
          <button style={{ ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} disabled={busy} onClick={upload}>Upload</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10 }}>{msg}</div>}

      {rows === null ? <div style={{ color: 'var(--faint)' }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: 'var(--faint)' }}>No manuals uploaded yet.</div>
          : rows.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>{m.rig_name || 'global'} · {new Date(m.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btn} onClick={() => open(m.path)}>Download</button>
                {canEdit && <button style={{ ...btn, color: 'var(--red)' }} disabled={busy} onClick={() => remove(m)}>Delete</button>}
              </div>
            </div>
          ))}
    </div>
  );
}

const seg: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--dim)', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const segOn: React.CSSProperties = { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
const btn: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', borderRadius: 7, padding: '7px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const inp: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontSize: 12.5, flex: '1 1 200px' };
const doc: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 12, padding: '20px 26px', lineHeight: 1.65, fontSize: 14, maxWidth: 860, boxShadow: 'var(--shadow)' };
