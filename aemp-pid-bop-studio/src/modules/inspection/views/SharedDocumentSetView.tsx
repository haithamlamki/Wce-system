// ============================================================================
//  One document set (reference `/inspection/shared-documents/:id`):
//  overview, files grouped by category (+ add more), "Edit rigs" (removing a
//  rig unlinks its records after confirmation) and the record link picker —
//  records of one rig grouped by equipment category, saved as a diff.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Combobox, { MultiCombobox } from '../components/Combobox';
import Icon from '../components/Icon';
import { Badge, EmptyState, LoadingState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import {
  addSetFiles, diffLinks, downloadSetFile, fetchDocumentSet, fetchRigRecords, filterRecords, formatSize,
  groupDocuments, groupRecords, linkRecords, listDocumentCategories, unlinkRecord, updateSetRigs,
  type DocumentSet, type PickerRecord, type SetRig,
} from '../lib/sharedDocuments';
import { CategoryInput, SHARED_DOC_ACCEPT } from './SharedDocumentSetFormView';

const errStyle = { color: 'var(--i-danger)', fontSize: 12, margin: '6px 0 0' } as const;
const muted = { color: 'var(--i-muted)' } as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt style={{ ...muted, fontSize: 12 }}>{label}</dt><dd style={{ margin: '2px 0 0' }}>{children}</dd></div>;
}

function AddFiles({ setId, onAdded }: { setId: string; onAdded: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listDocumentCategories().then(setOptions).catch(() => setOptions([])); }, []);
  const add = async () => {
    if (!files.length) return;
    setProgress(0); setErr(null);
    try {
      await addSetFiles(setId, category, files, setProgress);
      setFiles([]); setCategory(''); if (ref.current) ref.current.value = '';
      onAdded();
    } catch (e) { setErr((e as Error).message); } finally { setProgress(null); }
  };
  return (
    <div style={{ borderTop: '1px solid var(--i-border)', marginTop: 14, paddingTop: 12, display: 'grid', gap: 10 }}>
      <b>Add more files</b>
      <div className="insp-field"><label htmlFor="add-files-category">Category for the new files (optional)</label>
        <CategoryInput id="add-files-category" value={category} onChange={setCategory} options={options} /></div>
      <button type="button" className="insp-dropzone" aria-label="Choose files to add" onClick={() => ref.current?.click()}>
        <Icon name="upload" /> {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Click to choose files'}
      </button>
      <input ref={ref} type="file" multiple accept={SHARED_DOC_ACCEPT} hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      {progress !== null && <progress value={progress} max={100} aria-label="Upload progress" style={{ width: '100%' }} />}
      {err && <p style={errStyle}>{err}</p>}
      <div><button type="button" className="insp-btn primary" disabled={!files.length || progress !== null} onClick={add}>
        <Icon name="upload" /> Add files</button></div>
    </div>
  );
}

function EditRigs({ set, onClose, onSaved }: { set: DocumentSet; onClose: () => void; onSaved: (msg: string) => void }) {
  const { units, scopedUnitIds } = useInspection();
  const [chosen, setChosen] = useState(() => set.rigs.map((r) => r.unitId));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units) if (scopedUnitIds.has(u.id)) m.set(u.id, u.name);
    for (const r of set.rigs) if (!m.has(r.unitId)) m.set(r.unitId, r.unitName);
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [units, scopedUnitIds, set.rigs]);
  const dropped = set.rigs.filter((r) => !chosen.includes(r.unitId) && r.linkedRecordCount > 0);
  const save = async () => {
    if (!chosen.length) { setErr('At least one rig is required'); return; }
    if (dropped.length && !window.confirm(`Unlink records?\n\n${dropped.map((r) =>
      `${r.linkedRecordCount} linked record${r.linkedRecordCount === 1 ? '' : 's'} on rig ${r.unitName} will be unlinked`).join('\n')}`)) return;
    setBusy(true);
    try {
      const { unlinked } = await updateSetRigs(set.id, chosen);
      onSaved(unlinked > 0 ? `Rigs updated; ${unlinked} linked record${unlinked === 1 ? '' : 's'} unlinked` : 'Rigs updated');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Edit rigs" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center', zIndex: 60 }}>
      <div className="insp-card" style={{ width: 'min(480px, 92vw)', display: 'grid', gap: 12 }}>
        <div><h3 style={{ margin: 0 }}>Edit rigs</h3><p style={{ ...muted, margin: '4px 0 0' }}>Choose the rigs that share this document set.</p></div>
        <div className="insp-field"><label>Rigs</label>
          <MultiCombobox options={options} selected={chosen} noun="rig" onChange={(v) => { setChosen(v); setErr(''); }}
            placeholder="Select rigs..." searchPlaceholder="Search rigs..." />{err && <p style={errStyle}>{err}</p>}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="insp-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="insp-btn primary" onClick={save} disabled={busy}>Save rigs</button>
        </div>
      </div>
    </div>
  );
}

function LinkPanel({ set, rigs, canDelete, onSaved }: {
  set: DocumentSet; rigs: SetRig[]; canDelete: boolean; onSaved: () => void;
}) {
  const [rigId, setRigId] = useState(rigs[0]?.unitId ?? '');
  const unit = rigs.some((r) => r.unitId === rigId) ? rigId : rigs[0]?.unitId ?? '';
  const saved = useMemo(() => new Set(set.linkedInspectionIds), [set.linkedInspectionIds]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(set.linkedInspectionIds));
  const [records, setRecords] = useState<PickerRecord[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setChosen(new Set(set.linkedInspectionIds)); }, [set.linkedInspectionIds]);
  useEffect(() => {
    if (!unit) return;
    setRecords(null);
    fetchRigRecords(unit).then(setRecords).catch((e: Error) => { setRecords([]); setMsg({ ok: false, text: e.message }); });
  }, [unit]);
  const groups = useMemo(() => groupRecords(filterRecords(records ?? [], q)), [records, q]);
  // The diff spans this rig's records only; links held on other rigs stay untouched.
  const onRig = useMemo(() => new Set((records ?? []).map((r) => r.id)), [records]);
  const { add, remove } = diffLinks([...saved].filter((x) => onRig.has(x)), [...chosen].filter((x) => onRig.has(x)));
  const dirty = add.length > 0 || remove.length > 0;
  const setMany = (ids: string[], on: boolean) => setChosen((s) => {
    const n = new Set(s); for (const x of ids) { if (on) n.add(x); else n.delete(x); } return n;
  });
  const save = async () => {
    if (!dirty || busy) return;
    if (remove.length && !canDelete) { setMsg({ ok: false, text: "You don't have permission to remove links." }); return; }
    setBusy(true); setMsg(null);
    try {
      await linkRecords(set.id, add);
      for (const x of remove) await unlinkRecord(set.id, x);
      setMsg({ ok: true, text: 'Links updated' });
      onSaved();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };
  const rigPicker = rigs.length > 1 && (
    <div className="insp-field" style={{ maxWidth: 320 }}><label htmlFor="link-rig">Rig</label>
      <Combobox id="link-rig" value={unit} onChange={setRigId} options={rigs.map((r) => ({ value: r.unitId, label: r.unitName }))}
        placeholder="Select a rig..." searchPlaceholder="Search rigs..." /></div>
  );
  if (records === null) return <>{rigPicker}<LoadingState /></>;
  if (records.length === 0) return <>{rigPicker}<p style={muted}>No inspection records on this rig.</p></>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rigPicker}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={muted}>Select records to link this document set to.</span>
        {chosen.size > 0 && <Badge tone="info">{chosen.size} selected</Badge>}
      </div>
      <input className="insp-input" type="search" value={q} aria-label="Search inspection records"
        placeholder="Search by serial, type, part, or category…" onChange={(e) => setQ(e.target.value)} />
      {groups.length === 0 ? <p style={muted}>No records match “{q}”.</p> : groups.map((g) => {
        const ids = g.rows.map((r) => r.id);
        const all = ids.every((x) => chosen.has(x));
        const some = ids.some((x) => chosen.has(x));
        return (
          <details key={g.category} style={{ borderBottom: '1px solid var(--i-border)', paddingBottom: 6 }}>
            <summary style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', padding: '6px 0' }}>
              <input type="checkbox" aria-label={`Select all ${g.category}`} checked={all}
                ref={(el) => { if (el) el.indeterminate = !all && some; }}
                onClick={(e) => e.stopPropagation()} onChange={(e) => setMany(ids, e.target.checked)} />
              <b>{g.category}</b> <span style={muted}>({g.rows.length})</span>
            </summary>
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 0 24px', display: 'grid', gap: 4 }}>
              {g.rows.map((r) => (
                <li key={r.id}><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={chosen.has(r.id)} onChange={(e) => setMany([r.id], e.target.checked)} />
                  {r.serialNumber ?? `#${r.id.slice(0, 8)}`}{r.equipmentType ? ` · ${r.equipmentType}` : ''}{r.equipmentPart ? ` · ${r.equipmentPart}` : ''}
                </label></li>
              ))}
            </ul>
          </details>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        {msg && <span style={{ color: msg.ok ? 'var(--i-success)' : 'var(--i-danger)', fontSize: 12 }}>{msg.text}</span>}
        {dirty && <span style={muted}>{add.length > 0 && `+${add.length}`}{add.length > 0 && remove.length > 0 && ' / '}{remove.length > 0 && `−${remove.length}`}</span>}
        <button type="button" className="insp-btn primary" disabled={!dirty || busy} onClick={save}>Save links</button>
      </div>
    </div>
  );
}

export default function SharedDocumentSetView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useInspection();
  const [set, setSet] = useState<DocumentSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editRigs, setEditRigs] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!id) return;
    fetchDocumentSet(id).then((s) => { if (s) setSet(s); else setError('Document set not found.'); })
      .catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (!can('shared-document:view')) return <EmptyState ico="⚿" title="No Access" desc="You need the shared-document:view permission." />;
  if (error) return <EmptyState ico="⚠" title="Failed to load document set" desc={error} />;
  if (!set) return <LoadingState />;
  const canCreate = can('shared-document:create');
  const inScope = set.rigs.filter((r) => r.inScope);

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 980 }}>
      <PageHeader title={set.name} subtitle="Shared Documents" actions={<>
        {canCreate && set.canManage && <button type="button" className="insp-btn" onClick={() => setEditRigs(true)}>
          <Icon name="edit" /> Edit rigs</button>}
        <button type="button" className="insp-btn" onClick={() => navigate('/inspection/shared-documents')}>← Back</button>
      </>} />
      {notice && <div className="insp-card" style={{ color: 'var(--i-success)' }}>{notice}</div>}
      <section className="insp-card"><h3 style={{ marginTop: 0 }}>Overview</h3>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: 0 }}>
          <Field label="Name">{set.name}</Field>
          <Field label="Rigs">{set.rigs.length === 0 ? '—'
            : <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{set.rigs.map((r) => <Badge key={r.unitId}>{r.unitName}</Badge>)}</span>}</Field>
          <Field label="Description">{set.description ?? '—'}</Field>
          <Field label="Created by">{set.createdBy ?? '—'}</Field>
          <Field label="Created">{new Date(set.created).toLocaleDateString()}</Field>
        </dl>
      </section>
      <section className="insp-card"><h3 style={{ marginTop: 0 }}>Files ({set.documents.length})</h3>
        {set.documents.length === 0 ? <p style={muted}>No files in this set.</p> : (
          <div style={{ display: 'grid', gap: 12 }}>
            {groupDocuments(set.documents).map((g) => (
              <section key={g.category ?? ''} aria-label={`Category ${g.category ?? 'No category'}`}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <b>{g.category ?? <span style={muted}>No category</span>}</b><Badge>{g.documents.length}</Badge>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                  {g.documents.map((d) => (
                    <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--i-border)', borderRadius: 8, padding: '6px 10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fileName}</div>
                        <div style={{ ...muted, fontSize: 11 }}>{formatSize(d.size)}</div>
                      </div>
                      <button type="button" className="insp-iconbtn" title="Download"
                        onClick={() => downloadSetFile(d).catch((e: Error) => setNotice(e.message))}><Icon name="download" /></button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {canCreate && set.canManage && <AddFiles setId={set.id} onAdded={load} />}
      </section>
      {canCreate && inScope.length > 0 && (
        <section className="insp-card"><h3 style={{ marginTop: 0 }}>Link to inspection records</h3>
          <LinkPanel set={set} rigs={inScope} canDelete={can('shared-document:delete')} onSaved={load} />
        </section>
      )}
      {editRigs && <EditRigs set={set} onClose={() => setEditRigs(false)}
        onSaved={(m) => { setEditRigs(false); setNotice(m); load(); }} />}
    </div>
  );
}
