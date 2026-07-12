// ============================================================================
//  Project Manager — the single, unit-centric home for all diagrams & templates
//  (Phase 2). Replaces the old Units panel + Cloud panel. One tree:
//      Unit ── Diagrams (Open/Save/Rename/History/Delete)
//           └─ Templates (Open/Save/Rename/Delete)
//  Every item shows its version + last-modified time + who modified it, and a
//  Save writes only that item (guarded by its version, so no cross-admin
//  clobber). New diagrams/templates appear automatically under their unit.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import {
  deleteDiagram, deleteTemplate, listUnitTree, loadTemplate, renameDiagram, renameTemplate,
  saveTemplateGuarded, SaveConflictError, type ProjectVersionSummary, type UnitNode,
} from '../lib/cloud';

const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString(); };
const by = (name: string) => (name && name.trim() ? name : '—');

export default function ProjectManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    project, cloudId, canEdit, loadCloud, saveActiveToDiagram, createDiagramUnder,
    openTemplateOnCanvas, deactivateDiagram, addUnit, renameUnit, removeUnit, listVersions, restoreVersion,
  } = useProject();

  const [tree, setTree] = useState<UnitNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [histFor, setHistFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectVersionSummary[] | null>(null);

  const refresh = useCallback(async () => {
    try { setTree(await listUnitTree()); }
    catch (e) { setMsg((e as Error).message); }
  }, []);

  useEffect(() => { if (open) { refresh(); setMsg(''); } }, [open, refresh]);

  if (!open) return null;

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Wrap an async action: shared busy/message handling + tree refresh. Conflict
  // errors get a clear, actionable message instead of a silent overwrite.
  async function act(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setMsg('');
    try { await fn(); if (ok) setMsg(ok); await refresh(); }
    catch (e) {
      setMsg(e instanceof SaveConflictError
        ? 'Conflict — this item was changed by someone else. Open the latest, re-apply your changes, then Save.'
        : (e as Error).message);
    } finally { setBusy(false); }
  }

  const openDiagram = (id: string) => act(async () => { await loadCloud(id); onClose(); });
  const saveDiagram = (id: string, version: number, name: string) =>
    act(async () => { await saveActiveToDiagram(id, version); }, `Saved “${name}” ✓`);
  const renameDiagramRow = (id: string, cur: string) => {
    const name = window.prompt('Rename diagram', cur); if (name === null) return;
    act(async () => { await renameDiagram(id, name); }, 'Renamed ✓');
  };
  const deleteDiagramRow = (id: string, name: string) => {
    if (!window.confirm(`Delete diagram “${name}”? This also removes its revision history.`)) return;
    act(async () => { await deleteDiagram(id); deactivateDiagram(id); }, 'Deleted ✓');
  };
  const addDiagram = (unitName: string) => {
    const name = window.prompt(`New diagram under ${unitName} — name it (saves the current canvas):`, `${unitName} diagram`);
    if (name === null) return;
    act(async () => { await createDiagramUnder(unitName, name); }, 'Diagram created ✓');
  };

  const openTemplate = (id: string) =>
    act(async () => { const r = await loadTemplate(id); if (r) { openTemplateOnCanvas(r.project); onClose(); } });
  const saveTemplateRow = (id: string, version: number, unitId: string, name: string) =>
    act(async () => { await saveTemplateGuarded(id, version, unitId, name, project); }, `Saved template “${name}” ✓`);
  const renameTemplateRow = (id: string, cur: string) => {
    const name = window.prompt('Rename template', cur); if (name === null) return;
    act(async () => { await renameTemplate(id, name); }, 'Renamed ✓');
  };
  const deleteTemplateRow = (id: string, name: string) => {
    if (!window.confirm(`Delete template “${name}”?`)) return;
    act(async () => { await deleteTemplate(id); }, 'Deleted ✓');
  };
  const addTemplate = (unitId: string, unitName: string) => {
    const name = window.prompt(`New template under ${unitName} — name it (saves the current canvas as a template):`, 'Template');
    if (name === null) return;
    act(async () => { await saveTemplateGuarded(null, undefined, unitId, name, project); }, 'Template created ✓');
  };

  const addUnitRow = () => { const n = window.prompt('New unit name (e.g. Rig 201, Hoist 2):', ''); if (n && n.trim()) act(async () => { await addUnit(n.trim()); }, 'Unit added ✓'); };
  const renameUnitRow = (name: string) => { const n = window.prompt('Rename unit', name); if (n && n.trim() && n !== name) act(async () => { await renameUnit(name, n.trim()); }, 'Unit renamed ✓'); };
  const deleteUnitRow = (name: string) => { if (window.confirm(`Remove unit “${name}” from the list? Its saved diagrams stay in the database.`)) act(async () => { await removeUnit(name); }, 'Unit removed ✓'); };

  async function toggleHistory(id: string) {
    if (histFor === id) { setHistFor(null); return; }
    setHistFor(id); setVersions(null);
    try { setVersions(await listVersions(id)); } catch (e) { setMsg((e as Error).message); setVersions([]); }
  }
  const restore = (versionId: string) => {
    if (!window.confirm('Restore this revision onto the canvas? Save afterwards to record it.')) return;
    act(async () => { await restoreVersion(versionId); onClose(); });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontFamily: 'var(--disp)', margin: 0 }}>▤ Project Manager</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canEdit && <button style={btn} disabled={busy} onClick={addUnitRow}>+ Unit</button>}
            <button onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--dim)', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        {msg && <div style={{ fontSize: 12, color: 'var(--accent)', margin: '2px 0 8px' }}>{msg}</div>}

        <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
          {tree.length === 0 ? (
            <div style={{ color: 'var(--faint)', fontSize: 13, padding: '10px 0' }}>No units yet.</div>
          ) : tree.map((u) => {
            const isOpen = expanded.has(u.id);
            return (
              <div key={u.id} style={{ marginBottom: 6, border: '1px solid var(--line2)', borderRadius: 9, overflow: 'hidden' }}>
                <div style={unitHdr} onClick={() => toggle(u.id)}>
                  <span style={{ fontWeight: 700 }}>{isOpen ? '▾' : '▸'} {u.name}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                    {u.diagrams.length} diagram{u.diagrams.length === 1 ? '' : 's'} · {u.templates.length} template{u.templates.length === 1 ? '' : 's'}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ padding: '4px 10px 10px' }}>
                    {/* Diagrams */}
                    <div style={sect}>
                      <span style={sectLbl}>Diagrams</span>
                      {canEdit && <button style={miniBtn} disabled={busy} onClick={() => addDiagram(u.name)}>+ Diagram</button>}
                    </div>
                    {u.diagrams.length === 0 && <div style={empty}>No diagrams yet.</div>}
                    {u.diagrams.map((d) => (
                      <div key={d.id}>
                        <div style={row}>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 600 }}>{cloudId === d.id ? '● ' : ''}{d.name}</span>
                            {d.status === 'published' && <span style={badge}>FINAL</span>}
                            <div style={meta}>v{d.version} · {by(d.updated_by)} · {when(d.updated_at)}</div>
                          </div>
                          <div style={actions}>
                            <button style={btn} disabled={busy} onClick={() => openDiagram(d.id)}>Open</button>
                            {canEdit && <button style={btnPrimary} disabled={busy} onClick={() => saveDiagram(d.id, d.version, d.name)}>Save</button>}
                            {canEdit && <button style={btn} disabled={busy} onClick={() => renameDiagramRow(d.id, d.name)}>Rename</button>}
                            <button style={btn} disabled={busy} onClick={() => toggleHistory(d.id)}>{histFor === d.id ? 'Hide' : 'History'}</button>
                            {canEdit && <button style={btnDanger} disabled={busy} onClick={() => deleteDiagramRow(d.id, d.name)}>Delete</button>}
                          </div>
                        </div>
                        {histFor === d.id && (
                          <div style={hist}>
                            {versions === null ? <div style={empty}>Loading…</div>
                              : versions.length === 0 ? <div style={empty}>No revisions recorded.</div>
                              : versions.map((v) => (
                                <div key={v.id} style={histRow}>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>rev {v.revision} · {when(v.created_at)}{v.note ? ` · ${v.note}` : ''}</span>
                                  <button style={miniBtn} disabled={busy} onClick={() => restore(v.id)}>Restore</button>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Templates */}
                    <div style={{ ...sect, marginTop: 8 }}>
                      <span style={sectLbl}>Templates</span>
                      {canEdit && <button style={miniBtn} disabled={busy} onClick={() => addTemplate(u.id, u.name)}>+ Template</button>}
                    </div>
                    {u.templates.length === 0 && <div style={empty}>No templates yet.</div>}
                    {u.templates.map((t) => (
                      <div key={t.id} style={row}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{t.name}</span>
                          <div style={meta}>v{t.version} · {by(t.updated_by)} · {when(t.updated_at)}</div>
                        </div>
                        <div style={actions}>
                          <button style={btn} disabled={busy} onClick={() => openTemplate(t.id)}>Open</button>
                          {canEdit && <button style={btnPrimary} disabled={busy} onClick={() => saveTemplateRow(t.id, t.version, u.id, t.name)}>Save</button>}
                          {canEdit && <button style={btn} disabled={busy} onClick={() => renameTemplateRow(t.id, t.name)}>Rename</button>}
                          {canEdit && <button style={btnDanger} disabled={busy} onClick={() => deleteTemplateRow(t.id, t.name)}>Delete</button>}
                        </div>
                      </div>
                    ))}

                    {canEdit && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button style={miniBtn} disabled={busy} onClick={() => renameUnitRow(u.name)}>Rename unit</button>
                        <button style={{ ...miniBtn, color: 'var(--red)' }} disabled={busy} onClick={() => deleteUnitRow(u.name)}>Delete unit</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(8,16,24,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 20, width: 560, maxWidth: '92vw', boxShadow: 'var(--shadow)' };
const unitHdr: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--panel2)', cursor: 'pointer' };
const sect: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 2px' };
const sectLbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 700 };
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid var(--line)' };
const meta: React.CSSProperties = { color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 10.5, marginTop: 2 };
const actions: React.CSSProperties = { display: 'flex', gap: 5, flexShrink: 0 };
const empty: React.CSSProperties = { color: 'var(--faint)', fontSize: 12, padding: '4px 2px' };
const badge: React.CSSProperties = { marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 700, color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 4, padding: '1px 4px' };
const btn: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', color: 'var(--ink)', borderRadius: 6, padding: '5px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnPrimary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
const btnDanger: React.CSSProperties = { ...btn, color: 'var(--red)' };
const miniBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--line2)', color: 'var(--accent)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const hist: React.CSSProperties = { background: 'var(--sunk)', borderRadius: 6, padding: '4px 8px', margin: '2px 0 6px' };
const histRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 0' };
