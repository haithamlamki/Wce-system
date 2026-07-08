// ============================================================================
//  P&ID Full — interactive master canvas (PRD §7.3 / §7.5 / §7.11)
//  Admin: drag-from-palette + click-to-place (with approve bar), select/move
//  (snap), connect, rotate/flip/scale/duplicate/delete, full properties panel.
//  Field: pan-and-read; click toggles installed/removed; hover tooltips.
//  Pan / wheel-zoom / fit-to-view, title block + legend overlay, 3D iso view.
// ============================================================================
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProject, type Mode } from '../state/ProjectContext';
import PropertiesPanel from '../components/PropertiesPanel';
import { SYM, SYM_ORDER, type SymbolKey } from '../lib/symbols';
import { STATUS_COLOR, STATUS_LABEL, statusOf } from '../lib/status';
import { safeColor } from '../lib/sanitizeSvg';
import {
  box, buildNodeMap, fitView, GRID, innerTransform, isoDepth, isoPlacement, pickNode,
  PIPE_KINDS, pipeColor, pipeParts, pipeSwatch, ports, proj, routeEdgePoints,
  screenToWorld, snap, type PipeKindDef, type View,
} from '../lib/geometry';
import { parseDrawing } from '../lib/layoutImport';
import ExportDialog from '../components/ExportDialog';
import AnnotationLayer from '../components/AnnotationLayer';
import SymbolLibrary from '../components/SymbolLibrary';
import SvgMarkup from '../components/SvgMarkup';
import type { Component, Edge, PortName } from '../types';

interface PortRef { id: string; port?: PortName }
interface ConnectState { from: PortRef; to: { x: number; y: number }; target?: PortRef }
/** Screen-px grab radius for a node's connection handles. */
const PORT_TOL = 11;

/** Nearest N/E/S/W port to a world point, within tolerance (else undefined). */
function portAt(n: Component, w: { x: number; y: number }, tol: number): PortName | undefined {
  const ps = ports(n);
  let best: PortName | undefined;
  let bd = tol * tol;
  for (const k of ['N', 'E', 'S', 'W'] as PortName[]) {
    const d = (ps[k].x - w.x) ** 2 + (ps[k].y - w.y) ** 2;
    if (d <= bd) { bd = d; best = k; }
  }
  return best;
}
interface Drag {
  kind: 'pan' | 'node' | 'marquee' | 'connect';
  sx: number; sy: number;
  moved?: boolean;
  view0?: View;
  starts?: Array<{ id: string; x: number; y: number }>; // group-drag origins
  base?: string[]; // selection to union with (shift-marquee)
  from?: PortRef;   // connect: source port
  target?: PortRef; // connect: current target port (resolved during the drag)
}
interface Marquee { x0: number; y0: number; x1: number; y1: number }
interface Hover { n: Component; x: number; y: number }

const ARROW_DELTA: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

// canvas legend mirrors the selectable piping line types (single source of truth)
const PIPE_LEGEND = PIPE_KINDS.map((k) => [k.color, k.label] as const);

/** A completed connection awaiting the user's pipe-type choice. `sx`/`sy` are
 *  the picker's screen position (container-relative). */
interface PipeMenu { from: PortRef; to: PortRef; sx: number; sy: number }
/** Double-click edit menu for an existing pipe. `wx`/`wy` = world point clicked
 *  (where a junction is inserted); `sx`/`sy` = screen position of the menu. */
interface PipeEdit { edgeId: string; wx: number; wy: number; sx: number; sy: number }

export default function PidFullView() {
  const p = useProject();
  const { project, refDate, mode } = p;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // F16: a node drag used to call p.moveMany (→ global project state → whole
  // view re-render) on EVERY raw pointermove, which can fire far more often
  // than the screen repaints. Batch commits to once per animation frame
  // instead — same final call chain (moveMany still commits every frame, so
  // pipes/PropertiesPanel keep live-following the drag) and still coalesces
  // into exactly one undo step, just without redundant intra-frame renders.
  const dragRafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<Array<{ id: string; x: number; y: number }> | null>(null);
  const flushPendingMove = useCallback(() => {
    dragRafRef.current = null;
    if (pendingMoveRef.current) { p.moveMany(pendingMoveRef.current); pendingMoveRef.current = null; }
  }, [p]);
  useEffect(() => () => { if (dragRafRef.current != null) cancelAnimationFrame(dragRafRef.current); }, []);
  const drawingRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<View>({ x: 60, y: 60, k: 1 });
  const [connect, setConnect] = useState<ConnectState | null>(null);
  const [pipeMenu, setPipeMenu] = useState<PipeMenu | null>(null);
  const [pipeEdit, setPipeEdit] = useState<PipeEdit | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [portHover, setPortHover] = useState<PortRef | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [iso, setIso] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [palQuery, setPalQuery] = useState('');
  const [palCollapsed, setPalCollapsed] = useState<Set<string>>(new Set());
  const [palHover, setPalHover] = useState<SymbolKey | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  const editable = mode === 'admin' && !iso;
  // drop-shadow depth is per-node SVG filter work — only worth it on smaller
  // diagrams; disable on dense masters to keep rendering fast.
  const shadow = !iso && project.nodes.length <= 80;
  const selSet = useMemo(() => new Set(p.selectedIds), [p.selectedIds]);
  // nodes implicated in any validation issue → red ring (report §2.4)
  const flagged = useMemo(() => new Set(p.issues.flatMap((i) => i.nodeIds)), [p.issues]);
  // F16: id → node lookup so hot paths (edge endpoint resolution, connect/
  // focus handling) don't re-scan the whole node array with `.find`.
  const nodeMap = useMemo(() => buildNodeMap(project.nodes), [project.nodes]);

  // selection bounding box (world) → for the floating mini-toolbar
  const selBounds = useMemo(() => {
    const sel = project.nodes.filter((n) => selSet.has(n.id));
    if (!sel.length) return null;
    let minX = 1e9, minY = 1e9, maxX = -1e9;
    for (const n of sel) { const b = box(n); minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + b.w); }
    return { cx: (minX + maxX) / 2, top: minY };
  }, [project.nodes, selSet]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const doFit = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) setView(fitView(project.nodes, r.width, r.height));
  }, [project.nodes]);

  // F18: this must fit ONLY when a new project/layout lands (revision bump),
  // never on incidental node edits — but `doFit` closes over `project.nodes`,
  // which changes on every edit too, so a naive `[project.revision]` dep array
  // was previously eslint-disabled. Instead: list every dep honestly (so the
  // effect re-runs on incidental edits too) and gate the actual work behind a
  // "have we already fit this revision" ref — semantically identical to the
  // old behavior (fit exactly once per new revision) with no lint suppression.
  const lastFitRevision = useRef<number | null>(null);
  useEffect(() => {
    const rev = project.revision ?? 0;
    if (rev === lastFitRevision.current) return;
    lastFitRevision.current = rev;
    if (project.nodes.length) doFit();
  }, [project.revision, project.nodes, doFit]);

  // FR-27: when the register requests focus, re-center on that node (in 2D).
  // F18: gated the same way as the fit effect above (only act on a genuinely
  // new focusSeq) so `view.k` and `nodeMap` can be honest dependencies without
  // re-centering every time the user merely pans/zooms or edits the project —
  // and because `view.k` is now a real dependency, the effect always reads the
  // CURRENT zoom (no more stale `view.k`).
  const lastFocusSeq = useRef(0);
  useEffect(() => {
    if (p.focusSeq === lastFocusSeq.current) return;
    lastFocusSeq.current = p.focusSeq;
    if (!p.focusId) return;
    const node = nodeMap.get(p.focusId);
    const r = svgRef.current?.getBoundingClientRect();
    if (!node || !r) return;
    setIso(false);
    const b = box(node);
    const k = Math.max(view.k, 1);
    setView({ k, x: r.width / 2 - (node.x + b.w / 2) * k, y: r.height / 2 - (node.y + b.h / 2) * k });
  }, [p.focusSeq, p.focusId, nodeMap, view.k]);

  // F18: keep the latest values the keydown handler needs in refs, updated
  // every render, so the `window` listener can be attached exactly ONCE
  // (empty dep array) instead of being torn down/re-added on every state
  // change (previously deps were `[editable, p, selectedEdgeId]`).
  const pRef = useRef(p);
  pRef.current = p;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const selectedEdgeIdRef = useRef(selectedEdgeId);
  selectedEdgeIdRef.current = selectedEdgeId;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (!editableRef.current) return;
      const proj = pRef.current;
      const mod = e.ctrlKey || e.metaKey;
      // undo / redo
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); proj.undo(); return; }
      if (mod && ((e.key === 'z' || e.key === 'Z') && e.shiftKey || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); proj.redo(); return; }
      // clipboard + select-all work on the whole selection
      if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); proj.copySelection(); return; }
      if (mod && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); proj.cutSelection(); return; }
      if (mod && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); proj.pasteClipboard(); return; }
      if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); proj.selectAll(); return; }
      if (e.key === 'Escape') { proj.clearSelection(); setConnect(null); setPortHover(null); setPipeMenu(null); setPipeEdit(null); setSelectedEdgeId(null); return; }
      // a selected pipe (no node selection) can be deleted with Del/Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeIdRef.current && !proj.selectedIds.length) {
        e.preventDefault(); proj.deleteEdge(selectedEdgeIdRef.current); setSelectedEdgeId(null); return;
      }
      if (!proj.selectedIds.length) return;
      const arrow = ARROW_DELTA[e.key];
      if (arrow) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : GRID; // Shift = 1px fine nudge, else one grid cell
        const sel = new Set(proj.selectedIds);
        proj.moveMany(proj.project.nodes.filter((n) => sel.has(n.id)).map((n) => ({ id: n.id, x: n.x + arrow[0] * step, y: n.y + arrow[1] * step })));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); proj.deleteSelection(); }
      else if (e.key === 'r' || e.key === 'R') proj.rotateSelection(e.shiftKey);
      else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); proj.duplicateSelection(); }
      else if (e.key === 'f' || e.key === 'F') proj.flipSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- pointer interactions (one unified mode) ------------------------------
  //  • hover an item       → its N/E/S/W connection handles appear
  //  • drag from a handle  → draw a connection (snaps to a target item's port)
  //  • drag an item body   → move it (+ group / multi-select)
  //  • drag empty space    → marquee select
  //  • middle-mouse drag   → pan the canvas (any mode); wheel still zooms
  function onPointerDown(e: React.PointerEvent) {
    const { px, py } = local(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // any new canvas action dismisses pipe pickers / deselects a pipe (pipe
    // clicks stopPropagation before here, so this only fires on node/empty clicks)
    setPipeMenu(null); setPipeEdit(null); setSelectedEdgeId(null);
    const w = screenToWorld(px, py, view);

    // Middle mouse always pans (so left-drag stays free for connect/move/marquee)
    if (e.button === 1) { e.preventDefault(); setHover(null); setPortHover(null); dragRef.current = { kind: 'pan', sx: px, sy: py, view0: { ...view } }; return; }

    // 3D presentation or Field role = read-only: left-drag pans, hover only
    if (iso || mode === 'field') { dragRef.current = { kind: 'pan', sx: px, sy: py, view0: { ...view } }; return; }

    if (e.button !== 0) return; // admin 2D edits are left-button only

    const hit = pickNode(project.nodes, w.x, w.y);
    // Press on (or right next to) a connection handle → start a connection
    const cand = hit ?? hover?.n ?? null;
    const fromPort = cand ? portAt(cand, w, PORT_TOL / view.k) : undefined;
    if (cand && fromPort) {
      const from: PortRef = { id: cand.id, port: fromPort };
      dragRef.current = { kind: 'connect', sx: px, sy: py, from };
      setConnect({ from, to: w });
      setPortHover(from);
      return;
    }

    if (hit) {
      // Shift / Ctrl / ⌘ click toggles membership without starting a drag
      if (e.shiftKey || e.ctrlKey || e.metaKey) { p.toggleSelect(hit.id); return; }
      // a grouped node selects its whole group; clicking within a multi-
      // selection keeps the group (so you can drag them all together)
      const groupMates = hit.groupId ? project.nodes.filter((n) => n.groupId === hit.groupId).map((n) => n.id) : [hit.id];
      const groupIds = selSet.has(hit.id) && p.selectedIds.length > 1 ? p.selectedIds : groupMates;
      if (!selSet.has(hit.id) || p.selectedIds.length <= 1) {
        if (groupMates.length > 1) p.setSelectedIds(groupMates); else p.setSelectedId(hit.id);
      }
      const starts = project.nodes.filter((n) => groupIds.includes(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
      setHover(null); setPortHover(null); // hide handles while moving the body
      dragRef.current = { kind: 'node', sx: px, sy: py, starts };
      return;
    }

    // empty space → marquee select
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    setHover(null); setPortHover(null);
    dragRef.current = { kind: 'marquee', sx: px, sy: py, base: additive ? p.selectedIds : [] };
    if (!additive) p.clearSelection();
    setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    const { px, py } = local(e);
    const d = dragRef.current;
    if (!d) {
      if (iso) return;
      const w = screenToWorld(px, py, view);
      const hit = pickNode(project.nodes, w.x, w.y);
      setHover(hit ? { n: hit, x: e.clientX, y: e.clientY } : null);
      // admin: light up the handle nearest the cursor on the hovered item
      if (mode === 'admin') setPortHover(hit ? { id: hit.id, port: portAt(hit, w, PORT_TOL / view.k) } : null);
      return;
    }
    d.moved = true;
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.view0!.x + (px - d.sx), y: d.view0!.y + (py - d.sy) }));
    else if (d.kind === 'node' && d.starts) {
      const dx = (px - d.sx) / view.k;
      const dy = (py - d.sy) / view.k;
      pendingMoveRef.current = d.starts.map((s) => ({ id: s.id, x: snap(s.x + dx), y: snap(s.y + dy) }));
      if (dragRafRef.current == null) dragRafRef.current = requestAnimationFrame(flushPendingMove);
    } else if (d.kind === 'marquee') {
      const w = screenToWorld(px, py, view);
      setMarquee((m) => (m ? { ...m, x1: w.x, y1: w.y } : m));
    } else if (d.kind === 'connect') {
      const w = screenToWorld(px, py, view);
      const hit = pickNode(project.nodes, w.x, w.y);
      // over another item → snap to its nearest port (and reveal its handles)
      const target = hit && hit.id !== d.from!.id ? { id: hit.id, port: portAt(hit, w, 1e6) } : undefined;
      d.target = target;
      setHover(hit ? { n: hit, x: e.clientX, y: e.clientY } : null);
      setPortHover(target ?? null);
      setConnect((c) => (c ? { ...c, to: w, target } : c));
    }
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    // F16: flush any move batched for the next animation frame synchronously,
    // so the final drop position always commits (never lost to a cancelled
    // rAF), and this frame's drag ends in exactly one settled position.
    if (dragRafRef.current != null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
    if (pendingMoveRef.current) { p.moveMany(pendingMoveRef.current); pendingMoveRef.current = null; }
    if (d?.kind === 'marquee' && marquee) {
      const xMin = Math.min(marquee.x0, marquee.x1), xMax = Math.max(marquee.x0, marquee.x1);
      const yMin = Math.min(marquee.y0, marquee.y1), yMax = Math.max(marquee.y0, marquee.y1);
      const inside = project.nodes.filter((n) => {
        const b = box(n);
        return n.x < xMax && n.x + b.w > xMin && n.y < yMax && n.y + b.h > yMin;
      }).map((n) => n.id);
      p.setSelectedIds(Array.from(new Set([...(d.base ?? []), ...inside])));
      setMarquee(null);
    }
    if (d?.kind === 'connect') {
      // complete only when released on another item's port → offer the pipe-type
      // picker (positioned at the mid-point of the new run, in screen space)
      if (d.from && d.target && d.target.id !== d.from.id) {
        const fromN = nodeMap.get(d.from.id);
        const toN = nodeMap.get(d.target.id);
        if (fromN && toN) {
          const fp = ports(fromN)[d.from.port as PortName];
          const tp = ports(toN)[d.target.port as PortName];
          const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
          setPipeMenu({ from: d.from, to: d.target, sx: mx * view.k + view.x, sy: my * view.k + view.y });
        }
      }
      setConnect(null); setPortHover(null); setHover(null);
    }
  }

  /** Commit the pending connection with the chosen pipe type + colour. */
  function choosePipe(kind: PipeKindDef) {
    if (!pipeMenu) return;
    p.addEdge(pipeMenu.from.id, pipeMenu.to.id, {
      fromPort: pipeMenu.from.port, toPort: pipeMenu.to.port,
      lineType: kind.key, color: kind.color,
    });
    setPipeMenu(null);
  }

  // ---- pipe editing (select / double-click to insert or branch) -------------
  function selectEdge(id: string) { p.clearSelection(); setPipeMenu(null); setPipeEdit(null); setSelectedEdgeId(id); }
  function openPipeEdit(e: React.MouseEvent, edgeId: string) {
    const { px, py } = local(e);
    const w = screenToWorld(px, py, view);
    p.clearSelection(); setPipeMenu(null); setSelectedEdgeId(edgeId);
    setPipeEdit({ edgeId, wx: w.x, wy: w.y, sx: px, sy: py });
  }
  /** Insert a junction on the pipe at the clicked point (splits A→B into A→J→B).
   *  `inline` selects the junction for retyping to real equipment; branch leaves
   *  it as a tee ready to connect a side item. Both keep the pipe type/colour. */
  function insertOnPipe(inline: boolean) {
    if (!pipeEdit) return;
    p.splitEdgeAt(pipeEdit.edgeId, 'junction', { x: pipeEdit.wx, y: pipeEdit.wy });
    setPipeEdit(null); setSelectedEdgeId(null);
    void inline; // both paths split; the junction is selected for the next step
  }
  function changeEdgeType(kind: PipeKindDef) {
    if (!pipeEdit) return;
    p.setEdgeType(pipeEdit.edgeId, kind.key, kind.color);
    setPipeEdit(null);
  }
  function deleteEdgeFromMenu() {
    if (!pipeEdit) return;
    p.deleteEdge(pipeEdit.edgeId);
    setPipeEdit(null); setSelectedEdgeId(null);
  }

  function onWheel(e: React.WheelEvent) {
    const { px, py } = local(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => {
      const k = Math.max(0.2, Math.min(4, v.k * factor));
      const wx = (px - v.x) / v.k;
      const wy = (py - v.y) / v.k;
      return { k, x: px - wx * k, y: py - wy * k };
    });
  }

  // ---- palette drag/drop + click-to-place (approve) ------------------------
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData('type') as SymbolKey;
    if (!type || !SYM[type] || iso) return;
    const { px, py } = local(e);
    const w = screenToWorld(px, py, view);
    const s = SYM[type];
    p.addNode(type, snap(w.x - s.w / 2), snap(w.y - s.h / 2)); // drag = direct place
  }
  function placeCentre(type: SymbolKey) {
    const r = svgRef.current!.getBoundingClientRect();
    const w = screenToWorld(r.width / 2, r.height / 2, view);
    const s = SYM[type];
    const id = p.addNode(type, snap(w.x - s.w / 2), snap(w.y - s.h / 2));
    setPendingId(id); // click = pending → approve
  }
  const approve = () => setPendingId(null);
  const cancelPending = () => { if (pendingId) p.deleteNode(pendingId); setPendingId(null); };

  function addNote() {
    const r = svgRef.current!.getBoundingClientRect();
    const w = screenToWorld(r.width / 2, r.height / 2, view);
    p.addAnnotation({ kind: 'text', x: snap(w.x), y: snap(w.y), w: 140, h: 24, text: 'Note' });
  }

  async function onImportDrawing(file: File) {
    try {
      const { template, pipes, source } = parseDrawing(await file.text());
      const n = p.loadLayout(template, pipes);
      alert(`Imported ${n} items + ${pipes.length} pipe runs (${source}). Equipment was matched to library symbols; review tags before saving.`);
    } catch (e) {
      alert(`Could not import drawing: ${(e as Error).message}`);
    }
  }

  const showPalette = mode === 'admin' && !iso;
  const hasNodes = project.nodes.length > 0;
  const pendingNode = (pendingId && nodeMap.get(pendingId)) ?? null;

  return (
    <>
      {showPalette && (
        <aside style={paletteStyle}>
          <div style={palHeader}>
            <button style={primaryBtn} onClick={p.loadMaster}>Build Full P&amp;ID</button>
            <button style={{ ...primaryBtn, background: 'var(--panel2)', color: 'var(--ink)' }} onClick={() => p.importAEMP()}>Import from AEMP</button>
            <button style={{ ...primaryBtn, background: 'var(--panel2)', color: 'var(--ink)' }} onClick={() => drawingRef.current?.click()}>Import drawing…</button>
            <button style={{ ...primaryBtn, background: 'var(--panel2)', color: 'var(--ink)' }} onClick={() => setShowLibrary(true)}>⊞ Symbol library</button>
            <button style={{ ...primaryBtn, background: 'var(--panel2)', color: 'var(--red)', marginBottom: 0 }}
              onClick={() => { if (confirm('Clear the entire canvas — all equipment, piping and annotations?')) p.clearCanvas(); }}>Clear canvas</button>
            <input ref={drawingRef} type="file" accept=".html,.htm,.json,.js,text/html,application/json" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportDrawing(f); e.target.value = ''; }} />
            <input placeholder="Search symbols…" value={palQuery} onChange={(e) => setPalQuery(e.target.value)} style={palSearch} />
          </div>
          <div style={palScroll}>
          {(() => {
            const q = palQuery.trim().toLowerCase();
            const hidden = new Set(p.project.hiddenSymbols ?? []);
            return SYM_ORDER.map((cat) => {
              const items = Object.entries(SYM).filter(([key, s]) => s.cat === cat && !hidden.has(key) && (!q || s.name.toLowerCase().includes(q) || key.includes(q)));
              if (!items.length) return null;
              const collapsed = !q && palCollapsed.has(cat);
              return (
                <div key={cat}>
                  <div style={palHead} onClick={() => !q && setPalCollapsed((cs) => { const n = new Set(cs); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}>
                    <span>{q ? '' : (collapsed ? '▸ ' : '▾ ')}{cat}</span>
                    <span style={{ opacity: 0.6 }}>{items.length}</span>
                  </div>
                  {!collapsed && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {items.map(([key, s]) => (
                        <div key={key} title={s.name} style={palCard} draggable
                          onDragStart={(e) => e.dataTransfer.setData('type', key)}
                          onClick={() => placeCentre(key as SymbolKey)}
                          onMouseEnter={() => setPalHover(key as SymbolKey)}
                          onMouseLeave={() => setPalHover((h) => (h === key ? null : h))}>
                          <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width={44} height={36}>
                            <SvgMarkup svg={s.svg} style={{ color: safeColor(s.color) }} />
                          </svg>
                          <span style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'center' }}>{s.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
          <div style={{ fontSize: 11, color: 'var(--faint)', lineHeight: 1.6, padding: '12px 4px', borderTop: '1px solid var(--line)', marginTop: 12 }}>
            Click a symbol to place &amp; approve, or drag it onto the canvas.<br />
            <b>Hover an item</b> for its connection handles · <b>drag a handle</b> to another item to connect.<br />
            <b>Drag the body</b> to move · <b>middle-mouse drag</b> to pan · <b>wheel</b> to zoom.<br />
            <b>Shift-click</b> or <b>drag a box</b> to multi-select · <b>Ctrl+A</b> all · <b>Esc</b> clear.<br />
            <b>Ctrl+C/X/V</b> copy/cut/paste · <b>R</b> rotate (⇧R type) · <b>D</b> duplicate · <b>F</b> flip · <b>Del</b> remove.<br />
            <b>Arrow keys</b> nudge by grid · <b>Shift+Arrow</b> nudge 1px · <b>Ctrl+Z/⇧Z</b> undo/redo.
          </div>
          </div>
        </aside>
      )}

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--sunk)' }}>
        {/* left toolbar (admin, 2D) */}
        {editable && (
          <div style={toolbar}>
            <button style={tbtn} title="Add text note" onClick={addNote}>✎</button>
            <span style={{ width: 1, background: 'var(--line2)', margin: '4px 2px' }} />
            <button style={{ ...tbtn, opacity: p.canUndo ? 1 : 0.35 }} title="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.undo}>↶</button>
            <button style={{ ...tbtn, opacity: p.canRedo ? 1 : 0.35 }} title="Redo (Ctrl+Shift+Z)" disabled={!p.canRedo} onClick={p.redo}>↷</button>
          </div>
        )}

        {/* top-right view controls (both modes) */}
        <div style={viewControls}>
          {p.issues.length > 0 && (
            <button style={{ ...pill, ...(showWarnings ? pillActive : {}), borderColor: showWarnings ? 'var(--accent)' : 'var(--amber)', color: showWarnings ? '#fff' : 'var(--amber)' }}
              title="Layout validation warnings" onClick={() => setShowWarnings((v) => !v)}>
              ⚠ {p.issues.length}
            </button>
          )}
          <button style={{ ...pill, ...(iso ? pillActive : {}) }} onClick={() => { setIso((v) => !v); setConnect(null); setPortHover(null); }}>3D</button>
          <button style={{ ...pill, ...(showTitle ? pillActive : {}) }} onClick={() => setShowTitle((v) => !v)}>Title</button>
          <button style={pill} title="Export / Print (PDF, PNG, SVG)" onClick={() => setShowExport(true)}>⎙ Export</button>
        </div>

        {/* validation warnings panel (report §2.4) — click an issue to zoom to it */}
        {showWarnings && p.issues.length > 0 && (
          <div style={warnPanel}>
            <div style={warnHead}>
              <span>Validation · {p.issues.length} issue{p.issues.length === 1 ? '' : 's'}</span>
              <button style={{ ...miniBtn, width: 22, height: 22 }} onClick={() => setShowWarnings(false)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 280 }}>
              {p.issues.map((i) => (
                <button key={i.id} style={warnRow}
                  title="Show on diagram"
                  onClick={() => { if (i.nodeIds[0]) p.requestFocus(i.nodeIds[0]); }}>
                  <span style={{ color: i.severity === 'error' ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>
                    {i.severity === 'error' ? '⛔' : '⚠'}
                  </span>
                  <span style={{ flex: 1 }}>{i.message}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'field' && !iso && <div style={modebar}>Field mode · read-only (pan &amp; hover)</div>}
        {iso && <div style={{ ...modebar, background: 'color-mix(in srgb,var(--accent2) 14%,var(--panel))', borderColor: 'var(--accent2)', color: 'var(--accent2)' }}>3D presentation · pan &amp; hover (editing disabled)</div>}
        {connect && <div style={{ ...modebar, top: 56, background: 'color-mix(in srgb,var(--accent2) 14%,var(--panel))', borderColor: 'var(--accent2)', color: 'var(--accent2)' }}>Drag to a handle on another item — release to connect</div>}

        {/* approve bar (click-to-place) */}
        {pendingNode && (
          <div style={approveBar}>
            <div style={{ fontSize: 12.5 }}>
              Placed <b style={{ color: 'var(--accent)' }}>{SYM[pendingNode.type as SymbolKey]?.name}</b>
              <small style={{ display: 'block', color: 'var(--faint)', fontSize: 11 }}>Drag to fine-tune, then approve</small>
            </div>
            <button style={primarySm} onClick={approve}>✓ Approve</button>
            <button style={ghostSm} onClick={cancelPending}>Cancel</button>
          </div>
        )}

        {/* pipe-type picker — shown only while creating a new connection */}
        {pipeMenu && (
          <div style={{ ...pipeMenuBox, left: pipeMenu.sx, top: pipeMenu.sy }}
            onPointerDown={(e) => e.stopPropagation()}>
            <div style={pipeMenuHead}>Select pipe line type</div>
            {PIPE_KINDS.map((k) => (
              <button key={k.key} style={pipeMenuRow} onClick={() => choosePipe(k)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ width: 24, height: 7, borderRadius: 4, flex: '0 0 auto', background: pipeSwatch(k.color) }} />
                <span>{k.label}</span>
              </button>
            ))}
            <button style={{ ...pipeMenuRow, color: 'var(--faint)', justifyContent: 'center' }}
              onClick={() => setPipeMenu(null)}>Cancel</button>
          </div>
        )}

        {/* pipe edit menu — double-click an existing pipe: insert / branch /
            change type / delete. Only shown while editing that pipe. */}
        {pipeEdit && (
          <div style={{ ...pipeMenuBox, left: pipeEdit.sx, top: pipeEdit.sy }}
            onPointerDown={(e) => e.stopPropagation()}>
            <div style={pipeMenuHead}>Edit pipe connection</div>
            <button style={pipeMenuRow} onClick={() => insertOnPipe(true)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>⊕</span>
              <span style={{ display: 'grid' }}>Insert equipment here
                <small style={{ color: 'var(--faint)', fontWeight: 400 }}>Splits pipe: A → new item → B</small></span>
            </button>
            <button style={pipeMenuRow} onClick={() => insertOnPipe(false)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>⌥</span>
              <span style={{ display: 'grid' }}>Add branch point
                <small style={{ color: 'var(--faint)', fontWeight: 400 }}>Adds a tee — drag from it to a new item</small></span>
            </button>
            <div style={{ ...pipeMenuHead, paddingTop: 8 }}>Change line type</div>
            <div style={{ display: 'flex', gap: 5, padding: '2px 6px 6px' }}>
              {PIPE_KINDS.map((k) => (
                <button key={k.key} title={k.label} onClick={() => changeEdgeType(k)}
                  style={{ flex: 1, height: 16, borderRadius: 4, border: '1px solid var(--line2)', cursor: 'pointer', background: pipeSwatch(k.color) }} />
              ))}
            </div>
            <button style={{ ...pipeMenuRow, color: 'var(--red)' }} onClick={deleteEdgeFromMenu}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>🗑</span> Delete connection
            </button>
            <button style={{ ...pipeMenuRow, color: 'var(--faint)', justifyContent: 'center' }}
              onClick={() => { setPipeEdit(null); setSelectedEdgeId(null); }}>Cancel</button>
          </div>
        )}

        <svg ref={svgRef} width="100%" height="100%"
          style={{ position: 'absolute', inset: 0, cursor: iso || mode === 'field' ? 'grab' : connect || portHover?.port ? 'crosshair' : 'default', touchAction: 'none' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerLeave={() => { onPointerUp(); setHover(null); }}
          onWheel={onWheel} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <defs>
            <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--grid)" strokeWidth={1} />
            </pattern>
            {/* subtle depth for symbol artwork (higher-fidelity rendering) */}
            <filter id="symShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#0b1a26" floodOpacity="0.26" />
            </filter>
          </defs>
          {!iso && <rect x={0} y={0} width="100%" height="100%" fill="url(#grid)" />}

          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* piping */}
            {project.pipes.map(([x1, y1, x2, y2, color], i) => {
              const a = iso ? proj(x1, y1) : { x: x1, y: y1 };
              const b = iso ? proj(x2, y2) : { x: x2, y: y2 };
              return <line key={`p${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={iso ? 0.55 : 0.9} />;
            })}
            {/* user connections — rendered as real piping: straight pipe when
                aligned, else pipe segments joined by matching-colour elbows.
                The route recomputes from live node positions every render, so it
                follows the items when they move. */}
            {project.edges.map((e) => {
              const a = nodeMap.get(e.from);
              const b = nodeMap.get(e.to);
              if (!a || !b) return null;
              const color = e.color || pipeColor(e.lineType) || 'var(--accent2)';
              if (iso) {
                const ba = box(a), bb = box(b);
                const pa = proj(a.x + ba.w / 2, a.y + ba.h / 2);
                const pb = proj(b.x + bb.w / 2, b.y + bb.h / 2);
                return <line key={e.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={color} strokeWidth={2.2} opacity={0.55} />;
              }
              return (
                <EdgeG key={e.id} edge={e} a={a} b={b} color={color} selected={selectedEdgeId === e.id}
                  mode={mode} onSelect={selectEdge} onEdit={openPipeEdit} />
              );
            })}
            {/* connection handles — auto-shown on the hovered item, the connection
                source, and the current target (no mode switch needed) */}
            {!iso && mode === 'admin' && (() => {
              const ids = new Set<string>();
              if (hover) ids.add(hover.n.id);
              if (connect) { ids.add(connect.from.id); if (connect.target) ids.add(connect.target.id); }
              return [...ids].map((id) => {
                const n = nodeMap.get(id);
                if (!n) return null;
                const ps = ports(n);
                return (['N', 'E', 'S', 'W'] as PortName[]).map((k) => {
                  const lit = (portHover?.id === id && portHover.port === k)
                    || (connect?.from.id === id && connect.from.port === k)
                    || (connect?.target?.id === id && connect.target.port === k);
                  return <circle key={`${id}${k}`} cx={ps[k].x} cy={ps[k].y} r={(lit ? 6 : 4.5) / view.k}
                    fill={lit ? 'var(--accent2)' : 'var(--panel)'} stroke="var(--accent2)" strokeWidth={1.6 / view.k}
                    style={{ cursor: 'crosshair' }} />;
                });
              });
            })()}
            {/* nodes */}
            {(iso ? [...project.nodes].sort((x, y) => isoDepth(x) - isoDepth(y)) : project.nodes).map((n) => (
              <NodeG key={n.id} n={n} selected={selSet.has(n.id)} connecting={connect?.from.id === n.id}
                pending={pendingId === n.id} flagged={flagged.has(n.id)} shadow={shadow} refDate={refDate} iso={iso} />
            ))}
            {/* live connection rubber-band (from the source port to the cursor / snapped target port) */}
            {connect && !iso && (() => {
              const fromN = nodeMap.get(connect.from.id);
              if (!fromN) return null;
              const a = ports(fromN)[connect.from.port as PortName];
              let b = connect.to;
              if (connect.target) { const tn = nodeMap.get(connect.target.id); if (tn) b = ports(tn)[connect.target.port as PortName]; }
              return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent2)" strokeWidth={2.2 / view.k}
                strokeDasharray={`${6 / view.k} ${4 / view.k}`} opacity={0.95} pointerEvents="none" />;
            })()}
            {marquee && (
              <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                fill="color-mix(in srgb, var(--accent) 10%, transparent)" stroke="var(--accent)" strokeWidth={1 / view.k} strokeDasharray={`${4 / view.k} ${3 / view.k}`} />
            )}
          </g>
        </svg>

        <AnnotationLayer view={view} editable={editable} />

        {/* floating selection mini-toolbar */}
        {editable && selBounds && !marquee && p.selectedIds.length > 0 && (() => {
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
        })()}

        {/* zoom controls */}
        <div style={zoombar}>
          <button style={zbtn} onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k / 1.2) }))}>−</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', minWidth: 42, textAlign: 'center' }}>{Math.round(view.k * 100)}%</span>
          <button style={zbtn} onClick={() => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.2) }))}>+</button>
          <button style={{ ...zbtn, width: 'auto', padding: '0 8px', fontSize: 11 }} onClick={doFit}>FIT</button>
        </div>

        {/* piping legend */}
        {showTitle && hasNodes && (
          <div style={legend}>
            <b style={legendHead}>PIPING &amp; LINES</b>
            {PIPE_LEGEND.map(([c, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
                <span style={{ width: 22, height: 6, borderRadius: 3, background: pipeSwatch(c) }} />{label}
              </div>
            ))}
          </div>
        )}

        {/* title block */}
        {showTitle && hasNodes && (
          <div style={titleBlock}>
            <div style={tbHead}>{project.meta.title || 'HP WELL CONTROL EQUIPMENT'}</div>
            <TBRow k="Drawing" v={project.meta.drawingNo || 'AEMP / HPWC P&ID'} />
            <TBRow k="Rig / Unit" v={project.meta.rig} />
            <TBRow k="Ref date" v={project.meta.date} />
            <TBRow k="Inspector" v={project.meta.who || '—'} />
            <TBRow k="Items" v={String(project.nodes.length)} />
          </div>
        )}

        {!hasNodes && (
          <div className="placeholder" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <div><strong>No master P&amp;ID yet</strong>{showPalette ? 'Click “Build Full P&ID”, import from AEMP, or drag a symbol in.' : 'Switch to Admin mode to build the master.'}</div>
          </div>
        )}
      </div>

      {mode === 'admin' && !iso && <PropertiesPanel />}
      {hover && !iso && !connect && <Tooltip h={hover} refDate={refDate} />}
      {showExport && <ExportDialog project={project} refDate={refDate} onClose={() => setShowExport(false)} />}
      {showLibrary && <SymbolLibrary onClose={() => setShowLibrary(false)} />}
      {showPalette && palHover && SYM[palHover] && (
        <div style={palPreview}>
          <svg viewBox={`-4 -4 ${SYM[palHover].w + 8} ${SYM[palHover].h + 8}`} width={130} height={104}>
            <SvgMarkup svg={SYM[palHover].svg} style={{ color: safeColor(SYM[palHover].color) }} />
          </svg>
          <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 6 }}>{SYM[palHover].name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--faint)' }}>{SYM[palHover].cat}{SYM[palHover].defaults?.size ? ` · ${SYM[palHover].defaults!.size}` : ''}</div>
        </div>
      )}
    </>
  );
}

type Pt = { x: number; y: number };
/** One glossy tube layer set (dark casing → base → sheen → bright core). */
function tube(d: string, color: string, scale = 1) {
  const dark = `color-mix(in srgb, ${color} 55%, #000)`;
  const light = `color-mix(in srgb, ${color} 45%, #fff)`;
  const core = `color-mix(in srgb, ${color} 12%, #fff)`;
  return (
    <>
      <path d={d} stroke={dark} strokeWidth={9.5 * scale} />
      <path d={d} stroke={color} strokeWidth={7 * scale} />
      <path d={d} stroke={light} strokeWidth={3.6 * scale} />
      <path d={d} stroke={core} strokeWidth={1.4 * scale} opacity={0.9} />
    </>
  );
}

/**
 * A piping run drawn as real fittings: straight glossy tube segments with a
 * SEPARATE elbow fitting at each bend. Elbows are trimmed out of the straight
 * run and drawn on top, slightly larger and flanged, so the pipe reads as
 * "segment → elbow → segment" (each bend its own visible component) rather than
 * one continuous line. Every shade derives from the line colour, so the elbow
 * always matches its pipe's type/colour.
 */
// F16: memoized so an unrelated re-render (e.g. another node's drag tick)
// doesn't re-run this pipe's fitting geometry when its own props are unchanged.
const Pipe = memo(function Pipe({ pts, color, selected }: { pts: Pt[]; color: string; selected?: boolean }) {
  const { segments, elbows } = pipeParts(pts, 14);
  const dark = `color-mix(in srgb, ${color} 55%, #000)`;
  const seg = (a: Pt, b: Pt) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  return (
    <g fill="none">
      {/* selection glow behind everything */}
      {selected && [...segments.map(([a, b]) => seg(a, b)),
        ...elbows.map((e) => `M ${e.a.x} ${e.a.y} Q ${e.corner.x} ${e.corner.y} ${e.b.x} ${e.b.y}`)]
        .map((d, i) => <path key={`g${i}`} d={d} stroke="var(--accent)" strokeWidth={16} opacity={0.3} strokeLinecap="round" />)}

      {/* straight pipe segments (flat ends so the elbow fitting caps them) */}
      <g strokeLinecap="butt">
        {segments.map(([a, b], i) => <g key={`s${i}`}>{tube(seg(a, b), color)}</g>)}
      </g>

      {/* separate elbow fittings, on top, wider + flanged */}
      {elbows.map((e, i) => {
        const d = `M ${e.a.x} ${e.a.y} Q ${e.corner.x} ${e.corner.y} ${e.b.x} ${e.b.y}`;
        return (
          <g key={`e${i}`} strokeLinecap="round">
            <path d={d} stroke={dark} strokeWidth={13.5} />
            {tube(d, color, 1.28)}
            {[e.a, e.b].map((c, j) => (
              <circle key={j} cx={c.x} cy={c.y} r={6} fill="none" stroke={dark} strokeWidth={1.6} opacity={0.9} />
            ))}
          </g>
        );
      })}
    </g>
  );
});

/**
 * One edge's route + hit-target, split out of the edges.map loop so its route
 * (routeEdgePoints) only recomputes when ITS OWN endpoints/edge/selection
 * actually change (memoized here + React.memo), instead of on every render of
 * the whole canvas (F16 — "edge routes recomputed inside the render loop").
 */
const EdgeG = memo(function EdgeG({ edge, a, b, color, selected, mode, onSelect, onEdit }: {
  edge: Edge; a: Component; b: Component; color: string; selected: boolean; mode: Mode;
  onSelect: (id: string) => void; onEdit: (e: React.MouseEvent, edgeId: string) => void;
}) {
  const pts = useMemo(() => routeEdgePoints(a, b, edge), [a, b, edge]);
  const hitD = useMemo(() => pts.map((pt, i) => `${i ? 'L' : 'M'} ${pt.x} ${pt.y}`).join(' '), [pts]);
  return (
    <g>
      <Pipe pts={pts} color={color} selected={selected} />
      {/* wide invisible hit-line: click selects the pipe, double-click
          opens the edit menu — the pipe itself is never dragged. */}
      {mode === 'admin' && (
        <path d={hitD} stroke="transparent" strokeWidth={18} fill="none"
          strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke"
          style={{ cursor: 'pointer' }}
          onPointerDown={(ev) => { ev.stopPropagation(); onSelect(edge.id); }}
          onDoubleClick={(ev) => { ev.stopPropagation(); onEdit(ev, edge.id); }} />
      )}
    </g>
  );
});

const NodeG = memo(function NodeG({ n, selected, connecting, pending, flagged, shadow, refDate, iso }: { n: Component; selected: boolean; connecting: boolean; pending: boolean; flagged: boolean; shadow: boolean; refDate: Date; iso: boolean }) {
  const s = SYM[n.type as SymbolKey];
  if (!s) return null;
  const { w: ew, h: eh } = box(n);
  const st = statusOf(n, refDate);
  const ip = iso ? isoPlacement(n) : null;
  const outer = iso ? `translate(${ip!.x},${ip!.y})` : `translate(${n.x},${n.y})`;
  return (
    <g transform={outer} opacity={n.removed ? 0.28 : 1} style={{ color: safeColor(s.color) }}>
      {iso && (
        <>
          <ellipse cx={ew / 2} cy={ip!.lift + eh / 2 + 4} rx={ew * 0.5} ry={ew * 0.2} fill="#0b1a2655" />
          <line x1={ew / 2} y1={eh} x2={ew / 2} y2={ip!.lift + eh / 2} stroke="#4a5a68" strokeWidth={2} opacity={0.5} />
        </>
      )}
      {flagged && !iso && (
        <rect x={-7} y={-7} width={ew + 14} height={eh + 30} rx={7}
          fill="none" stroke="var(--red)" strokeWidth={1.8} strokeDasharray="3 3" opacity={0.85} />
      )}
      {(selected || connecting) && !iso && (
        <rect x={-9} y={-9} width={ew + 18} height={eh + 34} rx={7}
          fill="color-mix(in srgb, var(--accent) 7%, transparent)"
          stroke={connecting ? 'var(--accent2)' : 'var(--accent)'} strokeWidth={1.6} strokeDasharray="4 3" />
      )}
      {n.locked && !iso && (
        <text x={ew - 2} y={eh + 1} textAnchor="end" style={{ font: '10px var(--body)' }}>🔒</text>
      )}
      <SvgMarkup svg={s.svg} transform={innerTransform(n)} opacity={pending ? 0.85 : 1}
        filter={shadow && !pending ? 'url(#symShadow)' : undefined}
        style={pending ? { filter: 'none' } : undefined} strokeDasharray={pending ? '5 3' : undefined} />
      <circle cx={ew - 2} cy={-2} r={5.5} fill="var(--panel)" stroke={STATUS_COLOR[st]} strokeWidth={2.5} />
      <text x={ew / 2} y={eh + 15} textAnchor="middle" style={{ font: '600 11px var(--mono)', fill: 'var(--ink)' }}>{n.tag || '—'}</text>
      <text x={ew / 2} y={eh + 26} textAnchor="middle" style={{ font: '9px var(--body)', fill: 'var(--dim)' }}>{(n.description || '').slice(0, 24)}</text>
    </g>
  );
});

function Tooltip({ h, refDate }: { h: Hover; refDate: Date }) {
  const { n } = h;
  const s = SYM[n.type as SymbolKey];
  const st = statusOf(n, refDate);
  return (
    <div style={{ position: 'fixed', left: h.x + 16, top: h.y + 12, zIndex: 90, width: 248, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 11, boxShadow: 'var(--shadow)', overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <svg viewBox={`-4 -4 ${s.w + 8} ${s.h + 8}`} width={34} height={28}><SvgMarkup svg={s.svg} style={{ color: safeColor(s.color) }} /></svg>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13 }}>{n.tag || '—'}{n.removed && ' · REMOVED'}</div>
          <div style={{ fontSize: 10.5, color: 'var(--dim)' }}>{s.name}</div>
        </div>
      </div>
      <div style={{ padding: '9px 13px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 10px', fontSize: 11.5, fontFamily: 'var(--mono)' }}>
        <Row k="Serial" v={n.serial || '—'} />
        <Row k="RWP / size" v={`${n.rwp || '—'} · ${n.size || '—'}`} />
        <Row k="Interm. due" v={n.int_due || '—'} />
        <Row k="Major due" v={n.maj_due || '—'} />
      </div>
      <div style={{ padding: '7px 13px', borderTop: '1px solid var(--line)', fontSize: 11, fontWeight: 600, color: STATUS_COLOR[st] }}>● {STATUS_LABEL[st]}</div>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => (<><span style={{ color: 'var(--faint)' }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span></>);
const TBRow = ({ k, v }: { k: string; v: string }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr', borderBottom: '1px solid var(--line2)' }}>
    <div style={{ padding: '5px 8px', fontSize: 8.5, letterSpacing: 0.6, color: 'var(--faint)', textTransform: 'uppercase', borderRight: '1px solid var(--line2)', background: 'var(--panel2)' }}>{k}</div>
    <div style={{ padding: '5px 9px', fontSize: 11.5, color: 'var(--ink)', fontWeight: 600 }}>{v}</div>
  </div>
);

// ---- styles ----------------------------------------------------------------
const paletteStyle: React.CSSProperties = { width: 230, flex: '0 0 auto', background: 'var(--panel)', borderRight: '1px solid var(--line2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 12 };
// Buttons + search stay pinned; only the symbol list below scrolls.
const palHeader: React.CSSProperties = { flex: '0 0 auto', paddingBottom: 10, borderBottom: '1px solid var(--line)' };
const palScroll: React.CSSProperties = { flex: '1 1 auto', overflowY: 'auto', minHeight: 0, marginRight: -6, paddingRight: 6 };
const primaryBtn: React.CSSProperties = { width: '100%', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '9px 11px', fontWeight: 600, fontSize: 12, marginBottom: 8, cursor: 'pointer' };
const palHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1.6, color: 'var(--faint)', textTransform: 'uppercase', margin: '15px 4px 8px', fontWeight: 600, cursor: 'pointer', userSelect: 'none' };
const palSearch: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '7px 9px', borderRadius: 7, fontSize: 12, margin: '4px 0 4px' };
const palPreview: React.CSSProperties = { position: 'absolute', left: 238, top: 120, zIndex: 30, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 11, boxShadow: 'var(--shadow)', padding: 12, width: 168, textAlign: 'center', pointerEvents: 'none' };
const palCard: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'grab' };
const toolbar: React.CSSProperties = { position: 'absolute', left: 16, top: 16, display: 'flex', gap: 5, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: 5, zIndex: 10, boxShadow: 'var(--shadow)' };
const tbtn: React.CSSProperties = { width: 36, height: 36, border: 0, background: 'transparent', borderRadius: 7, color: 'var(--dim)', fontSize: 16, cursor: 'pointer' };
const miniBtn: React.CSSProperties = { width: 28, height: 28, border: 0, background: 'transparent', borderRadius: 6, color: 'var(--ink)', fontSize: 14, cursor: 'pointer', display: 'grid', placeItems: 'center' };
const viewControls: React.CSSProperties = { position: 'absolute', right: 16, top: 16, display: 'flex', gap: 6, zIndex: 12 };
const pill: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--dim)', fontWeight: 600, fontSize: 12, cursor: 'pointer', boxShadow: 'var(--shadow)' };
const pillActive: React.CSSProperties = { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
const modebar: React.CSSProperties = { position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 15, background: 'color-mix(in srgb,var(--green) 14%,var(--panel))', border: '1px solid var(--green)', color: 'var(--green)', borderRadius: 30, padding: '6px 16px', fontSize: 12, fontWeight: 600 };
const approveBar: React.CSSProperties = { position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: 11, padding: '9px 12px 9px 16px', boxShadow: 'var(--shadow)' };
const primarySm: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '7px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const ghostSm: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '7px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const zoombar: React.CSSProperties = { position: 'absolute', right: 16, bottom: 16, display: 'flex', gap: 6, alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: '5px 8px', zIndex: 10, boxShadow: 'var(--shadow)' };
const pipeMenuBox: React.CSSProperties = { position: 'absolute', transform: 'translate(-50%, 12px)', zIndex: 40, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 6, minWidth: 190 };
const pipeMenuHead: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--faint)', padding: '4px 8px 6px', fontWeight: 600 };
const pipeMenuRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 9px', background: 'transparent', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 };
const zbtn: React.CSSProperties = { width: 26, height: 26, border: 0, background: 'var(--sunk)', color: 'var(--ink)', borderRadius: 6, fontSize: 16, cursor: 'pointer' };
const legend: React.CSSProperties = { position: 'absolute', left: 16, bottom: 16, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: '9px 13px', zIndex: 10, fontSize: 11, color: 'var(--dim)', boxShadow: 'var(--shadow)' };
const legendHead: React.CSSProperties = { color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, display: 'block', marginBottom: 6 };
const titleBlock: React.CSSProperties = { position: 'absolute', right: 16, bottom: 64, zIndex: 11, background: 'var(--panel)', border: '1.5px solid var(--ink)', borderRadius: 4, boxShadow: 'var(--shadow)', fontFamily: 'var(--mono)', minWidth: 260, overflow: 'hidden' };
const tbHead: React.CSSProperties = { background: 'var(--ink)', color: 'var(--panel)', padding: '6px 9px', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 12, letterSpacing: 0.5 };
const warnPanel: React.CSSProperties = { position: 'absolute', right: 16, top: 58, zIndex: 16, width: 300, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 11, boxShadow: 'var(--shadow)', overflow: 'hidden' };
const warnHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid var(--line2)', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 12.5 };
const warnRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 0, borderBottom: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, color: 'var(--ink)' };
