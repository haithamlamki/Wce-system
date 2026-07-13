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
import { SYM, type SymbolKey } from '../lib/symbols';
import { STATUS_COLOR, STATUS_LABEL, statusOf } from '../lib/status';
import { safeColor } from '../lib/sanitizeSvg';
import {
  box, buildNodeMap, fitView, GRID, innerTransform, isoDepth, isoPlacement, normRot, pickNode,
  PIPE_KINDS, pipeColor, pipeParts, pipeSwatch, ports, proj, routeEdgePoints,
  screenToWorld, snap, type PipeKindDef, type View,
} from '../lib/geometry';
import ExportDialog from '../components/ExportDialog';
import AnnotationLayer from '../components/AnnotationLayer';
import SvgMarkup from '../components/SvgMarkup';
import SymbolPalette from '../components/pid/SymbolPalette';
import PipeTypeMenu from '../components/pid/PipeTypeMenu';
import PipeEditMenu from '../components/pid/PipeEditMenu';
import SelectionToolbar from '../components/pid/SelectionToolbar';
import ContextMenu, { type CtxMenuState } from '../components/pid/ContextMenu';
import { resizeAnchor, resizePatch, type HandleName, type ResizeStart } from '../lib/resize';
import { applySmartSnap, buildSnapSets, type Guide, type SnapSets } from '../lib/snapGuides';
import type { Component, Edge, PortName } from '../types';

interface PortRef { id: string; port?: PortName }
interface ConnectState { from: PortRef; to: { x: number; y: number }; target?: PortRef }

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
  kind: 'pan' | 'node' | 'marquee' | 'connect' | 'resize';
  sx: number; sy: number;
  moved?: boolean;
  view0?: View;
  starts?: Array<{ id: string; x: number; y: number }>; // group-drag origins
  base?: string[]; // selection to union with (shift-marquee)
  from?: PortRef;   // connect: source port
  target?: PortRef; // connect: current target port (resolved during the drag)
  // node drag: smart-snap data captured once at drag start
  dims?: Map<string, { w: number; h: number }>; // dragged nodes' boxes
  snapSets?: SnapSets;                          // static nodes' edge/centre candidates
  // resize: everything resizePatch() needs, captured at drag start
  handle?: HandleName;
  node0?: ResizeStart & { id: string };
  box0?: { w: number; h: number };
  d0?: number;                       // start anchor→pointer distance (proportional corners)
  anchor?: { x: number; y: number }; // fixed opposite corner/edge (world)
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
  // resize commits are rAF-batched exactly like moves, so live-stretching a
  // symbol re-renders at most once per frame (smooth, no intra-frame churn)
  const pendingResizeRef = useRef<{ id: string; patch: Partial<Component> } | null>(null);
  const flushPendingMove = useCallback(() => {
    dragRafRef.current = null;
    if (pendingMoveRef.current) { p.moveMany(pendingMoveRef.current); pendingMoveRef.current = null; }
    if (pendingResizeRef.current) { const { id, patch } = pendingResizeRef.current; p.updateNode(id, patch); pendingResizeRef.current = null; }
  }, [p]);
  useEffect(() => () => { if (dragRafRef.current != null) cancelAnimationFrame(dragRafRef.current); }, []);
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
  const [showExport, setShowExport] = useState(false);
  // smart alignment guides currently shown during a node drag
  const [guides, setGuides] = useState<Guide[] | null>(null);
  // right-click context menu (node / empty-canvas variant)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  const editable = mode === 'admin' && !iso;
  // drop-shadow depth is per-node SVG filter work — only worth it on smaller
  // diagrams; disable on dense masters to keep rendering fast.
  const shadow = !iso && project.nodes.length <= 80;
  const selSet = useMemo(() => new Set(p.selectedIds), [p.selectedIds]);
  // nodes implicated in any validation issue → red ring (report §2.4)
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
      if (e.key === 'Escape') { proj.clearSelection(); setConnect(null); setPortHover(null); setPipeMenu(null); setPipeEdit(null); setSelectedEdgeId(null); setCtxMenu(null); return; }
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
    setPipeMenu(null); setPipeEdit(null); setSelectedEdgeId(null); setCtxMenu(null);
    const w = screenToWorld(px, py, view);

    // Middle mouse always pans (so left-drag stays free for connect/move/marquee)
    if (e.button === 1) { e.preventDefault(); setHover(null); setPortHover(null); dragRef.current = { kind: 'pan', sx: px, sy: py, view0: { ...view } }; return; }

    // 3D presentation or Field role = read-only: left-drag pans, hover only
    if (iso || mode === 'field') { dragRef.current = { kind: 'pan', sx: px, sy: py, view0: { ...view } }; return; }

    if (e.button !== 0) return; // admin 2D edits are left-button only

    const hit = pickNode(project.nodes, w.x, w.y);
    // Connect-by-dragging-a-handle was removed by request — pressing on/near a
    // node always moves it (or marquee-selects on empty space) instead.
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
      // smart-guide data, captured once: the dragged nodes' box sizes + every
      // static node's snappable edges/centres (boxes don't change mid-drag)
      const dragSet = new Set(groupIds);
      const dims = new Map(starts.map((s) => { const nn = nodeMap.get(s.id)!; return [s.id, box(nn)] as const; }));
      dragRef.current = { kind: 'node', sx: px, sy: py, starts, dims, snapSets: buildSnapSets(project.nodes, dragSet) };
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
      // Connect-by-handle was removed, so no port handles light up on hover.
      setPortHover(null);
      return;
    }
    d.moved = true;
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.view0!.x + (px - d.sx), y: d.view0!.y + (py - d.sy) }));
    else if (d.kind === 'node' && d.starts) {
      let dx = (px - d.sx) / view.k;
      let dy = (py - d.sy) / view.k;
      // Free placement by default. Ctrl/Cmd = grid snap; otherwise smart
      // object-snapping against other nodes' edges/centres (Alt disables all).
      if (e.ctrlKey || e.metaKey) {
        pendingMoveRef.current = d.starts.map((s) => ({ id: s.id, x: snap(s.x + dx), y: snap(s.y + dy) }));
        setGuides(null);
      } else {
        let activeGuides: Guide[] | null = null;
        if (!e.altKey && d.snapSets && d.dims) {
          // moving selection's bounds at the raw (unsnapped) position
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const s of d.starts) {
            const dim = d.dims.get(s.id);
            if (!dim) continue;
            minX = Math.min(minX, s.x + dx); minY = Math.min(minY, s.y + dy);
            maxX = Math.max(maxX, s.x + dx + dim.w); maxY = Math.max(maxY, s.y + dy + dim.h);
          }
          if (minX < maxX) {
            const res = applySmartSnap({ minX, minY, maxX, maxY }, d.snapSets, 8 / view.k);
            dx += res.dx; dy += res.dy;
            activeGuides = res.guides.length ? res.guides : null;
          }
        }
        pendingMoveRef.current = d.starts.map((s) => ({ id: s.id, x: s.x + dx, y: s.y + dy }));
        setGuides(activeGuides);
      }
      if (dragRafRef.current == null) dragRafRef.current = requestAnimationFrame(flushPendingMove);
    } else if (d.kind === 'resize' && d.handle && d.node0 && d.box0 && d.anchor) {
      // 8-direction resize: corners scale proportionally (Shift = free
      // stretch), side handles stretch one dimension — all anchored on the
      // opposite corner/edge. Live preview commits once per frame via rAF.
      const w = screenToWorld(px, py, view);
      const proportional = d.handle.length === 2 && !e.shiftKey;
      const patch = resizePatch(d.handle, d.node0, d.box0, d.anchor, d.d0 ?? 1, w, proportional);
      pendingResizeRef.current = { id: d.node0.id, patch };
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
    if (pendingResizeRef.current) { const { id, patch } = pendingResizeRef.current; p.updateNode(id, patch); pendingResizeRef.current = null; }
    setGuides(null);
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
  // F19 (PR7 review): both are passed to EdgeG (React.memo) as onSelect/onEdit —
  // wrapped in useCallback so their identity is stable across renders (incl.
  // every drag tick), letting EdgeG's memo actually bail. `clearSelection` is
  // a stable useCallback ([] deps in ProjectContext); the setState setters are
  // stable by React guarantee. Destructured to a plain identifier (rather than
  // called as `p.clearSelection()`) so exhaustive-deps can track it precisely
  // instead of asking for the whole (per-edit-unstable) `p` object — same
  // function reference either way, just expressed so the lint rule proves it.
  const { clearSelection } = p;
  const selectEdge = useCallback((id: string) => {
    clearSelection(); setPipeMenu(null); setPipeEdit(null); setSelectedEdgeId(id);
  }, [clearSelection]);
  const openPipeEdit = useCallback((e: React.MouseEvent, edgeId: string) => {
    // inlined equivalent of `local(e)` — that helper is a plain closure
    // recreated every render, so calling it here would drag a fresh identity
    // into this callback's deps and defeat the memoization above; svgRef is a
    // ref (stable) so this keeps the callback's identity tied only to `view`.
    const r = svgRef.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const w = screenToWorld(px, py, view);
    clearSelection(); setPipeMenu(null); setSelectedEdgeId(edgeId);
    setPipeEdit({ edgeId, wx: w.x, wy: w.y, sx: px, sy: py });
  }, [view, clearSelection]);
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
    // Free drop by default; hold Ctrl/Cmd while dropping to snap to the grid.
    const q = (e.ctrlKey || e.metaKey) ? snap : (v: number) => v;
    p.addNode(type, q(w.x - s.w / 2), q(w.y - s.h / 2));
  }
  function placeCentre(type: SymbolKey) {
    const r = svgRef.current!.getBoundingClientRect();
    const w = screenToWorld(r.width / 2, r.height / 2, view);
    const s = SYM[type];
    const id = p.addNode(type, w.x - s.w / 2, w.y - s.h / 2);
    setPendingId(id); // click = pending → approve
  }
  const approve = () => setPendingId(null);
  const cancelPending = () => { if (pendingId) p.deleteNode(pendingId); setPendingId(null); };

  // Handle drag → resize the single selected node. Corners scale
  // proportionally (Shift = free), sides stretch one dimension; the opposite
  // corner/edge stays anchored so connected pipes follow the moving ports.
  function startResize(e: React.PointerEvent, n: Component, handle: HandleName) {
    if (!editable || n.locked || n.sizeLocked) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { px, py } = local(e);
    const w = screenToWorld(px, py, view);
    const b = box(n);
    const anchor = resizeAnchor(handle, n.x, n.y, b);
    dragRef.current = {
      kind: 'resize', sx: px, sy: py, handle, box0: b, anchor,
      d0: Math.hypot(w.x - anchor.x, w.y - anchor.y) || 1,
      node0: { id: n.id, x: n.x, y: n.y, scale: n.scale || 1, sx: n.sx || 1, sy: n.sy || 1, rot: normRot(n.rot) },
    };
  }

  // Right-click → PowerPoint-style context menu (admin 2D only). On a node it
  // targets the node (selecting it / its group first); on empty space it
  // offers paste / select-all.
  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault(); // never show the browser menu over the canvas
    if (!editable) return;
    const { px, py } = local(e);
    const w = screenToWorld(px, py, view);
    const hit = pickNode(project.nodes, w.x, w.y);
    setHover(null); setPipeMenu(null); setPipeEdit(null);
    if (hit) {
      if (!selSet.has(hit.id)) {
        const mates = hit.groupId ? project.nodes.filter((n) => n.groupId === hit.groupId).map((n) => n.id) : [hit.id];
        if (mates.length > 1) p.setSelectedIds(mates); else p.setSelectedId(hit.id);
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'node' });
    } else {
      setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'canvas' });
    }
  }

  function addNote() {
    const r = svgRef.current!.getBoundingClientRect();
    const w = screenToWorld(r.width / 2, r.height / 2, view);
    p.addAnnotation({ kind: 'text', x: w.x, y: w.y, w: 140, h: 24, text: 'Note' });
  }

  const showPalette = mode === 'admin' && !iso;
  const hasNodes = project.nodes.length > 0;
  const pendingNode = (pendingId && nodeMap.get(pendingId)) ?? null;

  return (
    <>
      {showPalette && <SymbolPalette onPlaceCentre={placeCentre} />}

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
          <button style={{ ...pill, ...(iso ? pillActive : {}) }} onClick={() => { setIso((v) => !v); setConnect(null); setPortHover(null); }}>3D</button>
          <button style={{ ...pill, ...(showTitle ? pillActive : {}) }} onClick={() => setShowTitle((v) => !v)}>Title</button>
          <button style={pill} title="Export / Print (PDF, PNG, SVG)" onClick={() => setShowExport(true)}>⎙ Export</button>
        </div>

        {mode === 'field' && !iso && <div style={modebar}>Field mode · read-only (pan &amp; hover)</div>}
        {iso && <div style={{ ...modebar, background: 'color-mix(in srgb,var(--accent2) 14%,var(--panel))', borderColor: 'var(--accent2)', color: 'var(--accent2)' }}>3D presentation · pan &amp; hover (editing disabled)</div>}

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
          <PipeTypeMenu sx={pipeMenu.sx} sy={pipeMenu.sy} onChoose={choosePipe} onCancel={() => setPipeMenu(null)} />
        )}

        {/* pipe edit menu — double-click an existing pipe: insert / branch /
            change type / delete. Only shown while editing that pipe. */}
        {pipeEdit && (
          <PipeEditMenu sx={pipeEdit.sx} sy={pipeEdit.sy} onInsert={insertOnPipe} onChangeType={changeEdgeType}
            onDelete={deleteEdgeFromMenu} onCancel={() => { setPipeEdit(null); setSelectedEdgeId(null); }} />
        )}

        <svg ref={svgRef} width="100%" height="100%"
          role="application" tabIndex={0} aria-label="P&ID editor canvas"
          style={{ position: 'absolute', inset: 0, cursor: iso || mode === 'field' ? 'grab' : connect || portHover?.port ? 'crosshair' : 'default', touchAction: 'none' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerLeave={() => { onPointerUp(); setHover(null); }} onContextMenu={onContextMenu}
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
            {/* connection handles removed (connect-by-drag feature was removed) */}
            {/* nodes */}
            {(iso ? [...project.nodes].sort((x, y) => isoDepth(x) - isoDepth(y)) : project.nodes).map((n) => (
              <NodeG key={n.id} n={n} selected={selSet.has(n.id)} connecting={connect?.from.id === n.id}
                pending={pendingId === n.id} flagged={false} shadow={shadow} refDate={refDate} iso={iso} />
            ))}
            {/* 8-direction resize handles on the single selected node —
                corners scale proportionally (Shift = free stretch), side
                handles stretch one dimension only */}
            {!iso && editable && p.selectedIds.length === 1 && (() => {
              const n = nodeMap.get(p.selectedIds[0]);
              if (!n || n.locked || n.sizeLocked) return null;
              const b = box(n);
              const s = 9 / view.k;
              const HANDLES: Array<[HandleName, number, number, string]> = [
                ['nw', 0, 0, 'nwse-resize'], ['n', b.w / 2, 0, 'ns-resize'], ['ne', b.w, 0, 'nesw-resize'],
                ['w', 0, b.h / 2, 'ew-resize'], ['e', b.w, b.h / 2, 'ew-resize'],
                ['sw', 0, b.h, 'nesw-resize'], ['s', b.w / 2, b.h, 'ns-resize'], ['se', b.w, b.h, 'nwse-resize'],
              ];
              return (
                <g>
                  {HANDLES.map(([h, ox, oy, cursor]) => (
                    <rect key={h} x={n.x + ox - s / 2} y={n.y + oy - s / 2} width={s} height={s} rx={2 / view.k}
                      fill="#fff" stroke="var(--accent)" strokeWidth={1.5 / view.k}
                      style={{ cursor }} onPointerDown={(e) => startResize(e, n, h)} />
                  ))}
                </g>
              );
            })()}
            {/* smart alignment guides (object snapping) while dragging */}
            {guides && !iso && guides.map((g, i) => (
              g.axis === 'v'
                ? <line key={i} x1={g.pos} y1={g.lo - 14} x2={g.pos} y2={g.hi + 14} stroke="#ff4fa3"
                    strokeWidth={1.2 / view.k} strokeDasharray={`${5 / view.k} ${3 / view.k}`} pointerEvents="none" />
                : <line key={i} x1={g.lo - 14} y1={g.pos} x2={g.hi + 14} y2={g.pos} stroke="#ff4fa3"
                    strokeWidth={1.2 / view.k} strokeDasharray={`${5 / view.k} ${3 / view.k}`} pointerEvents="none" />
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
        <SelectionToolbar editable={editable} selBounds={selBounds} hasMarquee={!!marquee} view={view} />

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
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}
      {hover && !iso && !connect && !ctxMenu && <Tooltip h={hover} refDate={refDate} />}
      {showExport && <ExportDialog project={project} refDate={refDate} onClose={() => setShowExport(false)} />}
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
      {/* accessible name (F20): so AT can identify a placed item by tag + type */}
      <title>{`${n.tag || s.name}${n.tag ? ` — ${s.name}` : ''}${n.removed ? ' (removed)' : ''}`}</title>
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
const toolbar: React.CSSProperties = { position: 'absolute', left: 16, top: 16, display: 'flex', gap: 5, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: 5, zIndex: 10, boxShadow: 'var(--shadow)' };
const tbtn: React.CSSProperties = { width: 36, height: 36, border: 0, background: 'transparent', borderRadius: 7, color: 'var(--dim)', fontSize: 16, cursor: 'pointer' };
const viewControls: React.CSSProperties = { position: 'absolute', right: 16, top: 16, display: 'flex', gap: 6, zIndex: 12 };
const pill: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--dim)', fontWeight: 600, fontSize: 12, cursor: 'pointer', boxShadow: 'var(--shadow)' };
const pillActive: React.CSSProperties = { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
const modebar: React.CSSProperties = { position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 15, background: 'color-mix(in srgb,var(--green) 14%,var(--panel))', border: '1px solid var(--green)', color: 'var(--green)', borderRadius: 30, padding: '6px 16px', fontSize: 12, fontWeight: 600 };
const approveBar: React.CSSProperties = { position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: 11, padding: '9px 12px 9px 16px', boxShadow: 'var(--shadow)' };
const primarySm: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '7px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const ghostSm: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '7px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const zoombar: React.CSSProperties = { position: 'absolute', right: 16, bottom: 16, display: 'flex', gap: 6, alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: '5px 8px', zIndex: 10, boxShadow: 'var(--shadow)' };
const zbtn: React.CSSProperties = { width: 26, height: 26, border: 0, background: 'var(--sunk)', color: 'var(--ink)', borderRadius: 6, fontSize: 16, cursor: 'pointer' };
const legend: React.CSSProperties = { position: 'absolute', left: 16, bottom: 16, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: '9px 13px', zIndex: 10, fontSize: 11, color: 'var(--dim)', boxShadow: 'var(--shadow)' };
const legendHead: React.CSSProperties = { color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, display: 'block', marginBottom: 6 };
const titleBlock: React.CSSProperties = { position: 'absolute', right: 16, bottom: 64, zIndex: 11, background: 'var(--panel)', border: '1.5px solid var(--ink)', borderRadius: 4, boxShadow: 'var(--shadow)', fontFamily: 'var(--mono)', minWidth: 260, overflow: 'hidden' };
const tbHead: React.CSSProperties = { background: 'var(--ink)', color: 'var(--panel)', padding: '6px 9px', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 12, letterSpacing: 0.5 };
