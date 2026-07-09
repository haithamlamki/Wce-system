// ============================================================================
//  Floating selection mini-toolbar (F19 extraction from PidFullView.tsx) —
//  appears above/below the current selection's bounding box: rotate / flip /
//  duplicate / copy, plus align/distribute once 2+ (3+) items are selected,
//  and delete.
// ============================================================================
import { useProject } from '../../state/ProjectContext';
import type { View } from '../../lib/geometry';

export interface SelectionBounds { cx: number; top: number }

export default function SelectionToolbar({ editable, selBounds, hasMarquee, view }: {
  editable: boolean;
  selBounds: SelectionBounds | null;
  hasMarquee: boolean;
  view: View;
}) {
  const p = useProject();
  if (!editable || !selBounds || hasMarquee || p.selectedIds.length === 0) return null;

  const sx = selBounds.cx * view.k + view.x;
  const sy = selBounds.top * view.k + view.y;
  const above = sy > 52;
  const multi = p.selectedIds.length > 1;

  return (
    <div style={{ position: 'absolute', left: sx, top: above ? sy - 46 : sy + 16, transform: 'translateX(-50%)', zIndex: 18, display: 'flex', gap: 3, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, padding: 4, boxShadow: 'var(--shadow)' }}>
      <button style={miniBtn} title="Rotate 90° (R)" onClick={() => p.rotateSelection()}>⟳</button>
      <button style={miniBtn} title="Flip (F)" onClick={() => p.flipSelection()}>⇄</button>
      <button style={miniBtn} title="Duplicate (D)" onClick={() => p.duplicateSelection()}>⧉</button>
      <button style={miniBtn} title="Copy (Ctrl+C)" onClick={() => p.copySelection()}>⎘</button>
      {multi && <>
        <span style={{ width: 1, background: 'var(--line2)', margin: '2px 1px' }} />
        <button style={miniBtn} title="Align left" onClick={() => p.alignSelection('left')}>⤙</button>
        <button style={miniBtn} title="Align top" onClick={() => p.alignSelection('top')}>⤒</button>
        {p.selectedIds.length > 2 && <button style={miniBtn} title="Distribute horizontally" onClick={() => p.distributeSelection('h')}>↔</button>}
      </>}
      <span style={{ width: 1, background: 'var(--line2)', margin: '2px 1px' }} />
      <button style={{ ...miniBtn, color: 'var(--red)' }} title="Delete (Del)" onClick={() => p.deleteSelection()}>🗑</button>
    </div>
  );
}

const miniBtn: React.CSSProperties = { width: 28, height: 28, border: 0, background: 'transparent', borderRadius: 6, color: 'var(--ink)', fontSize: 14, cursor: 'pointer', display: 'grid', placeItems: 'center' };
