// ============================================================================
//  Library — replicates the reference `/library` page: a two-pane explorer with
//  a "Library" folder tree beside a "Files" list showing name, size and date.
//  Upload / new folder / delete stay gated on insp_manage_files, and files are
//  always opened through a signed URL.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import {
  createLibraryFolder, deleteLibraryFile, libraryUrl, listLibrary, uploadLibraryFile,
} from '../lib/library';
import type { LibraryEntry } from '../lib/library';
import { formatBytes } from '../lib/format';
import { Card, EmptyState, LoadingState, PageHeader } from '../components/ui';
import Icon from '../components/Icon';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The Library pane dates read `Aug 13, 2026` in the reference. */
function fileDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export default function LibraryView() {
  const { can } = useInspection();
  const editable = can('insp_manage_files');
  const [prefix, setPrefix] = useState('');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    listLibrary(prefix)
      .then((e) => { setEntries(e); setErr(null); })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [prefix]);
  useEffect(reload, [reload]);

  const crumbs = prefix ? prefix.split('/') : [];
  const files = entries.filter((e) => !e.isFolder);
  const folders = entries.filter((e) => e.isFolder);

  const open = async (path: string, download?: string) => {
    try {
      const url = await libraryUrl(path);
      if (download) {
        const a = document.createElement('a');
        a.href = url; a.download = download; a.click();
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Library"
        subtitle="Browse, upload and manage shared documents."
        actions={editable ? (
          <>
            <button type="button" className="insp-btn" disabled={busy} onClick={async () => {
              const name = window.prompt('New folder name');
              if (!name?.trim()) return;
              setBusy(true);
              try { await createLibraryFolder(prefix, name); reload(); }
              catch (e) { setErr((e as Error).message); }
              finally { setBusy(false); }
            }}>
              <Icon name="library" /> New folder
            </button>
            <label className="insp-btn primary" style={{ cursor: 'pointer' }}>
              <Icon name="upload" /> Upload file
              <input type="file" style={{ display: 'none' }} disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy(true);
                  try { await uploadLibraryFile(prefix, f); reload(); }
                  catch (ex) { setErr((ex as Error).message); }
                  finally { setBusy(false); }
                }} />
            </label>
          </>
        ) : undefined}
      />

      {err && (
        <div className="insp-card" style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--i-danger)' }} role="alert">
          {err}
        </div>
      )}

      <div className="insp-split">
        <Card title="Library">
          <div className="insp-tree">
            <button type="button" className={prefix === '' ? 'active' : ''}
              onClick={() => setPrefix('')}>
              <Icon name="library" /> Library
            </button>
            {crumbs.map((c, i) => (
              <button key={crumbs.slice(0, i + 1).join('/')} type="button"
                className={i === crumbs.length - 1 ? 'active' : ''}
                style={{ paddingLeft: 12 + (i + 1) * 12 }}
                onClick={() => setPrefix(crumbs.slice(0, i + 1).join('/'))}>
                <Icon name="library" /> {c}
              </button>
            ))}
            {folders.map((f) => (
              <button key={f.name} type="button"
                style={{ paddingLeft: 12 + (crumbs.length + 1) * 12 }}
                onClick={() => setPrefix(prefix ? `${prefix}/${f.name}` : f.name)}>
                <Icon name="library" /> {f.name}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Files">
          {loading && <LoadingState label="Loading files…" />}
          {!loading && files.length === 0 && (
            <EmptyState
              ico="🗀" title="This folder is empty"
              desc={editable
                ? 'Upload the user guide and inspection manuals here.'
                : 'No documents have been published to this folder.'}
            />
          )}
          {!loading && files.length > 0 && (
            <div className="insp-table-wrap" style={{ border: 0 }}>
              <table className="insp-table">
                <tbody>
                  {files.map((f) => {
                    const path = prefix ? `${prefix}/${f.name}` : f.name;
                    return (
                      <tr key={f.name}>
                        <td style={{ width: 28 }}><Icon name="documents" /></td>
                        <td style={{ width: '100%' }}>{f.name}</td>
                        <td className="num">{formatBytes(f.size)}</td>
                        <td>{fileDate(f.updatedAt)}</td>
                        <td>
                          <div className="rowacts">
                            <button type="button" className="insp-btn sm"
                              onClick={() => open(path)}>Preview</button>
                            <button type="button" className="insp-iconbtn sm" title="Download"
                              aria-label={`Download ${f.name}`}
                              onClick={() => open(path, f.name)}><Icon name="download" /></button>
                            {editable && (
                              <button type="button" className="insp-iconbtn sm danger" title="Delete"
                                aria-label={`Delete ${f.name}`}
                                onClick={() => {
                                  if (!window.confirm(`Delete ${f.name}?`)) return;
                                  deleteLibraryFile(path).then(reload)
                                    .catch((e) => setErr((e as Error).message));
                                }}><Icon name="delete" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
