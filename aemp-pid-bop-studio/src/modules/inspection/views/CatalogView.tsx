// ============================================================================
//  Equipment Components — catalog CRUD (source parity): filterable list of
//  Category/Equipment/Description; selecting a row opens the detail editor
//  with spec-field chips and parts → components. Writes need insp_manage_catalog.
// ============================================================================
import { useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { deleteComponent, deletePart, deleteType, saveComponent, savePart, saveType } from '../lib/catalog';
import { CATEGORY_LABELS, CATEGORY_ORDER, type EquipmentType, type InspCategory } from '../types';

export default function CatalogView() {
  const { can, types, parts, components, refreshCatalog } = useInspection();
  const editable = can('insp_manage_catalog');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id?: string; category: InspCategory; name: string; description: string; specFields: string[] } | null>(null);
  const [specInput, setSpecInput] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => types.filter((t) =>
    !q || t.name.toLowerCase().includes(q.toLowerCase())
      || CATEGORY_LABELS[t.category].toLowerCase().includes(q.toLowerCase())), [types, q]);
  const sel = types.find((t) => t.id === selId) ?? null;
  const selParts = parts.filter((p) => p.typeId === selId);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await refreshCatalog(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const openEdit = (t: EquipmentType | null) => {
    setDraft(t
      ? { id: t.id, category: t.category, name: t.name, description: t.description, specFields: [...t.specFields] }
      : { category: 'well_control', name: '', description: '', specFields: [] });
  };

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Equipment Components</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>Manage equipment types, their parts and sub-components.</span>
        <div style={{ flex: 1 }} />
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '6px 9px', background: 'var(--panel)', color: 'var(--ink)' }} />
        {editable && <button className="insp-btn primary" onClick={() => openEdit(null)}>+ New Component</button>}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div className="insp-table-wrap" style={{ flex: 1 }}>
          <table className="insp-table" style={{ minWidth: 520 }}>
            <thead><tr><th>Category</th><th>Equipment</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} style={selId === t.id ? { outline: '2px solid var(--accent)' } : {}}>
                  <td>{CATEGORY_LABELS[t.category]}</td><td>{t.name}</td><td>{t.description}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="insp-btn" onClick={() => setSelId(t.id === selId ? null : t.id)}>ⓘ</button>
                    {editable && <>
                      <button className="insp-btn" onClick={() => { setSelId(t.id); openEdit(t); }}>✎</button>
                      <button className="insp-btn" disabled={busy}
                        onClick={() => { if (confirm(`Delete "${t.name}" and all its parts?`)) run(() => deleteType(t.id)); }}>🗑</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(sel || draft) && (
          <div className="insp-card" style={{ flex: 1, minWidth: 380 }}>
            {draft ? (
              <>
                <h3 style={{ marginTop: 0 }}>{draft.id ? 'Edit Component' : 'New Component'}</h3>
                <div className="insp-form-grid">
                  <div className="insp-field"><label>Category</label>
                    <select value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value as InspCategory })}>
                      {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select></div>
                  <div className="insp-field"><label>Equipment name</label>
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                  <div className="insp-field" style={{ gridColumn: '1 / -1' }}><label>Description</label>
                    <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
                </div>
                <div className="insp-field" style={{ marginTop: 10 }}>
                  <label>Equipment Specification fields</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {draft.specFields.map((s) => (
                      <span key={s} className="insp-rag unknown">{s}
                        <button style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}
                          onClick={() => setDraft({ ...draft, specFields: draft.specFields.filter((x) => x !== s) })}>×</button>
                      </span>
                    ))}
                    <input placeholder="e.g. Size (in) — Enter to add" value={specInput}
                      onChange={(e) => setSpecInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && specInput.trim()) {
                          setDraft({ ...draft, specFields: [...draft.specFields, specInput.trim()] });
                          setSpecInput('');
                        }
                      }} />
                  </div>
                </div>
                <div className="insp-toolbar" style={{ marginTop: 12 }}>
                  <button className="insp-btn primary" disabled={busy || !draft.name.trim()}
                    onClick={() => run(async () => { await saveType(draft); setDraft(null); })}>💾 Save</button>
                  <button className="insp-btn" onClick={() => setDraft(null)}>Cancel</button>
                </div>
              </>
            ) : sel && (
              <>
                <h3 style={{ marginTop: 0 }}>Component Details — {sel.name}</h3>
                <div style={{ fontSize: 12.5 }}>
                  <b>Category:</b> {CATEGORY_LABELS[sel.category]}<br />
                  <b>Description:</b> {sel.description}<br />
                  <b>Specification:</b> {sel.specFields.length ? sel.specFields.join(' · ') : '—'}
                </div>
                <h4>Equipment Parts</h4>
                {selParts.map((p) => {
                  const comps = components.filter((c) => c.partId === p.id);
                  return (
                    <div key={p.id} className="insp-card" style={{ marginBottom: 8, padding: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <b style={{ fontSize: 12.5 }}>{p.name}</b>
                        <span style={{ color: 'var(--dim)', fontSize: 11 }}>{comps.length} components</span>
                        <div style={{ flex: 1 }} />
                        {editable && (
                          <button className="insp-btn" disabled={busy}
                            onClick={() => { if (confirm(`Delete part "${p.name}"?`)) run(() => deletePart(p.id)); }}>🗑</button>
                        )}
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', fontSize: 12 }}>
                        {comps.map((c) => (
                          <li key={c.id}>{c.name}
                            {editable && (
                              <button className="insp-btn" style={{ marginLeft: 6, padding: '0 6px' }} disabled={busy}
                                onClick={() => { if (confirm(`Delete component "${c.name}"?`)) run(() => deleteComponent(c.id)); }}>×</button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {editable && (
                        <button className="insp-btn" style={{ marginTop: 6 }} disabled={busy}
                          onClick={() => {
                            const name = prompt('Component name');
                            if (name?.trim()) run(() => saveComponent({ partId: p.id, name: name.trim(), description: name.trim(), position: comps.length + 1 }));
                          }}>+ Add component</button>
                      )}
                    </div>
                  );
                })}
                {editable && (
                  <button className="insp-btn" disabled={busy}
                    onClick={() => {
                      const name = prompt('Part name');
                      if (name?.trim()) run(() => savePart({ typeId: sel.id, name: name.trim(), description: name.trim(), position: selParts.length + 1 }));
                    }}>+ Add part</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
