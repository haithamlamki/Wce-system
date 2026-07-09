// ============================================================================
//  Selection hook (F19 extraction from ProjectContext.tsx).
//  Owns the multi-selection (selectedIds), clipboard, and every group
//  transform that acts on the current selection (align/distribute/rotate/
//  flip/scale/duplicate/copy-cut-paste/group/lock).
//
//  Inputs:  `project` (read for node lookups) and `setProject`.
//  Outputs: exactly the selection surface useProject() exposes.
// ============================================================================
import { useCallback, useMemo, useState } from 'react';
import type { Component, Project } from '../../types';
import { box } from '../../lib/geometry';
import { withFreshIds } from '../../lib/idSeq';
import { nextId } from '../idSequence';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';

export interface SelectionApi {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: Component | null;
  selectedIds: string[];
  // full Dispatch (not just `(ids: string[]) => void`) so ProjectContext.tsx's
  // deleteNode etc. can still use the functional-update form on it.
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  clipboardCount: number;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: (dx?: number, dy?: number) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  rotateSelection: (applyToType?: boolean) => void;
  flipSelection: () => void;
  scaleSelection: (scale: number) => void;
  moveMany: (updates: Array<{ id: string; x: number; y: number }>) => void;
  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (axis: 'h' | 'v') => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  toggleLockSelection: () => void;
}

export function useSelection(
  project: Project,
  setProject: React.Dispatch<React.SetStateAction<Project>>,
): SelectionApi {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<Component[]>([]);

  // primary selection (last) for single-target convenience + back-compat
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);

  const selected = useMemo(
    () => (selectedIds.length === 1 ? project.nodes.find((n) => n.id === selectedIds[0]) ?? null : null),
    [project.nodes, selectedIds],
  );

  const toggleSelect = useCallback((id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])), []);
  const clearSelection = useCallback(() => setSelectedIds([]), []);
  const selectAll = useCallback(() => setSelectedIds(project.nodes.map((n) => n.id)), [project.nodes]);

  const moveMany = useCallback((updates: Array<{ id: string; x: number; y: number }>) => {
    if (!updates.length) return;
    const map = new Map(updates.map((u) => [u.id, u]));
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => { if (n.locked) return n; const u = map.get(n.id); return u ? { ...n, x: u.x, y: u.y } : n; }) }));
  }, [setProject]);

  // ---- clipboard + group transforms -----------------------------------------
  const copySelection = useCallback(() => {
    const sel = new Set(selectedIds);
    setClipboard(project.nodes.filter((n) => sel.has(n.id)).map((n) => ({ ...n })));
  }, [project.nodes, selectedIds]);

  const deleteSelection = useCallback(() => {
    const sel = new Set(selectedIds);
    if (!sel.size) return;
    setProject((p) => {
      // locked items survive deletion (report §3)
      const del = new Set(p.nodes.filter((n) => sel.has(n.id) && !n.locked).map((n) => n.id));
      if (!del.size) return p;
      return {
        ...p,
        nodes: p.nodes.filter((n) => !del.has(n.id)),
        edges: p.edges.filter((e) => !del.has(e.from) && !del.has(e.to)),
      };
    });
    setSelectedIds([]);
  }, [selectedIds, setProject]);

  const cutSelection = useCallback(() => { copySelection(); deleteSelection(); }, [copySelection, deleteSelection]);

  const pasteClipboard = useCallback((dx = 24, dy = 24) => {
    if (!clipboard.length) return;
    // F11: precompute the copies (ids minted once) BEFORE setProject so the
    // reducer is pure.
    const copies = withFreshIds(clipboard, () => nextId('n'), dx, dy);
    const newIds = copies.map((c) => c.id);
    setProject((p) => ({ ...p, nodes: [...p.nodes, ...copies] }));
    setSelectedIds(newIds);
  }, [clipboard, setProject]);

  const duplicateSelection = useCallback(() => {
    if (!selectedIds.length) return;
    // F11: precompute from the current nodes/selection closure BEFORE
    // setProject — no nested setProject-inside-setSelectedIds, no nextId
    // inside the reducer.
    const set = new Set(selectedIds);
    const copies = withFreshIds(project.nodes.filter((n) => set.has(n.id)), () => nextId('n'), 24, 24);
    if (!copies.length) return;
    const newIds = copies.map((c) => c.id);
    setProject((p) => ({ ...p, nodes: [...p.nodes, ...copies] }));
    setSelectedIds(newIds);
  }, [project.nodes, selectedIds, setProject]);

  const rotateSelection = useCallback((applyToType = false) => {
    setProject((p) => {
      const set = new Set(selectedIds);
      const types = new Set(p.nodes.filter((n) => set.has(n.id)).map((n) => n.type));
      return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) || (applyToType && types.has(n.type)) ? { ...n, rot: ((n.rot || 0) + 90) % 360 } : n)) };
    });
  }, [selectedIds, setProject]);

  const flipSelection = useCallback(() => {
    setProject((p) => { const set = new Set(selectedIds); return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, flip: !n.flip } : n)) }; });
  }, [selectedIds, setProject]);

  const scaleSelection = useCallback((scale: number) => {
    const s = Math.max(0.4, Math.min(3, scale));
    setProject((p) => { const set = new Set(selectedIds); return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, scale: s } : n)) }; });
  }, [selectedIds, setProject]);

  const alignSelection = useCallback((mode: AlignMode) => {
    setProject((p) => {
      const set = new Set(selectedIds);
      const dims = p.nodes.filter((n) => set.has(n.id)).map((n) => ({ n, b: box(n) }));
      if (dims.length < 2) return p;
      const minX = Math.min(...dims.map((d) => d.n.x));
      const maxR = Math.max(...dims.map((d) => d.n.x + d.b.w));
      const minY = Math.min(...dims.map((d) => d.n.y));
      const maxB = Math.max(...dims.map((d) => d.n.y + d.b.h));
      const cx = (minX + maxR) / 2, cy = (minY + maxB) / 2;
      const upd = new Map<string, { x: number; y: number }>();
      for (const { n, b } of dims) {
        let x = n.x, y = n.y;
        if (mode === 'left') x = minX;
        else if (mode === 'right') x = maxR - b.w;
        else if (mode === 'hcenter') x = cx - b.w / 2;
        else if (mode === 'top') y = minY;
        else if (mode === 'bottom') y = maxB - b.h;
        else if (mode === 'vmiddle') y = cy - b.h / 2;
        upd.set(n.id, { x: Math.round(x), y: Math.round(y) });
      }
      return { ...p, nodes: p.nodes.map((n) => { const u = upd.get(n.id); return u ? { ...n, ...u } : n; }) };
    });
  }, [selectedIds, setProject]);

  const distributeSelection = useCallback((axis: 'h' | 'v') => {
    setProject((p) => {
      const set = new Set(selectedIds);
      const dims = p.nodes.filter((n) => set.has(n.id)).map((n) => ({ n, b: box(n) }));
      if (dims.length < 3) return p;
      const cOf = (d: { n: Component; b: { w: number; h: number } }) =>
        axis === 'h' ? d.n.x + d.b.w / 2 : d.n.y + d.b.h / 2;
      dims.sort((a, b) => cOf(a) - cOf(b));
      const c0 = cOf(dims[0]), c1 = cOf(dims[dims.length - 1]);
      const step = (c1 - c0) / (dims.length - 1);
      const upd = new Map<string, { x: number; y: number }>();
      dims.forEach((d, i) => {
        if (i === 0 || i === dims.length - 1) return;
        const c = c0 + step * i;
        upd.set(d.n.id, axis === 'h' ? { x: Math.round(c - d.b.w / 2), y: d.n.y } : { x: d.n.x, y: Math.round(c - d.b.h / 2) });
      });
      return { ...p, nodes: p.nodes.map((n) => { const u = upd.get(n.id); return u ? { ...n, ...u } : n; }) };
    });
  }, [selectedIds, setProject]);

  // ---- grouping / locking (report §3) ---------------------------------------
  const groupSelection = useCallback(() => {
    if (selectedIds.length < 2) return;
    const gid = nextId('g');
    const set = new Set(selectedIds);
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, groupId: gid } : n)) }));
  }, [selectedIds, setProject]);
  const ungroupSelection = useCallback(() => {
    const set = new Set(selectedIds);
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, groupId: undefined } : n)) }));
  }, [selectedIds, setProject]);
  const toggleLockSelection = useCallback(() => {
    const set = new Set(selectedIds);
    setProject((p) => {
      const sel = p.nodes.filter((n) => set.has(n.id));
      const allLocked = sel.length > 0 && sel.every((n) => n.locked);
      return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, locked: !allLocked } : n)) };
    });
  }, [selectedIds, setProject]);

  return {
    selectedId, setSelectedId, selected, selectedIds, setSelectedIds, toggleSelect, clearSelection, selectAll,
    clipboardCount: clipboard.length, copySelection, cutSelection, pasteClipboard,
    deleteSelection, duplicateSelection, rotateSelection, flipSelection, scaleSelection, moveMany,
    alignSelection, distributeSelection, groupSelection, ungroupSelection, toggleLockSelection,
  };
}
