// ============================================================================
//  FilesDrawer — drag-drop multi-file upload per record, typed by the six
//  documentation kinds + Other; certificates carry an optional expiry date.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { deleteFile, getSignedUrl, listFiles, uploadFile } from '../lib/files';
import { useInspection } from '../state/InspectionContext';
import { CERTIFICATE_KINDS, FILE_KIND_LABELS, type FileKind, type InspFile,
  type InspectionRecord } from '../types';
import CertificateExtractPanel from './CertificateExtractPanel';
import Icon from './Icon';

function fmtSize(b: number): string {
  return b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function FilesDrawer({ record, onClose, onRecordChanged }: {
  record: InspectionRecord; onClose: () => void; onRecordChanged?: () => void;
}) {
  const { can } = useInspection();
  const editable = can('insp_manage_files');
  const [files, setFiles] = useState<InspFile[]>([]);
  const [kind, setKind] = useState<FileKind>('inspection_certificate');
  const [expiry, setExpiry] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The PDF the user asked to read. Extraction is opt-in per file so uploading
  // never triggers surprise parsing.
  const [readFile, setReadFile] = useState<File | null>(null);
  const [lastPdfs, setLastPdfs] = useState<File[]>([]);
  const isCert = CERTIFICATE_KINDS.includes(kind);

  const reload = useCallback(() => {
    listFiles(record.id).then(setFiles).catch((e) => setErr((e as Error).message));
  }, [record.id]);
  useEffect(reload, [reload]);

  const doUpload = async (list: FileList | File[]) => {
    setBusy(true); setErr(null);
    try {
      const chosen = Array.from(list);
      for (const f of chosen) {
        await uploadFile(record.id, kind, f, isCert && expiry ? expiry : null);
      }
      setLastPdfs(chosen.filter((f) => /\.pdf$/i.test(f.name)));
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
      {err && <div style={{ color: 'var(--i-danger)', fontSize: 12, marginTop: 8 }}>{err}</div>}

      {lastPdfs.length > 0 && !readFile && (
        <div className="insp-card" style={{ marginTop: 10, fontSize: 12.5 }}>
          <div style={{ marginBottom: 8 }}>
            Read the certificate to fill this record&apos;s fields? The file is parsed in your
            browser and nothing is saved until you confirm.
          </div>
          <div className="insp-toolbar" style={{ marginBottom: 0 }}>
            {lastPdfs.map((f) => (
              <button key={f.name} type="button" className="insp-btn sm"
                onClick={() => setReadFile(f)}>
                <Icon name="documents" /> Read {f.name}
              </button>
            ))}
            <div className="grow">
              <button type="button" className="insp-btn sm" onClick={() => setLastPdfs([])}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {readFile && (
        <CertificateExtractPanel
          record={record}
          file={readFile}
          onClose={() => { setReadFile(null); setLastPdfs([]); }}
          onApplied={() => onRecordChanged?.()}
        />
      )}

      <div style={{ marginTop: 12 }}>
        {files.map((f) => (
          <div key={f.id} className="insp-card" style={{ marginBottom: 6, padding: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fileName}</div>
              <div style={{ fontSize: 11, color: 'var(--i-muted)' }}>
                {FILE_KIND_LABELS[f.kind]} · {fmtSize(f.fileSize)}
                {f.expiryDate && <> · expires {f.expiryDate}</>}
              </div>
            </div>
            <button className="insp-btn" onClick={async () => {
              try { window.open(await getSignedUrl(f.storagePath), '_blank'); }
              catch (e) { alert((e as Error).message); }
            }}>Open</button>
            {/\.pdf$/i.test(f.fileName) && (
              <button className="insp-btn" title="Read fields from this certificate"
                onClick={async () => {
                  setErr(null);
                  try {
                    const url = await getSignedUrl(f.storagePath);
                    const blob = await fetch(url).then((r) => r.blob());
                    setReadFile(new File([blob], f.fileName, { type: 'application/pdf' }));
                  } catch (e) { setErr((e as Error).message); }
                }}>Read</button>
            )}
            {editable && (
              <button className="insp-btn" onClick={() => {
                if (confirm(`Delete ${f.fileName}?`)) deleteFile(f).then(reload).catch((e) => alert((e as Error).message));
              }}>🗑</button>
            )}
          </div>
        ))}
        {files.length === 0 && <div style={{ color: 'var(--i-muted)', fontSize: 12.5, textAlign: 'center', padding: 16 }}>No files yet.</div>}
      </div>
    </div>
  );
}
