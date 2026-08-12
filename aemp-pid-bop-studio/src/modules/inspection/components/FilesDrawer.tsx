// ============================================================================
//  FilesDrawer — drag-drop multi-file upload per record, typed by the six
//  documentation kinds + Other; certificates carry an optional expiry date.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { deleteFile, getSignedUrl, listFiles, uploadFile } from '../lib/files';
import { useInspection } from '../state/InspectionContext';
import { CERTIFICATE_KINDS, FILE_KIND_LABELS, type FileKind, type InspFile,
  type InspectionRecord } from '../types';

function fmtSize(b: number): string {
  return b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function FilesDrawer({ record, onClose }: {
  record: InspectionRecord; onClose: () => void;
}) {
  const { can } = useInspection();
  const editable = can('insp_manage_files');
  const [files, setFiles] = useState<InspFile[]>([]);
  const [kind, setKind] = useState<FileKind>('inspection_certificate');
  const [expiry, setExpiry] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isCert = CERTIFICATE_KINDS.includes(kind);

  const reload = useCallback(() => {
    listFiles(record.id).then(setFiles).catch((e) => setErr((e as Error).message));
  }, [record.id]);
  useEffect(reload, [reload]);

  const doUpload = async (list: FileList | File[]) => {
    setBusy(true); setErr(null);
    try {
      for (const f of Array.from(list)) {
        await uploadFile(record.id, kind, f, isCert && expiry ? expiry : null);
      }
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="insp-drawer" role="dialog" aria-label="Record files">
      <div className="insp-toolbar">
        <b>Files — {record.serialNumber || record.typeName}</b>
        <div style={{ flex: 1 }} />
        <button className="insp-btn" onClick={onClose}>✕ Close</button>
      </div>

      {editable && (
        <>
          <div className="insp-form-grid" style={{ marginBottom: 10 }}>
            <div className="insp-field"><label>Document kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as FileKind)}>
                {(Object.entries(FILE_KIND_LABELS) as [FileKind, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select></div>
            {isCert && (
              <div className="insp-field"><label>Certificate expiry (optional)</label>
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
            )}
          </div>
          <div className={`insp-dropzone${drag ? ' drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files); }}>
            {busy ? 'Uploading…' : 'Drag & drop files here, or'}
            <div style={{ marginTop: 8 }}>
              <input type="file" multiple disabled={busy}
                onChange={(e) => e.target.files && doUpload(e.target.files)} />
            </div>
          </div>
        </>
      )}
      {err && <div style={{ color: '#d33', fontSize: 12, marginTop: 8 }}>{err}</div>}

      <div style={{ marginTop: 12 }}>
        {files.map((f) => (
          <div key={f.id} className="insp-card" style={{ marginBottom: 6, padding: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fileName}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                {FILE_KIND_LABELS[f.kind]} · {fmtSize(f.fileSize)}
                {f.expiryDate && <> · expires {f.expiryDate}</>}
              </div>
            </div>
            <button className="insp-btn" onClick={async () => {
              try { window.open(await getSignedUrl(f.storagePath), '_blank'); }
              catch (e) { alert((e as Error).message); }
            }}>Open</button>
            {editable && (
              <button className="insp-btn" onClick={() => {
                if (confirm(`Delete ${f.fileName}?`)) deleteFile(f).then(reload).catch((e) => alert((e as Error).message));
              }}>🗑</button>
            )}
          </div>
        ))}
        {files.length === 0 && <div style={{ color: 'var(--dim)', fontSize: 12.5, textAlign: 'center', padding: 16 }}>No files yet.</div>}
      </div>
    </div>
  );
}
