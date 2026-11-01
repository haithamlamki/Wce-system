// ============================================================================
//  Model3DViewer — one orbitable three.js stage (one WebGL context).
//  • glb given  → parses the binary glTF straight from memory and frames it.
//  • glb absent → flat 2.5D fallback: the symbol's SVG art as a thin slab, so the
//    2D/3D toggle works for every symbol before real models exist.
//  Loaded lazily (React.lazy) so three.js stays out of the initial bundle.
//  Draco/meshopt-compressed GLBs are not supported (their decoders load from a
//  CDN, which the CSP blocks) — export uncompressed.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import type { FlatArt } from '../lib/model3d';
import { buildSymbolObject, createStage } from '../lib/threeStage';

interface Props {
  /** Symbol key — enables the built-in procedural model when no .glb is given. */
  symKey?: string;
  glb: ArrayBuffer | null;
  flat?: FlatArt | null;
  height?: number;
  autoRotate?: boolean;
}

export default function Model3DViewer({ symKey, glb, flat, height = 360, autoRotate = true }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('');

  const flatKey = flat ? `${flat.svg.length}|${flat.w}|${flat.h}|${flat.color}` : '';

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    setState('loading');
    setMsg('');

    const stage = createStage(cv, el, { autoRotate });
    if (!stage) {
      setState('error');
      setMsg('3D view needs WebGL, which is unavailable in this browser.');
      return;
    }
    let disposed = false;

    (async () => {
      try {
        const res = await buildSymbolObject({ key: symKey, glb, flat });
        if (disposed) return;
        if (!res) { setState('error'); setMsg('Nothing to show.'); return; }
        stage.root.add(res.object);
        stage.fit();
        setState('ready');
      } catch (e) {
        if (!disposed) { setState('error'); setMsg(glb ? `Could not read the 3D model: ${(e as Error).message}` : (e as Error).message); }
      }
    })();

    return () => { disposed = true; stage.dispose(); };
    // flatKey stands in for the flat art object (avoids re-running on identity changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symKey, glb, flatKey, autoRotate]);

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%', height, borderRadius: 10, background: 'var(--panel2)', overflow: 'hidden' }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      {state !== 'ready' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center', fontSize: 12.5, color: state === 'error' ? 'var(--red)' : 'var(--faint)' }}>
          {state === 'error' ? msg : 'Loading 3D…'}
        </div>
      )}
    </div>
  );
}
