// ============================================================================
//  Export / print dialog (research report §6): layer toggles, paper size &
//  orientation, fit-vs-actual, and Print (→PDF) / PNG / SVG output.
// ============================================================================
import { useState } from 'react';
import type { Project } from '../types';
import { ALL_LAYERS, exportPidPng, exportPidSvg, printPid, type Layers } from '../lib/printExport';

export default function ExportDialog({ project, refDate, onClose }: { project: Project; refDate: Date; onClose: () => void }) {
  const [layers, setLayers] = useState<Layers>({ ...ALL_LAYERS });
  const [paper, setPaper] = useState<'A4' | 'A3'>('A3');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [fit, setFit] = useState(true);

  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const LAYER_LABELS: Array<[keyof Layers, string]> = [
    ['equipment', 'Equipment'], ['pipes', 'Piping'], ['tags', 'Tags & labels'], ['annotations', 'Annotations'],
  ];

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Export / Print P&amp;ID</div>

        <div style={lbl}>Layers</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {LAYER_LABELS.map(([k, label]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} />{label}
            </label>
          ))}
        </div>

        <div style={lbl}>Page (for print)</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select style={inp} value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'A3')}>
            <option value="A3">A3</option><option value="A4">A4</option>
          </select>
          <select style={inp} value={orientation} onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}>
            <option value="landscape">Landscape</option><option value="portrait">Portrait</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={fit} onChange={() => setFit((v) => !v)} />Fit to page
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button style={ghost} onClick={onClose}>Close</button>
          <button style={ghost} onClick={() => exportPidSvg(project, refDate, layers)}>SVG</button>
          <button style={ghost} onClick={() => exportPidPng(project, refDate, layers)}>PNG</button>
          <button style={primary} onClick={() => { printPid(project, refDate, layers, { paper, orientation, fit }); onClose(); }}>⎙ Print / PDF</button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: '#0008', display: 'grid', placeItems: 'center', zIndex: 100 };
const modal: React.CSSProperties = { width: 'min(440px, 94vw)', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: 20 };
const lbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600, margin: '16px 0 8px' };
const inp: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '7px 9px', borderRadius: 7, fontSize: 12.5 };
const primary: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const ghost: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
