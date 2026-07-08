// ============================================================================
//  Symbol Library — browse built-in + custom symbols, draw/edit them, replace
//  their artwork by uploading an SVG, delete custom ones / hide built-ins, and
//  import/export the custom set. Edit & replace work on built-ins too: the
//  change is stored as a per-project override (it travels with save/load).
// ============================================================================
import { useReducer, useRef, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { SYM, type SymbolDef } from '../lib/symbols';
import SymbolDrawer from './SymbolDrawer';

/** True for raster image files we can embed as an <image> (PNG/JPG/GIF/WebP). */
function isRasterImage(file: File): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name) || file.type.startsWith('image/');
}

/** Read a raster image into inner-SVG markup wrapping it as an <image> (base64 data URI). */
function imageFileToSymbol(file: File): Promise<{ svg: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be decoded.'));
      img.onload = () => {
        // Normalise the symbol canvas so the longest side is ~100 units.
        const max = Math.max(img.naturalWidth, img.naturalHeight) || 100;
        const scale = 100 / max;
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const svg = `<image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
        resolve({ svg, w, h });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/** Pull inner SVG markup + size out of an uploaded .svg or single-symbol .json. */
function parseSymbolFile(text: string, fileName: string, fallback?: SymbolDef): { svg: string; w: number; h: number } | null {
  let w = fallback?.w ?? 100, h = fallback?.h ?? 70;
  if (fileName.toLowerCase().endsWith('.svg')) {
    const vb = text.match(/viewBox="([\d.\- ]+)"/);
    if (vb) { const p = vb[1].trim().split(/\s+/).map(Number); w = Math.round(p[2] || w); h = Math.round(p[3] || h); }
    const svg = text.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').trim();
    return svg ? { svg, w, h } : null;
  }
  const obj = JSON.parse(text) as Record<string, { svg?: string; w?: number; h?: number }>;
  const first = (obj.svg ? obj : Object.values(obj).find((d) => d && d.svg)) as { svg?: string; w?: number; h?: number } | undefined;
  if (!first?.svg) return null;
  return { svg: first.svg, w: +(first.w || w), h: +(first.h || h) };
}

export default function SymbolLibrary({ onClose }: { onClose: () => void }) {
  const { project, addCustomSymbol, updateCustomSymbol, deleteCustomSymbol, hideSymbol, restoreSymbol, hiddenSymbols, canEditLibrary } = useProject();
  const [drawer, setDrawer] = useState<{ key: string | null } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [, refresh] = useReducer((x) => x + 1, 0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const replaceKey = useRef<string | null>(null);

  const custom = project.customSymbols ?? {};
  const customCount = Object.keys(custom).length;
  const hidden = new Set(hiddenSymbols);
  // custom symbols first
  const all = Object.entries(SYM).sort((a, b) => (b[1].custom ? 1 : 0) - (a[1].custom ? 1 : 0));
  const entries = all.filter(([k]) => !hidden.has(k));
  const hiddenEntries = all.filter(([k]) => hidden.has(k));

  const kindOf = (key: string): 'custom' | 'edited' | 'built-in' =>
    key.startsWith('custom_') ? 'custom' : custom[key] ? 'edited' : 'built-in';

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
      if (isRasterImage(file)) {
        const parsed = await imageFileToSymbol(file);
        addCustomSymbol({ name: file.name.replace(/\.[^.]+$/, ''), cat: 'Custom', w: parsed.w, h: parsed.h, color: '#3a4654', svg: parsed.svg });
        refresh();
        return;
      }
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.svg')) {
        const parsed = parseSymbolFile(text, file.name);
        if (!parsed) { alert('No SVG markup found in that file.'); return; }
        addCustomSymbol({ name: file.name.replace(/\.svg$/i, ''), cat: 'Custom', w: parsed.w, h: parsed.h, color: '#3a4654', svg: parsed.svg });
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

  /** Replace one symbol's artwork by uploading an SVG/JSON (keeps name/category). */
  async function onReplace(key: string, file: File) {
    try {
      const cur = SYM[key];
      const parsed = isRasterImage(file) ? await imageFileToSymbol(file) : parseSymbolFile(await file.text(), file.name, cur);
      if (!parsed) { alert('Could not read symbol artwork from that file.'); return; }
      updateCustomSymbol(key, { name: cur?.name || key, cat: cur?.cat || 'Custom', w: parsed.w, h: parsed.h, color: cur?.color || '#3a4654', svg: parsed.svg });
      refresh();
    } catch (e) {
      alert(`Replace failed: ${(e as Error).message}`);
    }
  }

  function onDelete(key: string) {
    if (key.startsWith('custom_')) {
      if (confirm('Delete this custom symbol permanently?')) { deleteCustomSymbol(key); refresh(); }
    } else {
      if (confirm('Remove this built-in symbol from the library?\nAlready-placed items keep their shape, and you can restore it from “Show hidden”.')) { hideSymbol(key); refresh(); }
    }
  }

  function renderCard([key, s]: [string, SymbolDef]) {
    const kind = kindOf(key);
    return (
      <div key={key} style={{ ...card, ...(kind !== 'built-in' ? { borderColor: 'var(--accent)' } : {}) }}>
        <div style={{ height: 84, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width="100%" height={84} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
            <g style={{ color: s.color }} dangerouslySetInnerHTML={{ __html: s.svg }} />
          </svg>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.25, minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.name}</div>
        <div style={{ fontSize: 9, color: kind === 'built-in' ? 'var(--faint)' : 'var(--accent)', textAlign: 'center', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{kind}</div>
        {canEditLibrary && (
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
            <button style={smallBtn} title="Edit name / size / shapes" onClick={() => setDrawer({ key })}>edit</button>
            <button style={smallBtn} title="Replace artwork with an uploaded SVG or PNG image" onClick={() => { replaceKey.current = key; replaceRef.current?.click(); }}>upload</button>
            <button style={{ ...smallBtn, color: 'var(--red)' }} title={key.startsWith('custom_') ? 'Delete symbol' : 'Remove from library'} onClick={() => onDelete(key)}>del</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18 }}>Symbol library</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--faint)', marginLeft: 10 }}>{customCount} custom · {entries.length} shown{hiddenEntries.length ? ` · ${hiddenEntries.length} hidden` : ''}</span>
          </div>
          <button style={ghost} onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {canEditLibrary && <button style={primary} onClick={() => setDrawer({ key: null })}>＋ Draw new symbol</button>}
          {canEditLibrary && <button style={ghost} onClick={() => fileRef.current?.click()}>⤓ Import</button>}
          <button style={ghost} onClick={exportJson}>⤒ Export</button>
          {!canEditLibrary && <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--faint)', alignSelf: 'center' }}>Read-only — the shared library is admin-managed.</span>}
          {hiddenEntries.length > 0 && (
            <button style={ghost} onClick={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide removed' : `Show hidden (${hiddenEntries.length})`}</button>
          )}
          <input ref={fileRef} type="file" accept=".json,.svg,.png,.jpg,.jpeg,.gif,.webp,image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
          <input ref={replaceRef} type="file" accept=".json,.svg,.png,.jpg,.jpeg,.gif,.webp,image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; const k = replaceKey.current; if (f && k) onReplace(k, f); replaceKey.current = null; e.target.value = ''; }} />
        </div>

        <div style={{ overflowY: 'auto', maxHeight: '66vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))', gap: 12 }}>
          {entries.map(renderCard)}
        </div>

        {showHidden && hiddenEntries.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line2)', paddingTop: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Removed symbols — restore to bring back</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))', gap: 12 }}>
              {hiddenEntries.map(([key, s]) => (
                <div key={key} style={{ ...card, opacity: 0.6 }}>
                  <div style={{ height: 72, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                    <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width="100%" height={72} preserveAspectRatio="xMidYMid meet">
                      <g style={{ color: s.color }} dangerouslySetInnerHTML={{ __html: s.svg }} />
                    </svg>
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'center' }}>{s.name}</div>
                  <button style={smallBtn} onClick={() => { restoreSymbol(key); refresh(); }}>restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
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
const card: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 10, padding: '12px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' };
const smallBtn: React.CSSProperties = { flex: 1, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 6, padding: '3px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' };
const primary: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const ghost: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
