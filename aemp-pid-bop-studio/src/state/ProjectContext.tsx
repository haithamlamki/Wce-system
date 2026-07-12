// ============================================================================
//  Project state container (Phase-1).
//  Holds the live Project document + editor UI state (mode, selection) and
//  exposes the actions that wrap the extracted engine modules. Swap the
//  in-memory store for AEMP server persistence in Phase-1 (PRD FR-59) without
//  touching the views.
//
//  F19: decomposed into focused hooks under ./hooks — this file now composes
//  them (history, selection, units, symbol library) plus the node/edge CRUD,
//  persistence, cloud, and annotation logic that didn't factor out as cleanly,
//  and assembles the single memoized context value (F15) the views consume
//  via useProject(). The public useProject()/useAuth() facades are unchanged.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Annotation, Component, Edge, PipeKind, PipeSeg, PortName, Project, TemplateItem } from '../types';
import { buildFromRegister, buildMaster, importFromAEMP, rigData, type AempConfig } from '../lib/aemp';
import { buildBopStack, seedBopSeq, type HoleSection } from '../lib/bop';
import { snap } from '../lib/geometry';
import { canEditForRole } from '../lib/roles';
import { SYM, type SymbolKey } from '../lib/symbols';
import { mergeCustomSymbols } from '../lib/customSymbols';
import { REWARDS, rewardStats } from '../lib/rewards';
import { validate, type Issue } from '../lib/validation';
import { RIG303_EQUIPMENT } from '../lib/data/rig303-equipment';
import { autosave, openFromFile, restore, saveToFile } from '../lib/persistence';
import {
  isSupabaseConfigured, listProjectsCloud, listProjectVersions, loadProjectCloud, loadProjectVersion,
  renameDiagram, saveProjectCloud, type ProjectSummary, type ProjectVersionSummary,
} from '../lib/cloud';
import { useAuth } from './AuthContext';
import { nextId, seedSeqFromProject } from './idSequence';
import { useHistory } from './hooks/useHistory';
import { useSelection, type AlignMode } from './hooks/useSelection';
import { useUnits } from './hooks/useUnits';
import { useSymbolLibrary } from './hooks/useSymbolLibrary';

export type { AlignMode };
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
  // Project Manager (unit-centric): per-item save/open/create against the tree
  /** Save the current canvas INTO a specific diagram row (guarded by its version). */
  saveActiveToDiagram: (id: string, expectedVersion: number) => Promise<string | null>;
  /** Create a new diagram from the current canvas under a unit; returns its id. */
  createDiagramUnder: (unitName: string, name?: string) => Promise<string | null>;
  /** Load a template's Project doc onto the canvas as a fresh (unbound) draft. */
  openTemplateOnCanvas: (project: Project) => void;
  /** If diagram `id` is the one currently open, drop the binding (after delete). */
  deactivateDiagram: (id: string) => void;

  // role + draft/publish workflow
  canEdit: boolean;
  saveAsDraft: (note?: string) => Promise<string | null>;
  publishFinal: (note?: string) => Promise<string | null>;
  clearCanvas: () => void;

  // units (user-manageable rigs) — each unit owns a page/drawing
  units: string[];
  refreshUnits: () => Promise<void>;
  switchUnit: (name: string) => Promise<void>;
  addUnit: (name: string) => Promise<void>;
  renameUnit: (oldName: string, newName: string) => Promise<void>;
  removeUnit: (name: string) => Promise<void>;
  showUnits: boolean;
  setShowUnits: (b: boolean) => void;
  // per-unit templates + saved-diagram listing (Units panel)
  unitTemplates: string[];                                  // unit names that have a saved template
  refreshUnitTemplates: () => Promise<void>;
  startFromTemplate: (rig: string) => Promise<void>;        // seed a fresh draft from a unit's template
  saveUnitTemplate: (rig?: string) => Promise<void>;        // admin: save current diagram as the unit's template
  listUnitDiagrams: (rig: string) => Promise<ProjectSummary[]>; // saved diagrams for one unit

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
  addEdge: (from: string, to: string, opts?: { fromPort?: PortName; toPort?: PortName; lineType?: PipeKind; color?: string }) => void;
  /** Remove a single pipe connection (leaves its equipment in place). */
  deleteEdge: (id: string) => void;
  /** Re-assign a connection's pipe line type + colour. */
  setEdgeType: (id: string, lineType: PipeKind, color: string) => void;
  /** Insert a node on a pipe at world point `at`, splitting A→B into A→J and
   *  J→B (both keep the original type/colour). Returns the new node id. Used for
   *  inline-equipment and branch-tee insertion. */
  splitEdgeAt: (edgeId: string, type: SymbolKey, at: { x: number; y: number }) => string | null;
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
  addCustomSymbol: (def: import('../lib/symbols').SymbolDef) => string;
  updateCustomSymbol: (key: string, def: import('../lib/symbols').SymbolDef) => void;
  deleteCustomSymbol: (key: string) => void;
  /** Hide a built-in symbol from the library/palette (drops any override). */
  hideSymbol: (key: string) => void;
  /** Un-hide a previously removed built-in symbol. */
  restoreSymbol: (key: string) => void;
  /** Effective hidden set (per-project ∪ global library). */
  hiddenSymbols: string[];
  /** Whether the current user may modify the shared Symbol library. */
  canEditLibrary: boolean;

  // rewards redemption (FR-55)
  redeemReward: (id: string) => void;
}

const Ctx = createContext<ProjectCtx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user, role, rig, enabled: authEnabled } = useAuth();
  // Autosave is scoped to the signed-in user so one admin's local draft can
  // never be restored into another admin's editor on a shared browser. The
  // provider is remounted (keyed on user.id in App.tsx) when the user changes,
  // so this scope is stable for the lifetime of a session.
  const autosaveScope = user?.id ?? 'local';
  // Allow-list (F9): only admin/manager can edit. A role that hasn't loaded
  // yet, or failed to load, is `null` and must stay read-only — it must never
  // be treated as an editor just because it isn't 'field'.
  const canEdit = canEditForRole(role);
  const [restored] = useState(() => {
    const r = restore(autosaveScope);
    mergeCustomSymbols(r?.customSymbols);
    seedSeqFromProject(r); // F8: don't restart the id counter below ids already in the restored project
    return r;
  });
  const [project, setProject] = useState<Project>(() => restored ?? emptyProject());
  const [mode, setMode] = useState<Mode>('admin');
  // first open (nothing autosaved) → show the date-first onboarding modal (FR-1)
  const [showOnboard, setShowOnboard] = useState(() => restored === null);
  const [cloudId, setCloudId] = useState<string | null>(null);
  // The lock version of the currently-open cloud row (0026). Sent on Save for an
  // optimistic compare-and-swap; null for a brand-new/unsaved draft (→ INSERT).
  const [cloudVersion, setCloudVersion] = useState<number | null>(null);
  // register → diagram focus request (FR-27): bump seq to re-center on focusId
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);

  // ---- multi-selection + clipboard + group transforms (F19: useSelection) ---
  const {
    selectedId, setSelectedId, selected, selectedIds, setSelectedIds, toggleSelect, clearSelection, selectAll,
    clipboardCount, copySelection, cutSelection, pasteClipboard, deleteSelection, duplicateSelection,
    rotateSelection, flipSelection, scaleSelection, moveMany, alignSelection, distributeSelection,
    groupSelection, ungroupSelection, toggleLockSelection,
  } = useSelection(project, setProject);

  // debounced autosave on every project change (FR-58)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autosave(project, autosaveScope), 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [project, autosaveScope]);

  // ---- undo / redo history (F19: useHistory) --------------------------------
  // a jump in time shouldn't leave a stale selection pointing at nodes from
  // the other timeline — clear it, same as the old inline undo/redo did.
  const onTimeTravel = useCallback(() => setSelectedIds([]), [setSelectedIds]);
  const { undo, redo, canUndo, canRedo } = useHistory(project, setProject, onTimeTravel);

  const refDate = useMemo(() => {
    const d = new Date(project.meta.date + 'T00:00');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [project.meta.date]);

  // F17: validate() walks the whole project graph, so don't re-run it on every
  // tick of a drag/edit burst — debounce ~250ms after the project settles.
  // The previous result stays visible during the burst; it always converges
  // to the correct set once edits stop (validate() itself is unchanged).
  const [issues, setIssues] = useState<Issue[]>(() => validate(project));
  useEffect(() => {
    const t = setTimeout(() => setIssues(validate(project)), 250);
    return () => clearTimeout(t);
  }, [project]);

  // ---- shared + custom symbol library (F19: useSymbolLibrary) ---------------
  const {
    hiddenSymbols, canEditLibrary, addCustomSymbol, updateCustomSymbol, deleteCustomSymbol, hideSymbol, restoreSymbol,
  } = useSymbolLibrary(role, project.customSymbols, project.hiddenSymbols, setProject);

  const bump = (p: Project, patch: Partial<Project>): Project => ({ ...p, ...patch, revision: (p.revision ?? 0) + 1 });

  const loadMaster = useCallback(() => {
    const d = rigData(project.meta.rig);
    const { nodes, pipes } = d.byRegister ? buildFromRegister(d.register, d.template) : buildMaster(d.template, d.register, d.pipes);
    setSelectedId(null);
    setProject((p) => bump(p, { nodes, pipes, edges: [] }));
  }, [project.meta.rig, setSelectedId]);

  const loadLayout = useCallback((template: TemplateItem[], pipes: PipeSeg[]) => {
    const { nodes } = buildMaster(template, RIG303_EQUIPMENT);
    setSelectedId(null);
    setProject((p) => bump(p, { nodes, pipes, edges: [] }));
    return nodes.length;
  }, [setSelectedId]);

  const importAEMP = useCallback(async (config?: AempConfig) => {
    const { assets, live } = await importFromAEMP(config);
    const { nodes, pipes } = buildMaster(undefined, assets);
    setSelectedId(null);
    setProject((p) => bump(p, { nodes, pipes, edges: [] }));
    return live;
  }, [setSelectedId]);

  const buildBop = useCallback((section: HoleSection) => {
    setProject((p) => {
      seedBopSeq(p.bop.items); // F8: don't collide with b-ids already in this scheme
      const items = buildBopStack(section, RIG303_EQUIPMENT);
      return { ...p, bop: { ...p.bop, items } };
    });
  }, []);

  const addNode = useCallback((type: SymbolKey, x: number, y: number) => {
    const n = newNode(type, x, y);
    setProject((p) => ({ ...p, nodes: [...p.nodes, n] }));
    setSelectedId(n.id);
    return n.id;
  }, [setSelectedId]);

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
  }, [setSelectedIds]);

  const duplicateNode = useCallback((id: string) => {
    // F11: honest duplicate — only mint an id (and select it) when a source
    // node actually exists; otherwise return null and touch nothing.
    const src = project.nodes.find((n) => n.id === id);
    if (!src) return null;
    // mint the id BEFORE setProject so the reducer stays pure — React
    // StrictMode/concurrent re-invocation must never call nextId() itself.
    const newId = nextId('n');
    setProject((p) => {
      const s = p.nodes.find((n) => n.id === id);
      if (!s) return p; // source removed between the check above and now
      const copy: Component = { ...s, id: newId, x: s.x + 24, y: s.y + 24 };
      return { ...p, nodes: [...p.nodes, copy] };
    });
    setSelectedId(newId);
    return newId;
  }, [project.nodes, setSelectedId]);

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
    const s = Math.max(0.4, Math.min(3, scale));
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

  const addEdge = useCallback((from: string, to: string, opts?: { fromPort?: PortName; toPort?: PortName; lineType?: PipeKind; color?: string }) => {
    if (from === to) return;
    setProject((p) => {
      if (p.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return p;
      const edge: Edge = {
        id: nextId('e'), from, to,
        color: opts?.color ?? 'var(--accent2)',
        lineType: opts?.lineType,
        fromPort: opts?.fromPort, toPort: opts?.toPort,
      };
      return { ...p, edges: [...p.edges, edge] };
    });
  }, []);

  const deleteEdge = useCallback((id: string) => {
    setProject((p) => ({ ...p, edges: p.edges.filter((e) => e.id !== id) }));
  }, []);

  const setEdgeType = useCallback((id: string, lineType: PipeKind, color: string) => {
    setProject((p) => ({ ...p, edges: p.edges.map((e) => (e.id === id ? { ...e, lineType, color } : e)) }));
  }, []);

  const splitEdgeAt = useCallback((edgeId: string, type: SymbolKey, at: { x: number; y: number }) => {
    const s = SYM[type];
    if (!s) return null;
    const j = newNode(type, snap(at.x - s.w / 2), snap(at.y - s.h / 2));
    // F11: mint both edge ids BEFORE setProject so the reducer stays pure.
    const eAId = nextId('e');
    const eBId = nextId('e');
    setProject((p) => {
      const e = p.edges.find((x) => x.id === edgeId);
      if (!e) return p;
      // A→J keeps A's port; J→B keeps B's port. The junction ends auto-pick
      // their nearest port so both halves re-route cleanly (and stay attached
      // to the original equipment at the far ends).
      const eA: Edge = { id: eAId, from: e.from, to: j.id, color: e.color, lineType: e.lineType, fromPort: e.fromPort };
      const eB: Edge = { id: eBId, from: j.id, to: e.to, color: e.color, lineType: e.lineType, toPort: e.toPort };
      return { ...p, nodes: [...p.nodes, j], edges: [...p.edges.filter((x) => x.id !== edgeId), eA, eB] };
    });
    setSelectedId(j.id);
    return j.id;
  }, [setSelectedId]);

  const saveProject = useCallback(() => saveToFile(project), [project]);
  const openProject = useCallback(async (file: File) => {
    const loaded = await openFromFile(file);
    seedSeqFromProject(loaded); // F8
    setSelectedId(null);
    setProject(loaded);
  }, [setSelectedId]);
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
        const { nodes, pipes } = d.byRegister ? buildFromRegister(d.register, d.template) : buildMaster(d.template, d.register, d.pipes);
        return { ...next, nodes, pipes, revision: (p.revision ?? 0) + 1 };
      }
      return next;
    });
  }, []);

  const saveCloud = useCallback(async (note?: string) => {
    const res = await saveProjectCloud(project, cloudId ?? undefined, cloudVersion ?? undefined, note);
    if (res) { setCloudId(res.id); setCloudVersion(res.version); }
    return res?.id ?? null;
  }, [project, cloudId, cloudVersion]);
  const listCloud = useCallback(() => listProjectsCloud(), []);
  const loadCloud = useCallback(async (id: string) => {
    const res = await loadProjectCloud(id);
    if (res) { seedSeqFromProject(res.project); setSelectedId(null); setCloudId(id); setCloudVersion(res.version); setProject(res.project); } // F8
  }, [setSelectedId]);
  const listVersions = useCallback((projectId: string) => listProjectVersions(projectId), []);
  const restoreVersion = useCallback(async (versionId: string) => {
    const loaded = await loadProjectVersion(versionId);
    if (loaded) { seedSeqFromProject(loaded); setSelectedId(null); setProject(loaded); } // F8
  }, [setSelectedId]);

  // ---- draft / publish workflow ---------------------------------------------
  const saveWithStatus = useCallback(async (status: 'draft' | 'published', note?: string) => {
    const stamped: Project = {
      ...project,
      status,
      publishedAt: status === 'published' ? new Date().toISOString() : project.publishedAt,
    };
    setProject(stamped);
    const res = await saveProjectCloud(stamped, cloudId ?? undefined, cloudVersion ?? undefined, note);
    if (res) { setCloudId(res.id); setCloudVersion(res.version); }
    return res?.id ?? null;
  }, [project, cloudId, cloudVersion]);
  const saveAsDraft = useCallback((note?: string) => saveWithStatus('draft', note), [saveWithStatus]);
  const publishFinal = useCallback((note?: string) => saveWithStatus('published', note), [saveWithStatus]);

  // ---- Project Manager per-item operations -----------------------------------
  // Save the current canvas INTO a specific diagram row, guarded by the version
  // the tree showed — a stale save is rejected (SaveConflictError) not clobbered.
  const saveActiveToDiagram = useCallback(async (id: string, expectedVersion: number) => {
    const res = await saveProjectCloud(project, id, expectedVersion);
    if (res) { setCloudId(res.id); setCloudVersion(res.version); }
    return res?.id ?? null;
  }, [project]);

  // Create a new diagram from the current canvas under `unitName`. The DB trigger
  // links it to the unit; we then bind the editor to the new row and (optionally)
  // name it.
  const createDiagramUnder = useCallback(async (unitName: string, name?: string) => {
    const proj: Project = { ...project, meta: { ...project.meta, rig: unitName } };
    const res = await saveProjectCloud(proj, undefined, undefined);
    if (res) {
      if (name && name.trim()) await renameDiagram(res.id, name.trim());
      setProject(proj); setCloudId(res.id); setCloudVersion(res.version);
    }
    return res?.id ?? null;
  }, [project]);

  const openTemplateOnCanvas = useCallback((tpl: Project) => {
    seedSeqFromProject(tpl); // F8
    setSelectedId(null); setCloudId(null); setCloudVersion(null); setProject(tpl);
  }, [setSelectedId]);

  const deactivateDiagram = useCallback((id: string) => {
    if (cloudId === id) { setCloudId(null); setCloudVersion(null); }
  }, [cloudId]);

  // ---- clear canvas (removes nodes AND piping/edges/annotations) -------------
  const clearCanvas = useCallback(() => {
    setSelectedIds([]);
    setProject((p) => bump(p, { nodes: [], pipes: [], edges: [], annotations: [] }));
  }, [setSelectedIds]);

  // ---- units (user-manageable rigs) (F19: useUnits) --------------------------
  const {
    units, refreshUnits, switchUnit, addUnit, renameUnit, removeUnit, showUnits, setShowUnits,
    unitTemplates, refreshUnitTemplates, startFromTemplate, saveUnitTemplate, listUnitDiagrams,
  } = useUnits(role, rig, authEnabled, project, setProject, setCloudId, setCloudVersion, setSelectedId);

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

  // F15: the context value was a fresh object literal every render, so every
  // useProject() consumer re-rendered on ANY state change (mega-context).
  // Every member above is already a stable useCallback / useState setter or a
  // value memoized on its own inputs, so memoizing this object on all of them
  // means it only changes identity when something it actually exposes changed.
  const value: ProjectCtx = useMemo(() => ({
    project, refDate, mode, setMode, selectedId, setSelectedId, selected,
    selectedIds, setSelectedIds, toggleSelect, clearSelection, selectAll,
    clipboardCount, copySelection, cutSelection, pasteClipboard,
    deleteSelection, duplicateSelection, rotateSelection, flipSelection, scaleSelection, moveMany,
    alignSelection, distributeSelection,
    undo, redo, canUndo, canRedo,
    loadMaster, loadLayout, importAEMP, buildBop, setProject,
    saveProject, openProject, updateMeta,
    showOnboard, setShowOnboard, completeOnboarding,
    cloudEnabled: isSupabaseConfigured, cloudId, saveCloud, listCloud, loadCloud, listVersions, restoreVersion,
    saveActiveToDiagram, createDiagramUnder, openTemplateOnCanvas, deactivateDiagram,
    canEdit, saveAsDraft, publishFinal, clearCanvas,
    units, refreshUnits, switchUnit, addUnit, renameUnit, removeUnit, showUnits, setShowUnits,
    unitTemplates, refreshUnitTemplates, startFromTemplate, saveUnitTemplate, listUnitDiagrams,
    addNode, updateNode, moveNode, deleteNode, duplicateNode, changeType,
    rotateNode, flipNode, scaleNode, toggleRemoved, addEdge, deleteEdge, setEdgeType, splitEdgeAt, addComponents,
    focusId, focusSeq, requestFocus, issues,
    addAnnotation, updateAnnotation, deleteAnnotation,
    groupSelection, ungroupSelection, toggleLockSelection,
    addCustomSymbol, updateCustomSymbol, deleteCustomSymbol, hideSymbol, restoreSymbol, hiddenSymbols, canEditLibrary,
    redeemReward,
  }), [
    project, refDate, mode, setMode, selectedId, setSelectedId, selected,
    selectedIds, setSelectedIds, toggleSelect, clearSelection, selectAll,
    clipboardCount, copySelection, cutSelection, pasteClipboard,
    deleteSelection, duplicateSelection, rotateSelection, flipSelection, scaleSelection, moveMany,
    alignSelection, distributeSelection,
    undo, redo, canUndo, canRedo,
    loadMaster, loadLayout, importAEMP, buildBop, setProject,
    saveProject, openProject, updateMeta,
    showOnboard, setShowOnboard, completeOnboarding,
    cloudId, saveCloud, listCloud, loadCloud, listVersions, restoreVersion,
    saveActiveToDiagram, createDiagramUnder, openTemplateOnCanvas, deactivateDiagram,
    canEdit, saveAsDraft, publishFinal, clearCanvas,
    units, refreshUnits, switchUnit, addUnit, renameUnit, removeUnit, showUnits, setShowUnits,
    unitTemplates, refreshUnitTemplates, startFromTemplate, saveUnitTemplate, listUnitDiagrams,
    addNode, updateNode, moveNode, deleteNode, duplicateNode, changeType,
    rotateNode, flipNode, scaleNode, toggleRemoved, addEdge, deleteEdge, setEdgeType, splitEdgeAt, addComponents,
    focusId, focusSeq, requestFocus, issues,
    addAnnotation, updateAnnotation, deleteAnnotation,
    groupSelection, ungroupSelection, toggleLockSelection,
    addCustomSymbol, updateCustomSymbol, deleteCustomSymbol, hideSymbol, restoreSymbol, hiddenSymbols, canEditLibrary,
    redeemReward,
  ]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProject must be used within <ProjectProvider>');
  return ctx;
}
