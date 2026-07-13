// ============================================================================
//  Symbol palette (F19 extraction from PidFullView.tsx) — the admin-only left
//  sidebar: build/import actions, search + collapsible category list, drag/
//  click-to-place, hover preview, and the Symbol Library dialog launcher.
//  Self-contained: reads useProject() directly; the only thing it can't do
//  itself is the canvas's "click = pending, needs approval" flow, so
//  `onPlaceCentre` (which also owns the approve-bar state) is passed in.
// ============================================================================
import { useState } from 'react';
import { useProject } from '../../state/ProjectContext';
import { SYM, SYM_ORDER, type SymbolKey } from '../../lib/symbols';
import { safeColor } from '../../lib/sanitizeSvg';
import SymbolLibrary from '../SymbolLibrary';
import SvgMarkup from '../SvgMarkup';

export default function SymbolPalette({ onPlaceCentre }: { onPlaceCentre: (type: SymbolKey) => void }) {
  const p = useProject();
  const [palQuery, setPalQuery] = useState('');
  const [palCollapsed, setPalCollapsed] = useState<Set<string>>(new Set());
  const [palHover, setPalHover] = useState<SymbolKey | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  // "Import from AEMP" / "Import drawing…" buttons were removed by request —
  // diagrams are started clean, built from the master, or opened from Projects.
  return (
    <>
      <aside style={paletteStyle}>
        <div style={palHeader}>
          <button style={primaryBtn} onClick={p.loadMaster}>Build Full P&amp;ID</button>
          <button style={{ ...primaryBtn, background: 'var(--panel2)', color: 'var(--ink)' }} onClick={() => setShowLibrary(true)}>⊞ Symbol library</button>
          <button style={{ ...primaryBtn, background: 'var(--panel2)', color: 'var(--red)', marginBottom: 0 }}
            onClick={() => { if (confirm('Clear the entire canvas — all equipment, piping and annotations?')) p.clearCanvas(); }}>Clear canvas</button>
          <input placeholder="Search symbols…" value={palQuery} onChange={(e) => setPalQuery(e.target.value)} style={palSearch} />
        </div>
        <div style={palScroll}>
        {(() => {
          const q = palQuery.trim().toLowerCase();
          const hidden = new Set(p.project.hiddenSymbols ?? []);
          return SYM_ORDER.map((cat) => {
            const items = Object.entries(SYM).filter(([key, s]) => s.cat === cat && !hidden.has(key) && (!q || s.name.toLowerCase().includes(q) || key.includes(q)));
            if (!items.length) return null;
            const collapsed = !q && palCollapsed.has(cat);
            return (
              <div key={cat}>
                <button type="button" style={palHead}
                  onClick={() => !q && setPalCollapsed((cs) => { const n = new Set(cs); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}>
                  <span>{q ? '' : (collapsed ? '▸ ' : '▾ ')}{cat}</span>
                  <span style={{ opacity: 0.6 }}>{items.length}</span>
                </button>
                {!collapsed && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {items.map(([key, s]) => (
                      <button type="button" key={key} title={s.name} style={palCard} draggable
                        onDragStart={(e) => e.dataTransfer.setData('type', key)}
                        onClick={() => onPlaceCentre(key as SymbolKey)}
                        onMouseEnter={() => setPalHover(key as SymbolKey)}
                        onMouseLeave={() => setPalHover((h) => (h === key ? null : h))}>
                        <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width={44} height={36}>
                          <SvgMarkup svg={s.svg} style={{ color: safeColor(s.color) }} />
                        </svg>
                        <span style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'center' }}>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          });
        })()}
        <div style={{ fontSize: 11, color: 'var(--faint)', lineHeight: 1.6, padding: '12px 4px', borderTop: '1px solid var(--line)', marginTop: 12 }}>
          Click a symbol to place &amp; approve, or drag it onto the canvas.<br />
          <b>Hover an item</b> for its connection handles · <b>drag a handle</b> to another item to connect.<br />
          <b>Drag the body</b> to move · <b>middle-mouse drag</b> to pan · <b>wheel</b> to zoom.<br />
          <b>Shift-click</b> or <b>drag a box</b> to multi-select · <b>Ctrl+A</b> all · <b>Esc</b> clear.<br />
          <b>Ctrl+C/X/V</b> copy/cut/paste · <b>R</b> rotate (⇧R type) · <b>D</b> duplicate · <b>F</b> flip · <b>Del</b> remove.<br />
          <b>Arrow keys</b> nudge by grid · <b>Shift+Arrow</b> nudge 1px · <b>Ctrl+Z/⇧Z</b> undo/redo.
        </div>
        </div>
      </aside>

      {showLibrary && <SymbolLibrary onClose={() => setShowLibrary(false)} />}

      {palHover && SYM[palHover] && (
        <div style={palPreview}>
          <svg viewBox={`-4 -4 ${SYM[palHover].w + 8} ${SYM[palHover].h + 8}`} width={130} height={104}>
            <SvgMarkup svg={SYM[palHover].svg} style={{ color: safeColor(SYM[palHover].color) }} />
          </svg>
          <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 6 }}>{SYM[palHover].name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--faint)' }}>{SYM[palHover].cat}{SYM[palHover].defaults?.size ? ` · ${SYM[palHover].defaults!.size}` : ''}</div>
        </div>
      )}
    </>
  );
}

// ---- styles ----------------------------------------------------------------
const paletteStyle: React.CSSProperties = { width: 230, flex: '0 0 auto', background: 'var(--panel)', borderRight: '1px solid var(--line2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 12 };
// Buttons + search stay pinned; only the symbol list below scrolls.
const palHeader: React.CSSProperties = { flex: '0 0 auto', paddingBottom: 10, borderBottom: '1px solid var(--line)' };
const palScroll: React.CSSProperties = { flex: '1 1 auto', overflowY: 'auto', minHeight: 0, marginRight: -6, paddingRight: 6 };
const primaryBtn: React.CSSProperties = { width: '100%', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '9px 11px', fontWeight: 600, fontSize: 12, marginBottom: 8, cursor: 'pointer' };
// `<button>`-based (F20 a11y — was a bare `<div onClick>`); reset the native
// button chrome (border/background/font/width/text-align) so it still reads
// identically to the old div.
const palHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', border: 0, background: 'transparent', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1.6, color: 'var(--faint)', textTransform: 'uppercase', margin: '15px 4px 8px', padding: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' };
const palSearch: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '7px 9px', borderRadius: 7, fontSize: 12, margin: '4px 0 4px' };
const palPreview: React.CSSProperties = { position: 'absolute', left: 238, top: 120, zIndex: 30, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 11, boxShadow: 'var(--shadow)', padding: 12, width: 168, textAlign: 'center', pointerEvents: 'none' };
const palCard: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'grab', font: 'inherit', color: 'inherit', textAlign: 'center' };
