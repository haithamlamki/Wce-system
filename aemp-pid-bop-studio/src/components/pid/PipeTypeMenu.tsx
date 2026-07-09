// ============================================================================
//  Pipe-type picker (F19 extraction from PidFullView.tsx) — shown once the
//  user completes a drag from one item's port to another's; choose the new
//  connection's line type/colour, or cancel it.
// ============================================================================
import { PIPE_KINDS, pipeSwatch, type PipeKindDef } from '../../lib/geometry';
import { pipeMenuBox, pipeMenuHead, pipeMenuRow } from './pipeMenuStyles';

export default function PipeTypeMenu({ sx, sy, onChoose, onCancel }: {
  sx: number; sy: number;
  onChoose: (kind: PipeKindDef) => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ ...pipeMenuBox, left: sx, top: sy }} onPointerDown={(e) => e.stopPropagation()}>
      <div style={pipeMenuHead}>Select pipe line type</div>
      {PIPE_KINDS.map((k) => (
        <button key={k.key} style={pipeMenuRow} onClick={() => onChoose(k)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <span style={{ width: 24, height: 7, borderRadius: 4, flex: '0 0 auto', background: pipeSwatch(k.color) }} />
          <span>{k.label}</span>
        </button>
      ))}
      <button style={{ ...pipeMenuRow, color: 'var(--faint)', justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
    </div>
  );
}
