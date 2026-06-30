// ============================================================================
//  Project state container (Phase-1).
//  Holds the live Project document + editor UI state (mode, selection) and
//  exposes the actions that wrap the extracted engine modules. Swap the
//  in-memory store for AEMP server persistence in Phase-1 (PRD FR-59) without
//  touching the views.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Annotation, Component, Edge, PipeSeg, PortName, Project, TemplateItem } from '../types';
import { buildMaster, importFromAEMP, rigData, type AempConfig } from '../lib/aemp';
import { buildBopStack, type HoleSection } from '../lib/bop';
import { box } from '../lib/geometry';
import { SYM, type SymbolDef, type SymbolKey } from '../lib/symbols';
import { mergeCustomSymbols, newCustomKey, unregisterSymbol } from '../lib/customSymbols';
import { REWARDS, rewardStats } from '../lib/rewards';
import { validate, type Issue } from '../lib/validation';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';
import { RIG303_EQUIPMENT } from '../lib/data/rig303-equipment';
import { autosave, openFromFile, restore, saveToFile } from '../lib/persistence';
import { fetchLatestPublished, isSupabaseConfigured, listProjectsCloud, listProjectVersions, loadProjectCloud, loadProjectVersion, saveProjectCloud, type ProjectSummary, type ProjectVersionSummary } from '../lib/cloud';
import { useAuth } from './AuthContext';

export type Mode = 'admin' | 'field';

function emptyProject(): Project {
  return {
    meta: { rig: 'Rig 305', date: new Date().toISOString().slice(0, 10), who: '' },
    nodes: [],
    edges: [],
    pipes: [],
    bop: { datum: 0, rt: 8.5, unit: 'm', items: [] },
    rewards: { spent: 0, redeemed: [] },
    revision: 0,
  };
}

let seq = 1000;
const nextId = (p: string) => `${p}${seq++}`;

function newNode(type: SymbolKey, x: number, y: number): Component {
  const s = SYM[type];
  return {
    id: nextId('n'),
    type,
    x,
    y,
    rot: 0,
    scale: 1,
    flip: false,
    tag: '',
    description: s.name,
    section: s.cat,
    rwp: '',
    size: s.defaults?.size ?? '',
    manufacturer: '',
    serial: '',
    int_last: '',
    int_due: '',
    maj_last: '',
    maj_due: '',
    removed: false,
    installed: true,
  };
}

interface ProjectCtx {
  project: Project;
  refDate: Date;
  mode: Mode;
  setMode: (m: Mode) => void;
  selectedId: string | null;            // primary (last) selection — for single-edit
  setSelectedId: (id: string | null) => void;
  selected: Component | null;            // the node when exactly one is selected
  selectedIds: string[];                 // full multi-selection
  setSelectedIds: (ids: string[]) => void;
  toggleSelect: (id: string) => void;    // shift-click add/remove
  clearSelection: () => void;
  selectAll: () => void;

  // clipboard + group ops (copy / cut / paste / multi-transform)
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

  // engine actions
  // undo / redo (canvas + project edits)
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  loadMaster: () => void;
  loadLayout: (template: TemplateItem[], pipes: PipeSeg[]) => number;
  importAEMP: (config?: AempConfig) => Promise<boolean>;
  buildBop: (section: HoleSection) => void;
  setProject: (p: Project) => void;

  // persistence (FR-58)
  saveProject: () => void;
  openProject: (file: File) => Promise<void>;
  updateMeta: (patch: Partial<Project['meta']>) => void;

  // onboarding / project chip (FR-1/3/4)
  showOnboard: boolean;
  setShowOnboard: (v: boolean) => void;
  completeOnboarding: (meta: Pick<Project['meta'], 'rig' | 'date' | 'who'>) => void;

  // cloud persistence via Supabase (FR-59)
  cloudEnabled: boolean;
  cloudId: string | null;
  saveCloud: (note?: string) => Promise<string | null>;
  listCloud: () => Promise<ProjectSummary[]>;
  loadCloud: (id: string) => Promise<void>;
  // revision history (FR-59)
  listVersions: (projectId: string) => Promise<ProjectVersionSummary[]>;
  restoreVersion: (versionId: string) => Promise<void>;

  // role + draft/publish workflow
  canEdit: boolean;
  saveAsDraft: (note?: string) => Promise<string | null>;
  publishFinal: (note?: string) => Promise<string | null>;
  clearCanvas: () => void;

  // node CRUD (admin) / as-built (field)
  addNode: (type: SymbolKey, x: number, y: number) => string;
  updateNode: (id: string, patch: Partial<Component>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => string | null;
  /** Swap a placed item's symbol type without losing its data (FR-16). */
  changeType: (id: string, type: SymbolKey, applyToType?: boolean) => void;
  rotateNode: (id: string, applyToType?: boolean) => void;
  flipNode: (id: string, applyToType?: boolean) => void;
  scaleNode: (id: string, scale: number, applyToType?: boolean) => void;
  toggleRemoved: (id: string) => void;
  addEdge: (from: string, to: string, opts?: { fromPort?: PortName; toPort?: PortName }) => void;
  /** Bulk-add components (e.g. from CSV import); grid-places them. Returns count. */
  addComponents: (rows: Array<Partial<Component> & { type?: SymbolKey }>) => number;

  // register → diagram jump (FR-27)
  focusId: string | null;
  focusSeq: number;
  requestFocus: (id: string) => void;

  // layout validation issues (report §2.4) — recomputed from the project
  issues: Issue[];

  // annotations (report §6)
  addAnnotation: (a: Omit<Annotation, 'id'>) => string;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;

  // grouping / locking (report §3)
  groupSelection: () => void;
  ungroupSelection: () => void;
  toggleLockSelection: () => void;

  // custom symbols (Symbol Library / Drawer)
  addCustomSymbol: (def: SymbolDef) => string;
  updateCustomSymbol: (key: string, def: SymbolDef) => void;
  deleteCustomSymbol: (key: string) => void;

  // rewards redemption (FR-55)
  redeemReward: (id: string) => void;
}

const Ctx = createContext<ProjectCtx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { role, rig, enabled: authEnabled } = useAuth();
  // End users (field role) are read-only; admin/manager/offline can edit.
  const canEdit = role !== 'field';
  const [restored] = useState(() => { const r = restore(); mergeCustomSymbols(r?.customSymbols); return r; });
  const [project, setProject] = useState<Project>(() => restored ?? emptyProject());
  const [mode, setMode] = useState<Mode>('admin');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<Component[]>([]);
  // first open (nothing autosaved) → show the date-first onboarding modal (FR-1)
  const [showOnboard, setShowOnboard] = useState(() => restored === null);
  const [cloudId, setCloudId] = useState<string | null>(null);
  // register → diagram focus request (FR-27): bump seq to re-center on focusId
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);

  // primary selection (last) for single-target convenience + back-compat
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);

  // debounced autosave on every project change (FR-58)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autosave(project), 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [project]);

  // ---- undo / redo history (coalesces bursts like a drag into one step) ----
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const baseline = useRef<Project>(project);
  const timeTravel = useRef(false);
  const sealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setHistVer] = useState(0);

  const sealNow = useCallback(() => {
    if (sealTimer.current) { clearTimeout(sealTimer.current); sealTimer.current = null; }
    if (project !== baseline.current) {
      past.current.push(baseline.current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      baseline.current = project;
      setHistVer((v) => v + 1);
    }
  }, [project]);

  useEffect(() => {
    if (timeTravel.current) { timeTravel.current = false; baseline.current = project; return; }
    if (sealTimer.current) clearTimeout(sealTimer.current);
    sealTimer.current = setTimeout(sealNow, 350);
    return () => { if (sealTimer.current) clearTimeout(sealTimer.current); };
  }, [project, sealNow]);

  const undo = useCallback(() => {
    sealNow();
    if (!past.current.length) return;
    const prev = past.current.pop()!;
    future.current.push(baseline.current);
    baseline.current = prev;
    timeTravel.current = true;
    setSelectedIds([]);
    setProject(prev);
    setHistVer((v) => v + 1);
  }, [sealNow]);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    const next = future.current.pop()!;
    past.current.push(baseline.current);
    baseline.current = next;
    timeTravel.current = true;
    setSelectedIds([]);
    setProject(next);
    setHistVer((v) => v + 1);
  }, []);

  const refDate = useMemo(() => {
    const d = new Date(project.meta.date + 'T00:00');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [project.meta.date]);

  const selected = useMemo(
    () => (selectedIds.length === 1 ? project.nodes.find((n) => n.id === selectedIds[0]) ?? null : null),
    [project.nodes, selectedIds],
  );

  const issues = useMemo(() => validate(project), [project]);

  // keep the shared SYM registry in sync with the project's custom symbols
  // (covers open/load/cloud-restore; live edits also mutate SYM directly)
  useEffect(() => { mergeCustomSymbols(project.customSymbols); }, [project.customSymbols]);

  const bump = (p: Project, patch: Partial<Project>): Project => ({ ...p, ...patch, revision: (p.revision ?? 0) + 1 });

  const loadMaster = useCallback(() => {
    const d = rigData(project.meta.rig);
    const { nodes, pipes } = buildMaster(d.template, d.register, d.pipes);
    setSelectedId(null);
    setProject((p) => bump(p, { nodes, pipes, edges: [] }));
  }, [project.meta.rig]);

  const loadLayout = useCallback((template: TemplateItem[], pipes: PipeSeg[]) => {
    const { nodes } = buildMaster(template, RIG303_EQUIPMENT);
    setSelectedId(null);
    setProject((p) => bump(p, { nodes, pipes, edges: [] }));
    return nodes.length;
  }, []);

  const importAEMP = useCallback(async (config?: AempConfig) => {
    const { assets, live } = await importFromAEMP(config);
    const { nodes, pipes } = buildMaster(undefined, assets);
    setSelectedId(null);
    setProject((p) => bump(p, { nodes, pipes, edges: [] }));
    return live;
  }, []);

  const buildBop = useCallback((section: HoleSection) => {
    const items = buildBopStack(section, RIG303_EQUIPMENT);
    setProject((p) => ({ ...p, bop: { ...p.bop, items } }));
  }, []);

  const addNode = useCallback((type: SymbolKey, x: number, y: number) => {
    const n = newNode(type, x, y);
    setProject((p) => ({ ...p, nodes: [...p.nodes, n] }));
    setSelectedId(n.id);
    return n.id;
  }, []);

  const updateNode = useCallback((id: string, patch: Partial<Component>) => {
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  }, []);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
  }, []);

  const deleteNode = useCallback((id: string) => {
    setProject((p) => {
      if (p.nodes.find((n) => n.id === id)?.locked) return p; // locked items are protected
      return {
        ...p,
        nodes: p.nodes.filter((n) => n.id !== id),
        edges: p.edges.filter((e) => e.from !== id && e.to !== id),
      };
    });
    setSelectedIds((ids) => ids.filter((x) => x !== id));
  }, []);

  const duplicateNode = useCallback((id: string) => {
    let newId: string | null = null;
    setProject((p) => {
      const src = p.nodes.find((n) => n.id === id);
      if (!src) return p;
      newId = nextId('n');
      const copy: Component = { ...src, id: newId, x: src.x + 24, y: src.y + 24 };
      return { ...p, nodes: [...p.nodes, copy] };
    });
    if (newId) setSelectedId(newId);
    return newId;
  }, []);

  // swap symbol type, keeping all inspection/identity data (FR-16);
  // applyToType swaps every item of the original type (FR-18)
  const changeType = useCallback((id: string, type: SymbolKey, applyToType = false) => {
    if (!SYM[type]) return;
    setProject((p) => {
      const src = p.nodes.find((n) => n.id === id);
      if (!src) return p;
      return {
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === id || (applyToType && n.type === src.type) ? { ...n, type } : n,
        ),
      };
    });
  }, []);

  const rotateNode = useCallback((id: string, applyToType = false) => {
    setProject((p) => {
      const src = p.nodes.find((n) => n.id === id);
      if (!src) return p;
      const nextRot = ((src.rot || 0) + 90) % 360;
      return {
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === id || (applyToType && n.type === src.type) ? { ...n, rot: nextRot } : n,
        ),
      };
    });
  }, []);

  const flipNode = useCallback((id: string, applyToType = false) => {
    setProject((p) => {
      const src = p.nodes.find((n) => n.id === id);
      if (!src) return p;
      const flip = !src.flip;
      return {
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === id || (applyToType && n.type === src.type) ? { ...n, flip } : n,
        ),
      };
    });
  }, []);

  const scaleNode = useCallback((id: string, scale: number, applyToType = false) => {
    const s = Math.max(0.4, Math.min(2.4, scale));
    setProject((p) => {
      const src = p.nodes.find((n) => n.id === id);
      if (!src) return p;
      return {
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === id || (applyToType && n.type === src.type) ? { ...n, scale: s } : n,
        ),
      };
    });
  }, []);

  const toggleRemoved = useCallback((id: string) => {
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, removed: !n.removed } : n)) }));
  }, []);

  const addComponents = useCallback((rows: Array<Partial<Component> & { type?: SymbolKey }>) => {
    if (!rows.length) return 0;
    setProject((p) => {
      const base = p.nodes.length;
      const added: Component[] = rows.map((r, i) => {
        const type = (r.type && SYM[r.type] ? r.type : 'gate') as SymbolKey;
        const idx = base + i;
        return {
          id: nextId('n'), type,
          x: 80 + (idx % 8) * 120, y: 80 + Math.floor(idx / 8) * 120,
          rot: 0, scale: 1, flip: false,
          tag: r.tag ?? '', description: r.description ?? SYM[type].name, section: r.section ?? SYM[type].cat,
          rwp: r.rwp ?? '', size: r.size ?? '', manufacturer: r.manufacturer ?? '', serial: r.serial ?? '',
          int_last: r.int_last ?? '', int_due: r.int_due ?? '', maj_last: r.maj_last ?? '', maj_due: r.maj_due ?? '',
          removed: false, installed: true,
        };
      });
      return { ...p, nodes: [...p.nodes, ...added] };
    });
    return rows.length;
  }, []);

  const addEdge = useCallback((from: string, to: string, opts?: { fromPort?: PortName; toPort?: PortName }) => {
    if (from === to) return;
    setProject((p) => {
      if (p.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return p;
      const edge: Edge = { id: nextId('e'), from, to, color: 'var(--accent2)', fromPort: opts?.fromPort, toPort: opts?.toPort };
      return { ...p, edges: [...p.edges, edge] };
    });
  }, []);

  // ---- multi-selection -------------------------------------------------------
  const toggleSelect = useCallback((id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])), []);
  const clearSelection = useCallback(() => setSelectedIds([]), []);
  const selectAll = useCallback(() => setSelectedIds(project.nodes.map((n) => n.id)), [project.nodes]);

  const moveMany = useCallback((updates: Array<{ id: string; x: number; y: number }>) => {
    if (!updates.length) return;
    const map = new Map(updates.map((u) => [u.id, u]));
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => { if (n.locked) return n; const u = map.get(n.id); return u ? { ...n, x: u.x, y: u.y } : n; }) }));
  }, []);

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
  }, [selectedIds]);

  const cutSelection = useCallback(() => { copySelection(); deleteSelection(); }, [copySelection, deleteSelection]);

  const pasteClipboard = useCallback((dx = 24, dy = 24) => {
    if (!clipboard.length) return;
    const newIds: string[] = [];
    setProject((p) => {
      const copies = clipboard.map((c) => { const id = nextId('n'); newIds.push(id); return { ...c, id, x: c.x + dx, y: c.y + dy }; });
      return { ...p, nodes: [...p.nodes, ...copies] };
    });
    setSelectedIds(newIds);
  }, [clipboard]);

  const duplicateSelection = useCallback(() => {
    setSelectedIds((ids) => {
      if (!ids.length) return ids;
      const set = new Set(ids);
      const newIds: string[] = [];
      setProject((p) => {
        const copies = p.nodes.filter((n) => set.has(n.id)).map((n) => { const id = nextId('n'); newIds.push(id); return { ...n, id, x: n.x + 24, y: n.y + 24 }; });
        return { ...p, nodes: [...p.nodes, ...copies] };
      });
      return newIds;
    });
  }, []);

  const rotateSelection = useCallback((applyToType = false) => {
    setProject((p) => {
      const set = new Set(selectedIds);
      const types = new Set(p.nodes.filter((n) => set.has(n.id)).map((n) => n.type));
      return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) || (applyToType && types.has(n.type)) ? { ...n, rot: ((n.rot || 0) + 90) % 360 } : n)) };
    });
  }, [selectedIds]);

  const flipSelection = useCallback(() => {
    setProject((p) => { const set = new Set(selectedIds); return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, flip: !n.flip } : n)) }; });
  }, [selectedIds]);

  const scaleSelection = useCallback((scale: number) => {
    const s = Math.max(0.4, Math.min(2.4, scale));
    setProject((p) => { const set = new Set(selectedIds); return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, scale: s } : n)) }; });
  }, [selectedIds]);

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
  }, [selectedIds]);

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
  }, [selectedIds]);

  const saveProject = useCallback(() => saveToFile(project), [project]);
  const openProject = useCallback(async (file: File) => {
    const loaded = await openFromFile(file);
    setSelectedId(null);
    setProject(loaded);
  }, []);
  const updateMeta = useCallback((patch: Partial<Project['meta']>) => {
    setProject((p) => ({ ...p, meta: { ...p.meta, ...patch } }));
  }, []);

  const completeOnboarding = useCallback((meta: Pick<Project['meta'], 'rig' | 'date' | 'who'>) => {
    setShowOnboard(false);
    setProject((p) => {
      const next = { ...p, meta: { ...p.meta, ...meta } };
      // FR-4: starting on an empty canvas auto-loads the rig master
      if (!p.nodes.length) {
        const d = rigData(meta.rig);
        const { nodes, pipes } = buildMaster(d.template, d.register, d.pipes);
        return { ...next, nodes, pipes, revision: (p.revision ?? 0) + 1 };
      }
      return next;
    });
  }, []);

  const saveCloud = useCallback(async (note?: string) => {
    const id = await saveProjectCloud(project, cloudId ?? undefined, note);
    if (id) setCloudId(id);
    return id;
  }, [project, cloudId]);
  const listCloud = useCallback(() => listProjectsCloud(), []);
  const loadCloud = useCallback(async (id: string) => {
    const loaded = await loadProjectCloud(id);
    if (loaded) { setSelectedId(null); setCloudId(id); setProject(loaded); }
  }, []);
  const listVersions = useCallback((projectId: string) => listProjectVersions(projectId), []);
  const restoreVersion = useCallback(async (versionId: string) => {
    const loaded = await loadProjectVersion(versionId);
    if (loaded) { setSelectedId(null); setProject(loaded); }
  }, []);

  // ---- draft / publish workflow ---------------------------------------------
  const saveWithStatus = useCallback(async (status: 'draft' | 'published', note?: string) => {
    const stamped: Project = {
      ...project,
      status,
      publishedAt: status === 'published' ? new Date().toISOString() : project.publishedAt,
    };
    setProject(stamped);
    const id = await saveProjectCloud(stamped, cloudId ?? undefined, note);
    if (id) setCloudId(id);
    return id;
  }, [project, cloudId]);
  const saveAsDraft = useCallback((note?: string) => saveWithStatus('draft', note), [saveWithStatus]);
  const publishFinal = useCallback((note?: string) => saveWithStatus('published', note), [saveWithStatus]);

  // ---- clear canvas (removes nodes AND piping/edges/annotations) -------------
  const clearCanvas = useCallback(() => {
    setSelectedIds([]);
    setProject((p) => bump(p, { nodes: [], pipes: [], edges: [], annotations: [] }));
  }, []);

  // End users load their rig's latest PUBLISHED final sheet (read-only).
  useEffect(() => {
    if (role !== 'field' || !authEnabled || !rig) return;
    let active = true;
    fetchLatestPublished(rig)
      .then((p) => { if (active && p) { setSelectedId(null); setProject(p); } })
      .catch(() => { /* no published sheet yet */ });
    return () => { active = false; };
  }, [role, rig, authEnabled]);

  // FR-27: select a node + signal the canvas to re-center on it
  const requestFocus = useCallback((id: string) => {
    setSelectedId(id);
    setFocusId(id);
    setFocusSeq((s) => s + 1);
  }, [setSelectedId]);

  // ---- annotations (report §6) ----------------------------------------------
  const addAnnotation = useCallback((a: Omit<Annotation, 'id'>) => {
    const id = nextId('a');
    setProject((p) => ({ ...p, annotations: [...(p.annotations ?? []), { ...a, id }] }));
    return id;
  }, []);
  const updateAnnotation = useCallback((id: string, patch: Partial<Annotation>) => {
    setProject((p) => ({ ...p, annotations: (p.annotations ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }, []);
  const deleteAnnotation = useCallback((id: string) => {
    setProject((p) => ({ ...p, annotations: (p.annotations ?? []).filter((x) => x.id !== id) }));
  }, []);

  // ---- grouping / locking (report §3) ---------------------------------------
  const groupSelection = useCallback(() => {
    if (selectedIds.length < 2) return;
    const gid = nextId('g');
    const set = new Set(selectedIds);
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, groupId: gid } : n)) }));
  }, [selectedIds]);
  const ungroupSelection = useCallback(() => {
    const set = new Set(selectedIds);
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, groupId: undefined } : n)) }));
  }, [selectedIds]);
  const toggleLockSelection = useCallback(() => {
    const set = new Set(selectedIds);
    setProject((p) => {
      const sel = p.nodes.filter((n) => set.has(n.id));
      const allLocked = sel.length > 0 && sel.every((n) => n.locked);
      return { ...p, nodes: p.nodes.map((n) => (set.has(n.id) ? { ...n, locked: !allLocked } : n)) };
    });
  }, [selectedIds]);

  // ---- custom symbols (Symbol Library / Drawer) -----------------------------
  const addCustomSymbol = useCallback((def: SymbolDef) => {
    const key = newCustomKey(project.customSymbols ?? {});
    SYM[key] = { ...def, custom: true }; // make available immediately
    setProject((p) => ({ ...p, customSymbols: { ...(p.customSymbols ?? {}), [key]: { ...def, custom: true } } }));
    return key;
  }, [project.customSymbols]);

  const updateCustomSymbol = useCallback((key: string, def: SymbolDef) => {
    SYM[key] = { ...def, custom: true };
    setProject((p) => ({ ...p, customSymbols: { ...(p.customSymbols ?? {}), [key]: { ...def, custom: true } } }));
  }, []);

  const deleteCustomSymbol = useCallback((key: string) => {
    unregisterSymbol(key);
    setProject((p) => {
      const next = { ...(p.customSymbols ?? {}) };
      delete next[key];
      return { ...p, customSymbols: next };
    });
  }, []);

  // FR-55: redeem a reward if affordable; persists in project.rewards
  const redeemReward = useCallback((id: string) => {
    const item = REWARDS.find((r) => r.id === id);
    if (!item) return;
    setProject((p) => {
      if (p.rewards.redeemed.includes(id)) return p;
      const available = rewardStats(p, refDate).pts - p.rewards.spent;
      if (available < item.cost) return p;
      return { ...p, rewards: { spent: p.rewards.spent + item.cost, redeemed: [...p.rewards.redeemed, id] } };
    });
  }, [refDate]);

  const value: ProjectCtx = {
    project, refDate, mode, setMode, selectedId, setSelectedId, selected,
    selectedIds, setSelectedIds, toggleSelect, clearSelection, selectAll,
    clipboardCount: clipboard.length, copySelection, cutSelection, pasteClipboard,
    deleteSelection, duplicateSelection, rotateSelection, flipSelection, scaleSelection, moveMany,
    alignSelection, distributeSelection,
    undo, redo, canUndo: past.current.length > 0 || project !== baseline.current, canRedo: future.current.length > 0,
    loadMaster, loadLayout, importAEMP, buildBop, setProject,
    saveProject, openProject, updateMeta,
    showOnboard, setShowOnboard, completeOnboarding,
    cloudEnabled: isSupabaseConfigured, cloudId, saveCloud, listCloud, loadCloud, listVersions, restoreVersion,
    canEdit, saveAsDraft, publishFinal, clearCanvas,
    addNode, updateNode, moveNode, deleteNode, duplicateNode, changeType,
    rotateNode, flipNode, scaleNode, toggleRemoved, addEdge, addComponents,
    focusId, focusSeq, requestFocus, issues,
    addAnnotation, updateAnnotation, deleteAnnotation,
    groupSelection, ungroupSelection, toggleLockSelection,
    addCustomSymbol, updateCustomSymbol, deleteCustomSymbol,
    redeemReward,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProject must be used within <ProjectProvider>');
  return ctx;
}
