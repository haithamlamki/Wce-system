// ============================================================================
//  Library — file explorer (folders via prefixes) with preview/download,
//  plus upload/delete for insp_manage_files holders.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { deleteLibraryFile, libraryUrl, listLibrary, uploadLibraryFile,
  type LibraryEntry } from '../lib/library';
import { EmptyState } from '../InspectionModule';

function fmtSize(b: number): string {
  return b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function LibraryView() {
  const { can } = useInspection();
  const editable = can('insp_manage_files');
  const [prefix, setPrefix] = useState('');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listLibrary(prefix).then(setEntries).catch((e) => setErr((e as Error).message));
  }, [prefix]);
  useEffect(reload, [reload]);

  const crumbs = prefix ? prefix.split('/') : [];
  const files = entries.filter((e) => !e.isFolder);
  const folders = entries.filter((e) => e.isFolder);

  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Library</h2>
        <div style={{ flex: 1 }} />
        {editable && (
          <label className="insp-btn primary" style={{ cursor: 'pointer' }}>
            ⇪ Upload file
            <input type="file" style={{ display: 'none' }} disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try { await uploadLibraryFile(prefix, f); reload(); }
                catch (ex) { alert((ex as Error).message); }
                finally { setBusy(false); }
              }} />
          </label>
        )}
      </div>

      <div className="insp-card">
        <div style={{ fontSize: 12.5, marginBottom: 10 }}>
          <button className="insp-btn" style={{ padding: '2px 8px' }} onClick={() => setPrefix('')}>🗀 Library</button>
          {crumbs.map((c, i) => (
            <span key={i}> / <button className="insp-btn" style={{ padding: '2px 8px' }}
              onClick={() => setPrefix(crumbs.slice(0, i + 1).join('/'))}>{c}</button></span>
          ))}
        </div>

        {folders.map((f) => (
          <div key={f.name} className="insp-card" style={{ marginBottom: 6, padding: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>📁</span>
            <button style={{ border: 0, background: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              onClick={() => setPrefix(prefix ? `${prefix}/${f.name}` : f.name)}>{f.name}</button>
          </div>
        ))}

        <div style={{ fontSize: 11, color: 'var(--dim)', margin: '8px 0 4px' }}>FILES ({files.length})</div>
        {files.map((f) => {
          const path = prefix ? `${prefix}/${f.name}` : f.name;
          return (
            <div key={f.name} className="insp-card" style={{ marginBottom: 6, padding: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: 'var(--dim)' }}>{fmtSize(f.size)} · {f.updatedAt}</div>
              </div>
              <button className="insp-btn" onClick={async () => {
                try { window.open(await libraryUrl(path), '_blank'); }
                catch (e) { alert((e as Error).message); }
              }}>👁 Preview</button>
              {editable && (
                <button className="insp-btn" onClick={() => {
                  if (confirm(`Delete ${f.name}?`)) deleteLibraryFile(path).then(reload).catch((e) => alert((e as Error).message));
                }}>🗑</button>
              )}
            </div>
          );
        })}
        {files.length === 0 && folders.length === 0 && (
          <div style={{ color: 'var(--dim)', fontSize: 12.5, textAlign: 'center', padding: 24 }}>
            This folder is empty{editable ? ' — upload the user guide and inspection manuals here.' : '.'}
          </div>
        )}
      </div>
    </div>
  );
}
