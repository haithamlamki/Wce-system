// Units panel — open a unit (rig), browse the saved diagrams that belong to it,
// and start a fresh draft from the unit's template. Admins can add/rename/remove
// units and save the current diagram as a unit's reusable template. Wires up the
// units API that already lives on ProjectContext (showUnits/switchUnit/…).
import { useEffect, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { RIGS } from '../lib/aemp';
import type { ProjectSummary } from '../lib/cloud';

export default function UnitsPanel() {
  const {
    project, units, showUnits, setShowUnits, switchUnit, addUnit, renameUnit, removeUnit,
    startFromTemplate, saveUnitTemplate, listUnitDiagrams, unitTemplates, refreshUnits, loadCloud, canEdit,
  } = useProject();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<ProjectSummary[] | null>(null);

  useEffect(() => { if (showUnits) { refreshUnits(); setMsg(''); } /* eslint-disable-next-line */ }, [showUnits]);

  if (!showUnits) return null;
  const close = () => setShowUnits(false);
  const current = project.meta.rig;
  const isBuiltin = (name: string) => name in RIGS;
  const hasTemplate = (name: string) => unitTemplates.includes(name);

  async function run(label: string, fn: () => Promise<void>, thenClose = false) {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(`${label} ✓`); if (thenClose) close(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleDiagrams(name: string) {
    if (openFor === name) { setOpenFor(null); return; }
    setOpenFor(name); setDiagrams(null);
    try { setDiagrams(await listUnitDiagrams(name)); }
    catch (e) { setMsg((e as Error).message); setDiagrams([]); }
  }

  async function addNew() {
    const n = newUnit.trim(); if (!n) return;
    await run(`Added ${n}`, () => addUnit(n));
    setNewUnit('');
  }
  async function rename(name: string) {
    const next = prompt(`Rename unit "${name}" to:`, name);
    if (!next || next.trim() === name) return;
    await run(`Renamed to ${next.trim()}`, () => renameUnit(name, next.trim()));
  }
  async function remove(name: string) {
    if (!confirm(`Remove unit "${name}"? Its saved drawings stay in the database but the unit is no longer listed.`)) return;
    await run(`Removed ${name}`, () => removeUnit(name));
    if (openFor === name) setOpenFor(null);
  }

  return (
    <div style={overlay} onClick={close}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--disp)', margin: 0 }}>▤ Units</h2>
          <button onClick={close} style={{ border: 0, background: 'transparent', color: 'var(--dim)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {canEdit ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input style={inp} placeholder="New unit name — e.g. Rig 211" value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNew()} />
            <button style={{ ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} disabled={busy || !newUnit.trim()} onClick={addNew}>＋ Add unit</button>
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--faint)', marginBottom: 10 }}>Read-only — units are admin-managed.</div>
        )}
        {msg && <div style={{ fontSize: 12, color: 'var(--accent)', margin: '0 0 8px' }}>{msg}</div>}

        <div style={{ maxHeight: '56vh', overflowY: 'auto' }}>
          {units.map((name) => (
            <div key={name} style={{ marginBottom: 6 }}>
              <div style={{ ...row, ...(name === current ? { borderColor: 'var(--accent)' } : {}) }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 3 }}>
                  <span style={{ fontWeight: 600 }}>{name}{name === current ? ' · current' : ''}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <span style={tag}>{isBuiltin(name) ? 'built-in' : 'cloud'}</span>
                    {hasTemplate(name) && <span style={{ ...tag, color: 'var(--accent)', borderColor: 'var(--accent)' }}>template</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button style={btn} disabled={busy} onClick={() => toggleDiagrams(name)}>{openFor === name ? 'Hide' : '▤ Diagrams'}</button>
                  <button style={btn} disabled={busy} title="Start a new draft from this unit's template (or its master)" onClick={() => run(`Started ${name} from template`, () => startFromTemplate(name), true)}>⧉ Template</button>
                  <button style={{ ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} disabled={busy} onClick={() => run(`Opened ${name}`, () => switchUnit(name), true)}>Open</button>
                  {canEdit && <button style={btn} disabled={busy} onClick={() => rename(name)}>Rename</button>}
                  {canEdit && !isBuiltin(name) && <button style={{ ...btn, color: 'var(--red)' }} disabled={busy} onClick={() => remove(name)}>Remove</button>}
                </div>
              </div>

              {openFor === name && (
                <div style={sub}>
                  {canEdit && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>
                        {name === current ? 'Save the current canvas as this unit’s reusable template.' : 'Switch to this unit to save its template.'}
                      </span>
                      <button style={btn} disabled={busy || name !== current} title={name === current ? '' : 'Open this unit first'}
                        onClick={() => run(`Saved ${name} template`, () => saveUnitTemplate(name))}>Save current → template</button>
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: 1, padding: '8px 0 4px' }}>Saved diagrams</div>
                  {diagrams === null ? (
                    <div style={{ fontSize: 12, color: 'var(--faint)', padding: '6px 0' }}>Loading…</div>
                  ) : diagrams.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--faint)', padding: '6px 0' }}>No saved diagrams for this unit yet.</div>
                  ) : diagrams.map((d) => (
                    <div key={d.id} style={diagRow}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--dim)' }}>
                        {d.reference_date || '—'} · {new Date(d.updated_at).toLocaleString()}
                      </span>
                      <button style={btn} disabled={busy} onClick={() => run('Opened diagram', () => loadCloud(d.id), true)}>Open</button>
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
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 22, width: 560, boxShadow: 'var(--shadow)' };
const inp: React.CSSProperties = { flex: 1, boxSizing: 'border-box', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontSize: 12.5 };
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 8 };
const tag: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--faint)', border: '1px solid var(--line2)', borderRadius: 5, padding: '1px 5px' };
const btn: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', color: 'var(--ink)', borderRadius: 7, padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const sub: React.CSSProperties = { border: '1px solid var(--line2)', borderTop: 0, borderRadius: '0 0 8px 8px', padding: '4px 12px 8px', background: 'var(--sunk)' };
const diagRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' };
