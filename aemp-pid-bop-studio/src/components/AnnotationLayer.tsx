// ============================================================================
//  Annotations overlay (research report §6). HTML layer positioned over the SVG
//  canvas via the shared view transform — text notes the admin can drag, edit
//  and delete. Kept out of the SVG to avoid pointer entanglement with nodes.
// ============================================================================
import { useProject } from '../state/ProjectContext';
import type { View } from '../lib/geometry';

export default function AnnotationLayer({ view, editable }: { view: View; editable: boolean }) {
  const { project, updateAnnotation, deleteAnnotation } = useProject();
  const annos = project.annotations ?? [];
  if (!annos.length) return null;

  function startDrag(id: string, ox: number, oy: number, e: React.PointerEvent) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) =>
      updateAnnotation(id, { x: ox + (ev.clientX - sx) / view.k, y: oy + (ev.clientY - sy) / view.k });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8 }}>
      {annos.map((a) => {
        const left = a.x * view.k + view.x;
        const top = a.y * view.k + view.y;
        const col = a.color || '#d8453d';
        if (a.kind === 'rect') {
          return (
            <div key={a.id}
              onPointerDown={(e) => startDrag(a.id, a.x, a.y, e)}
              style={{ position: 'absolute', left, top, width: a.w * view.k, height: a.h * view.k, border: `1.6px dashed ${col}`, borderRadius: 4, pointerEvents: editable ? 'auto' : 'none', cursor: 'move' }} />
          );
        }
        return (
          <div key={a.id} style={{ position: 'absolute', left, top, pointerEvents: editable ? 'auto' : 'none', display: 'flex', alignItems: 'flex-start', gap: 2, maxWidth: 240 }}>
            {editable && (
              <span onPointerDown={(e) => startDrag(a.id, a.x, a.y, e)} title="Drag note"
                style={{ cursor: 'move', color: 'var(--faint)', fontSize: 13, lineHeight: '16px', userSelect: 'none' }}>⠿</span>
            )}
            <span
              contentEditable={editable}
              suppressContentEditableWarning
              onBlur={(e) => updateAnnotation(a.id, { text: e.currentTarget.textContent || '' })}
              style={{ font: '600 13px sans-serif', color: col, outline: 'none', whiteSpace: 'pre-wrap' }}>
              {a.text || 'Note'}
            </span>
            {editable && (
              <button onClick={() => deleteAnnotation(a.id)} title="Delete note"
                style={{ border: 0, background: 'transparent', color: 'var(--faint)', cursor: 'pointer', fontSize: 12, lineHeight: '16px' }}>✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
