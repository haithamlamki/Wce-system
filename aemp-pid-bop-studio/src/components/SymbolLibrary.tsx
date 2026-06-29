// ============================================================================
//  Symbol Library — browse built-in + custom symbols, draw new ones, and
//  import/export the custom set. Ported from the prototype's symbol library.
// ============================================================================
import { useReducer, useRef, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { SYM } from '../lib/symbols';
import SymbolDrawer from './SymbolDrawer';

export default function SymbolLibrary({ onClose }: { onClose: () => void }) {
  const { project, addCustomSymbol, deleteCustomSymbol } = useProject();
  const [drawer, setDrawer] = useState<{ key: string | null } | null>(null);
  const [, refresh] = useReducer((x) => x + 1, 0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const custom = project.customSymbols ?? {};
  const customCount = Object.keys(custom).length;
  const total = Object.keys(SYM).length;
  // custom symbols first
  const entries = Object.entries(SYM).sort((a, b) => (b[1].custom ? 1 : 0) - (a[1].custom ? 1 : 0));

  function exportJson() {
    const data = JSON.stringify(custom, null, 2);
    if (data === '{}') { alert('No custom symbols to export.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'custom-symbols.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function onImport(file: File) {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.svg')) {
        let w = 100, h = 70;
        const vb = text.match(/viewBox="([\d.\- ]+)"/);
        if (vb) { const p = vb[1].trim().split(/\s+/).map(Number); w = Math.round(p[2] || 100); h = Math.round(p[3] || 70); }
        const inner = text.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').trim();
        addCustomSymbol({ name: file.name.replace(/\.svg$/i, ''), cat: 'Custom', w, h, color: '#3a4654', svg: inner });
      } else {
        const obj = JSON.parse(text) as Record<string, { name?: string; cat?: string; w?: number; h?: number; color?: string; svg?: string; shapes?: never }>;
        let n = 0;
        for (const [k, d] of Object.entries(obj)) {
          if (d && d.svg && d.w && d.h) { addCustomSymbol({ name: d.name || k, cat: d.cat || 'Custom', w: +d.w, h: +d.h, color: d.color || '#8d9dab', svg: d.svg, shapes: d.shapes }); n++; }
        }
        if (!n) { alert('No valid symbols found in that file.'); return; }
      }
      refresh();
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18 }}>Symbol library</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--faint)', marginLeft: 10 }}>{customCount} custom · {total} total</span>
          </div>
          <button style={ghost} onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button style={primary} onClick={() => setDrawer({ key: null })}>＋ Draw new symbol</button>
          <button style={ghost} onClick={() => fileRef.current?.click()}>⤓ Import</button>
          <button style={ghost} onClick={exportJson}>⤒ Export</button>
          <input ref={fileRef} type="file" accept=".json,.svg" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
        </div>

        <div style={{ overflowY: 'auto', maxHeight: '66vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))', gap: 12 }}>
          {entries.map(([key, s]) => (
            <div key={key} style={{ ...card, ...(s.custom ? { borderColor: 'var(--accent)' } : {}) }}>
              <div style={{ height: 84, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width="100%" height={84} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
                  <g style={{ color: s.color }} dangerouslySetInnerHTML={{ __html: s.svg }} />
                </svg>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.25, minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.name}</div>
              {s.custom ? (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button style={smallBtn} onClick={() => setDrawer({ key })}>edit</button>
                  <button style={{ ...smallBtn, color: 'var(--red)' }} onClick={() => { if (confirm('Delete this custom symbol?')) { deleteCustomSymbol(key); refresh(); } }}>del</button>
                </div>
              ) : (
                <div style={{ fontSize: 9.5, color: 'var(--faint)', textAlign: 'center', fontFamily: 'var(--mono)' }}>built-in</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {drawer && (
        <SymbolDrawer
          editKey={drawer.key}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); refresh(); }}
        />
      )}
    </div>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: '#0008', display: 'grid', placeItems: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: 22, width: 'min(1140px, 96vw)' };
const card: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 10, padding: '12px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' };
const smallBtn: React.CSSProperties = { flex: 1, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 6, padding: '3px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' };
const primary: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const ghost: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
