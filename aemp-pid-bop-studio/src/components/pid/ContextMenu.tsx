// ============================================================================
//  Right-click context menu — PowerPoint-style editing menu for the P&ID
//  canvas. Two variants: `node` (right-click on a symbol; full edit menu with
//  Arrange / Align / Distribute / Transform / Lock / Group submenus) and
//  `canvas` (right-click on empty space; paste / select all).
//  All actions delegate to the ProjectContext selection API. Rendered as
//  fixed-position HTML above the SVG; a full-screen backdrop closes it.
// ============================================================================
import { useLayoutEffect, useRef, useState } from 'react';
import { useProject } from '../../state/ProjectContext';

export interface CtxMenuState { x: number; y: number; kind: 'node' | 'canvas' }

export default function ContextMenu({ menu, onClose }: { menu: CtxMenuState; onClose: () => void }) {
  const p = useProject();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const [sub, setSub] = useState<string | null>(null);

  // keep the menu on-screen (flip up/left when it would overflow)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 8)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 8)),
    });
  }, [menu]);

  const sel = p.project.nodes.filter((n) => p.selectedIds.includes(n.id));
  const one = sel.length === 1 ? sel[0] : null;
  const multi = sel.length > 1;
  const anyGrouped = sel.some((n) => n.groupId);
  const allLocked = sel.length > 0 && sel.every((n) => n.locked);
  const allSizeLocked = sel.length > 0 && sel.every((n) => n.sizeLocked);

  /** run an action then close */
  const run = (fn: () => void) => () => { fn(); onClose(); };

  const editTag = run(() => {
    if (!one) return;
    const v = prompt('Tag / name', one.tag);
    if (v !== null) p.updateNode(one.id, { tag: v.trim() });
  });
  const editNotes = run(() => {
    if (!one) return;
    const v = prompt('Notes / description', one.description);
    if (v !== null) p.updateNode(one.id, { description: v.trim() });
  });
  const flipVertical = run(() => {
    // flipV = rotate 180° + horizontal mirror
    for (const n of sel) p.updateNode(n.id, { rot: ((n.rot || 0) + 180) % 360, flip: !n.flip });
  });

  return (
    <>
      {/* backdrop: any click (or another right-click) outside closes the menu */}
      <div style={backdrop} onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={ref} style={{ ...panel, left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
        {menu.kind === 'node' ? (
          <>
            <Item label="Cut" shortcut="Ctrl+X" onClick={run(p.cutSelection)} />
            <Item label="Copy" shortcut="Ctrl+C" onClick={run(p.copySelection)} />
            <Item label="Paste" shortcut="Ctrl+V" disabled={!p.clipboardCount} onClick={run(() => p.pasteClipboard())} />
            <Item label="Duplicate" shortcut="Ctrl+D" onClick={run(p.duplicateSelection)} />
            <Item label="Delete" shortcut="Del" danger onClick={run(p.deleteSelection)} />
            <Divider />
            <Sub id="arrange" label="Arrange" sub={sub} setSub={setSub}>
              <Item label="Bring to front" onClick={run(() => p.reorderSelection('front'))} />
              <Item label="Bring forward" onClick={run(() => p.reorderSelection('forward'))} />
              <Item label="Send backward" onClick={run(() => p.reorderSelection('backward'))} />
              <Item label="Send to back" onClick={run(() => p.reorderSelection('back'))} />
            </Sub>
            <Sub id="align" label="Align" sub={sub} setSub={setSub} disabled={!multi}>
              <Item label="Align left" onClick={run(() => p.alignSelection('left'))} />
              <Item label="Align right" onClick={run(() => p.alignSelection('right'))} />
              <Item label="Align top" onClick={run(() => p.alignSelection('top'))} />
              <Item label="Align bottom" onClick={run(() => p.alignSelection('bottom'))} />
              <Item label="Center horizontally" onClick={run(() => p.alignSelection('hcenter'))} />
              <Item label="Center vertically" onClick={run(() => p.alignSelection('vmiddle'))} />
            </Sub>
            <Sub id="dist" label="Distribute" sub={sub} setSub={setSub} disabled={sel.length < 3}>
              <Item label="Distribute horizontally" onClick={run(() => p.distributeSelection('h'))} />
              <Item label="Distribute vertically" onClick={run(() => p.distributeSelection('v'))} />
            </Sub>
            <Sub id="xform" label="Transform" sub={sub} setSub={setSub}>
              <Item label="Rotate 90°" shortcut="R" onClick={run(() => p.rotateSelection())} />
              <Item label="Flip horizontal" shortcut="F" onClick={run(p.flipSelection)} />
              <Item label="Flip vertical" onClick={flipVertical} />
            </Sub>
            <Divider />
            <Item label={allLocked ? 'Unlock position' : 'Lock position'} onClick={run(p.toggleLockSelection)} />
            <Item label={allSizeLocked ? 'Unlock size' : 'Lock size'} onClick={run(p.toggleSizeLockSelection)} />
            <Divider />
            <Item label="Group" disabled={!multi} onClick={run(p.groupSelection)} />
            <Item label="Ungroup" disabled={!anyGrouped} onClick={run(p.ungroupSelection)} />
            <Item label="Select similar symbols" onClick={run(p.selectSimilar)} />
            <Divider />
            <Item label="Rename / edit tag…" disabled={!one} onClick={editTag} />
            <Item label="Edit notes…" disabled={!one} onClick={editNotes} />
            <Item label="Properties panel →" onClick={onClose} hint="right sidebar" />
          </>
        ) : (
          <>
            <Item label="Paste" shortcut="Ctrl+V" disabled={!p.clipboardCount} onClick={run(() => p.pasteClipboard())} />
            <Item label="Select all" shortcut="Ctrl+A" onClick={run(p.selectAll)} />
          </>
        )}
      </div>
    </>
  );
}

// ---- building blocks --------------------------------------------------------

function Item({ label, shortcut, hint, disabled, danger, onClick }: {
  label: string; shortcut?: string; hint?: string; disabled?: boolean; danger?: boolean; onClick?: () => void;
}) {
  return (
    <button
      style={{ ...item, color: danger ? 'var(--red)' : 'var(--ink)', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
      disabled={disabled} onClick={disabled ? undefined : onClick}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget.style.background = 'var(--panel2)'); }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      <span>{label}</span>
      {(shortcut || hint) && <span style={kbd}>{shortcut || hint}</span>}
    </button>
  );
}

/** Hover-to-open submenu (flies out to the right of its row). */
function Sub({ id, label, disabled, sub, setSub, children }: {
  id: string; label: string; disabled?: boolean; sub: string | null;
  setSub: (id: string | null) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => !disabled && setSub(id)} onMouseLeave={() => setSub(null)}>
      <button style={{ ...item, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }} disabled={disabled}>
        <span>{label}</span><span style={{ color: 'var(--faint)' }}>▸</span>
      </button>
      {sub === id && <div style={subPanel}>{children}</div>}
    </div>
  );
}

const Divider = () => <div style={{ height: 1, background: 'var(--line)', margin: '4px 6px' }} />;

// ---- styles ------------------------------------------------------------------
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 95 };
const panel: React.CSSProperties = {
  position: 'fixed', zIndex: 96, minWidth: 216, padding: 5,
  background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10,
  boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column',
};
const subPanel: React.CSSProperties = {
  position: 'absolute', left: '100%', top: -5, zIndex: 97, minWidth: 196, padding: 5,
  background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10,
  boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column',
};
const item: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18,
  width: '100%', border: 0, background: 'transparent', textAlign: 'left',
  padding: '7px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
};
const kbd: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)' };
