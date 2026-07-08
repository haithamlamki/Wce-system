// Properties panel (admin) — per-item editable fields (PRD FR-12) plus the
// admin symbol controls: swap (FR-16), rotate / flip / scale / duplicate /
// delete (FR-17), and "apply to all of this type" (FR-18).
import { useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { SYM, SYM_ORDER, type SymbolKey } from '../lib/symbols';
import { STATUS_COLOR, STATUS_LABEL, statusOf } from '../lib/status';
import type { Component } from '../types';

const SECTIONS = ['BOP/Kill/Choke', 'Well Control', 'Choke Manifold', 'Koomey Unit', 'Mud Pumps', 'Mud System', 'Standpipe Manifold', 'Cement Lines', 'Instruments'];

export default function PropertiesPanel() {
  const {
    selected, selectedIds, refDate, updateNode, changeType, rotateNode, flipNode, scaleNode, duplicateNode, deleteNode,
    rotateSelection, flipSelection, duplicateSelection, deleteSelection, scaleSelection, copySelection,
    alignSelection, distributeSelection, groupSelection, ungroupSelection, toggleLockSelection,
  } = useProject();
  const [applyAll, setApplyAll] = useState(false);

  // multi-selection: show group actions instead of the single-item editor
  if (selectedIds.length > 1) {
    return (
      <aside style={panel}>
        <div style={{ padding: '15px 16px', borderBottom: '1px solid var(--line2)' }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15 }}>{selectedIds.length} items selected</div>
          <div style={{ fontSize: 11.5, color: 'var(--dim)' }}>Group edit · ⌘/Ctrl+C copy · ⌘/Ctrl+V paste</div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={ctlBtn} title="Rotate all 90° (R)" onClick={() => rotateSelection()}>⟳</button>
            <button style={ctlBtn} title="Flip all (F)" onClick={flipSelection}>⇄</button>
            <button style={ctlBtn} title="Duplicate all (D)" onClick={duplicateSelection}>⧉</button>
            <button style={ctlBtn} title="Copy (Ctrl+C)" onClick={copySelection}>⧉C</button>
            <button style={{ ...ctlBtn, color: 'var(--red)' }} title="Delete all (Del)" onClick={deleteSelection}>🗑</button>
          </div>
          <Field label="Scale all">
            <input type="range" min={0.4} max={3} step={0.1} defaultValue={1} onChange={(e) => scaleSelection(+e.target.value)} style={{ width: '100%' }} />
          </Field>

          <Field label="Align">
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={ctlBtn} title="Align left" onClick={() => alignSelection('left')}>⤙</button>
              <button style={ctlBtn} title="Align horizontal centers" onClick={() => alignSelection('hcenter')}>⤧</button>
              <button style={ctlBtn} title="Align right" onClick={() => alignSelection('right')}>⤚</button>
              <button style={ctlBtn} title="Align top" onClick={() => alignSelection('top')}>⤒</button>
              <button style={ctlBtn} title="Align vertical centers" onClick={() => alignSelection('vmiddle')}>⤫</button>
              <button style={ctlBtn} title="Align bottom" onClick={() => alignSelection('bottom')}>⤓</button>
            </div>
          </Field>
          <Field label="Distribute (3+ items)">
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...ctlBtn, flex: 1 }} title="Distribute horizontally" disabled={selectedIds.length < 3} onClick={() => distributeSelection('h')}>↔ Horizontal</button>
              <button style={{ ...ctlBtn, flex: 1 }} title="Distribute vertically" disabled={selectedIds.length < 3} onClick={() => distributeSelection('v')}>↕ Vertical</button>
            </div>
          </Field>

          <Field label="Group / lock">
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...ctlBtn, flex: 1 }} title="Group (move together)" onClick={groupSelection}>⛶ Group</button>
              <button style={{ ...ctlBtn, flex: 1 }} title="Ungroup" onClick={ungroupSelection}>⤬ Ungroup</button>
              <button style={{ ...ctlBtn, flex: 1 }} title="Lock / unlock" onClick={toggleLockSelection}>🔒 Lock</button>
            </div>
          </Field>

          <div style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.6 }}>
            Align/distribute use the selection’s bounding box. Rotate / flip / scale / duplicate / delete apply to all selected. Select one item to edit its details.
          </div>
        </div>
      </aside>
    );
  }

  if (!selected) {
    return (
      <aside style={panel}>
        <div style={{ padding: '44px 24px', color: 'var(--faint)', textAlign: 'center', fontSize: 13, lineHeight: 1.7 }}>
          Select an item to edit its tag, inspection dates and symbol, or drag a symbol from the palette.
          <div style={{ marginTop: 12, fontSize: 11.5 }}>Shift-click or drag a box to multi-select.</div>
        </div>
      </aside>
    );
  }

  const n = selected;
  const s = SYM[n.type as SymbolKey];
  const st = statusOf(n, refDate);
  const set = (patch: Partial<Component>) => updateNode(n.id, patch);

  return (
    <aside style={panel}>
      <div style={{ padding: '15px 16px', borderBottom: '1px solid var(--line2)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width={46} height={40}>
          <g style={{ color: s.color }} dangerouslySetInnerHTML={{ __html: s.svg }} />
        </svg>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600 }}>{n.tag || '—'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--dim)' }}>{s.name}</div>
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ ...statusBox, color: STATUS_COLOR[st] }}>● {STATUS_LABEL[st]}</div>

        {/* symbol swap — change the symbol without losing data (FR-16) */}
        <Field label="Symbol">
          <select style={inp} value={n.type} onChange={(e) => changeType(n.id, e.target.value as SymbolKey, applyAll)}>
            {SYM_ORDER.map((cat) => (
              <optgroup key={cat} label={cat}>
                {Object.entries(SYM).filter(([, d]) => d.cat === cat).map(([key, d]) => (
                  <option key={key} value={key}>{d.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {/* apply-to-all-of-type toggle (FR-18) — gates swap/rotate/flip/scale */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--dim)', cursor: 'pointer' }}>
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
          Apply to all <b style={{ color: 'var(--ink)' }}>{s.name}</b> items
        </label>

        {/* admin symbol controls */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={ctlBtn} title={applyAll ? 'Rotate all of this type 90°' : 'Rotate 90° (R)'} onClick={() => rotateNode(n.id, applyAll)}>⟳</button>
          <button style={ctlBtn} title={applyAll ? 'Flip all of this type' : 'Flip'} onClick={() => flipNode(n.id, applyAll)}>⇄</button>
          <button style={ctlBtn} title="Duplicate (D)" onClick={() => duplicateNode(n.id)}>⧉</button>
          <button style={{ ...ctlBtn, ...(n.locked ? { color: 'var(--accent)' } : {}) }} title={n.locked ? 'Unlock' : 'Lock in place'} onClick={toggleLockSelection}>{n.locked ? '🔒' : '🔓'}</button>
          <button style={{ ...ctlBtn, color: 'var(--red)' }} title="Delete (Del)" onClick={() => deleteNode(n.id)}>🗑</button>
        </div>
        <Field label={`Scale · ${Math.round((n.scale || 1) * 100)}%`}>
          <input type="range" min={0.4} max={3} step={0.1} value={n.scale || 1} onChange={(e) => scaleNode(n.id, +e.target.value, applyAll)} style={{ width: '100%' }} />
        </Field>

        <Field label="Tag"><input style={inp} value={n.tag} onChange={(e) => set({ tag: e.target.value })} /></Field>
        <Field label="Description"><input style={inp} value={n.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="System">
          <select style={inp} value={n.section} onChange={(e) => set({ section: e.target.value })}>
            {[n.section, ...SECTIONS.filter((x) => x !== n.section)].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <div style={grid2}>
          <Field label="RWP (psi)"><input style={inp} value={n.rwp} onChange={(e) => set({ rwp: e.target.value })} /></Field>
          <Field label="Size"><input style={inp} value={n.size} onChange={(e) => set({ size: e.target.value })} /></Field>
        </div>
        <Field label="Manufacturer"><input style={inp} value={n.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} /></Field>
        <Field label="Serial"><input style={inp} value={n.serial} onChange={(e) => set({ serial: e.target.value })} /></Field>
        <div style={grid2}>
          <Field label="Interm. last"><input type="date" style={inp} value={n.int_last} onChange={(e) => set({ int_last: e.target.value })} /></Field>
          <Field label="Interm. due"><input type="date" style={inp} value={n.int_due} onChange={(e) => set({ int_due: e.target.value })} /></Field>
        </div>
        <div style={grid2}>
          <Field label="Major last"><input type="date" style={inp} value={n.maj_last} onChange={(e) => set({ maj_last: e.target.value })} /></Field>
          <Field label="Major due"><input type="date" style={inp} value={n.maj_due} onChange={(e) => set({ maj_due: e.target.value })} /></Field>
        </div>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const panel: React.CSSProperties = { width: 312, flex: '0 0 auto', background: 'var(--panel)', borderLeft: '1px solid var(--line2)', overflowY: 'auto' };
const inp: React.CSSProperties = { width: '100%', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontFamily: 'var(--mono)', fontSize: 12.5 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const ctlBtn: React.CSSProperties = { flex: 1, padding: '8px 0', background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 7, cursor: 'pointer', fontSize: 15, color: 'var(--ink)' };
const statusBox: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, background: 'var(--sunk)' };
