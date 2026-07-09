// ============================================================================
//  Pipe edit menu (F19 extraction from PidFullView.tsx) — double-click an
//  existing pipe: insert equipment / add a branch tee / change line type /
//  delete the connection.
// ============================================================================
import { PIPE_KINDS, pipeSwatch, type PipeKindDef } from '../../lib/geometry';
import { pipeMenuBox, pipeMenuHead, pipeMenuRow } from './pipeMenuStyles';

export default function PipeEditMenu({ sx, sy, onInsert, onChangeType, onDelete, onCancel }: {
  sx: number; sy: number;
  /** `inline` selects the junction for retyping to real equipment; branch
   *  leaves it as a tee ready to connect a side item. Both split the pipe. */
  onInsert: (inline: boolean) => void;
  onChangeType: (kind: PipeKindDef) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ ...pipeMenuBox, left: sx, top: sy }} onPointerDown={(e) => e.stopPropagation()}>
      <div style={pipeMenuHead}>Edit pipe connection</div>
      <button style={pipeMenuRow} onClick={() => onInsert(true)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
        <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>⊕</span>
        <span style={{ display: 'grid' }}>Insert equipment here
          <small style={{ color: 'var(--faint)', fontWeight: 400 }}>Splits pipe: A → new item → B</small></span>
      </button>
      <button style={pipeMenuRow} onClick={() => onInsert(false)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
        <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>⌥</span>
        <span style={{ display: 'grid' }}>Add branch point
          <small style={{ color: 'var(--faint)', fontWeight: 400 }}>Adds a tee — drag from it to a new item</small></span>
      </button>
      <div style={{ ...pipeMenuHead, paddingTop: 8 }}>Change line type</div>
      <div style={{ display: 'flex', gap: 5, padding: '2px 6px 6px' }}>
        {PIPE_KINDS.map((k) => (
          <button key={k.key} title={k.label} onClick={() => onChangeType(k)}
            style={{ flex: 1, height: 16, borderRadius: 4, border: '1px solid var(--line2)', cursor: 'pointer', background: pipeSwatch(k.color) }} />
        ))}
      </div>
      <button style={{ ...pipeMenuRow, color: 'var(--red)' }} onClick={onDelete}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
        <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>🗑</span> Delete connection
      </button>
      <button style={{ ...pipeMenuRow, color: 'var(--faint)', justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
    </div>
  );
}
