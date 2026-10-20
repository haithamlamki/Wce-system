// ============================================================================
//  Symbol3DModal — one symbol, 2D / 3D side by side (single WebGL context).
//  Editors can attach / replace / remove a .glb model; everyone can view it.
//  Symbols without a model show a flat 3D card built from their 2D art, so the
//  toggle always works.
// ============================================================================
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { safeColor } from '../lib/sanitizeSvg';
import { SYM } from '../lib/symbols';
import { validateGlb } from '../lib/model3d';
import { hasBuiltin3d } from '../lib/builtin3dKeys';
import { loadModel, removeModel, saveModel } from '../lib/model3dStore';
import SvgMarkup from './SvgMarkup';

const Model3DViewer = lazy(() => import('./Model3DViewer'));

interface Props { symKey: string; onClose: () => void; onChanged: (key: string, has: boolean) => void }

export default function Symbol3DModal({ symKey, onClose, onChanged }: Props) {
  const { canEditLibrary } = useProject();
  const s = SYM[symKey];
  const [mode, setMode] = useState<'2d' | '3d'>('3d');
  const [glb, setGlb] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadModel(symKey).then((b) => { if (alive) { setGlb(b); setLoading(false); } });
    return () => { alive = false; };
  }, [symKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!s) return null;

  async function onPick(file: File) {
    setNote('');
    try {
      const buf = await file.arrayBuffer();
      const err = validateGlb(buf);
      if (err) { setNote(err); return; }
      setBusy(true);
      const { shared } = await saveModel(symKey, buf);
      setGlb(buf);
      onChanged(symKey, true);
      setMode('3d');
      setNote(shared ? 'Model saved and shared with everyone.' : 'Model saved in this browser only (the shared table is not set up yet).');
    } catch (e) {
      setNote(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!confirm('Remove the 3D model for this symbol? The 2D art is not affected.')) return;
    setBusy(true);
    await removeModel(symKey);
    setGlb(null);
    onChanged(symKey, false);
    setNote('3D model removed.');
    setBusy(false);
  }

  return (
    <div role="presentation" style={backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`${s.name} — 2D / 3D`} style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 17 }}>{s.name}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', border: '1px solid var(--line2)', borderRadius: 7, overflow: 'hidden' }}>
              {(['2d', '3d'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                  style={{ ...seg, ...(mode === m ? { background: 'var(--accent)', color: '#fff' } : {}) }}>{m.toUpperCase()}</button>
              ))}
            </div>
            <button style={ghost} onClick={onClose}>Close</button>
          </div>
        </div>

        {mode === '2d' ? (
          <div style={{ height: 380, display: 'grid', placeItems: 'center', background: 'var(--panel2)', borderRadius: 10 }}>
            <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width="92%" height="92%" preserveAspectRatio="xMidYMid meet">
              <SvgMarkup svg={s.svg} style={{ color: safeColor(s.color) }} />
            </svg>
          </div>
        ) : loading ? (
          <div style={{ height: 380, display: 'grid', placeItems: 'center', background: 'var(--panel2)', borderRadius: 10, color: 'var(--faint)', fontSize: 12.5 }}>Loading…</div>
        ) : (
          <Suspense fallback={<div style={{ height: 380, display: 'grid', placeItems: 'center', background: 'var(--panel2)', borderRadius: 10, color: 'var(--faint)', fontSize: 12.5 }}>Loading 3D…</div>}>
            <Model3DViewer symKey={symKey} glb={glb} flat={glb ? null : { svg: s.svg, w: s.w, h: s.h, color: s.color }} height={380} />
          </Suspense>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--faint)' }}>
            {loading ? '…' : glb ? `Uploaded 3D model · ${(glb.byteLength / 1048576).toFixed(1)} MB` : hasBuiltin3d(symKey) ? 'Built-in 3D model — upload a GLB to replace it' : 'No 3D model yet — showing a flat 3D card made from the 2D art'}
          </span>
          <span style={{ flex: 1 }} />
          {canEditLibrary && (
            <>
              <button style={ghost} disabled={busy} onClick={() => fileRef.current?.click()}>{glb ? '⤓ Replace GLB' : '⤓ Upload GLB'}</button>
              {glb && <button style={{ ...ghost, color: 'var(--red)' }} disabled={busy} onClick={onRemove}>Remove 3D</button>}
              <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
            </>
          )}
        </div>
        {note && <div role="status" style={{ marginTop: 8, fontSize: 12, color: 'var(--faint)' }}>{note}</div>}
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: '#000a', display: 'grid', placeItems: 'center', zIndex: 110 };
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: 20, width: 'min(760px, 94vw)' };
const ghost: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const seg: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: 0, padding: '7px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
