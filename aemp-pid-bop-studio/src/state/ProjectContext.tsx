// ============================================================================
//  Project state container (Phase-1).
//  Holds the live Project document + editor UI state (mode, selection) and
//  exposes the actions that wrap the extracted engine modules. Swap the
//  in-memory store for AEMP server persistence in Phase-1 (PRD FR-59) without
//  touching the views.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Component, Edge, Project } from '../types';
import { buildMaster, importFromAEMP, type AempConfig } from '../lib/aemp';
import { buildBopStack, type HoleSection } from '../lib/bop';
import { SYM, type SymbolKey } from '../lib/symbols';
import { RIG303_EQUIPMENT } from '../lib/data/rig303-equipment';
import { autosave, openFromFile, restore, saveToFile } from '../lib/persistence';
import { isSupabaseConfigured, listProjectsCloud, loadProjectCloud, saveProjectCloud, type ProjectSummary } from '../lib/cloud';

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
    size: '',
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
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: Component | null;

  // engine actions
  loadMaster: () => void;
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
  saveCloud: () => Promise<string | null>;
  listCloud: () => Promise<ProjectSummary[]>;
  loadCloud: (id: string) => Promise<void>;

  // node CRUD (admin) / as-built (field)
  addNode: (type: SymbolKey, x: number, y: number) => string;
  updateNode: (id: string, patch: Partial<Component>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => string | null;
  rotateNode: (id: string, applyToType?: boolean) => void;
  flipNode: (id: string) => void;
  scaleNode: (id: string, scale: number) => void;
  toggleRemoved: (id: string) => void;
  addEdge: (from: string, to: string) => void;
  /** Bulk-add components (e.g. from CSV import); grid-places them. Returns count. */
  addComponents: (rows: Array<Partial<Component> & { type?: SymbolKey }>) => number;
}

const Ctx = createContext<ProjectCtx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [restored] = useState(() => restore());
  const [project, setProject] = useState<Project>(() => restored ?? emptyProject());
  const [mode, setMode] = useState<Mode>('admin');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // first open (nothing autosaved) → show the date-first onboarding modal (FR-1)
  const [showOnboard, setShowOnboard] = useState(() => restored === null);
  const [cloudId, setCloudId] = useState<string | null>(null);

  // debounced autosave on every project change (FR-58)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autosave(project), 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [project]);

  const refDate = useMemo(() => {
    const d = new Date(project.meta.date + 'T00:00');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [project.meta.date]);

  const selected = useMemo(
    () => project.nodes.find((n) => n.id === selectedId) ?? null,
    [project.nodes, selectedId],
  );

  const bump = (p: Project, patch: Partial<Project>): Project => ({ ...p, ...patch, revision: (p.revision ?? 0) + 1 });

  const loadMaster = useCallback(() => {
    const { nodes, pipes } = buildMaster();
    setSelectedId(null);
    setProject((p) => bump(p, { nodes, pipes, edges: [] }));
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
    setProject((p) => ({
      ...p,
      nodes: p.nodes.filter((n) => n.id !== id),
      edges: p.edges.filter((e) => e.from !== id && e.to !== id),
    }));
    setSelectedId((cur) => (cur === id ? null : cur));
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

  const flipNode = useCallback((id: string) => {
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, flip: !n.flip } : n)) }));
  }, []);

  const scaleNode = useCallback((id: string, scale: number) => {
    const s = Math.max(0.4, Math.min(2.4, scale));
    setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, scale: s } : n)) }));
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

  const addEdge = useCallback((from: string, to: string) => {
    if (from === to) return;
    setProject((p) => {
      if (p.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return p;
      const edge: Edge = { id: nextId('e'), from, to, color: 'var(--accent2)' };
      return { ...p, edges: [...p.edges, edge] };
    });
  }, []);

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
        const { nodes, pipes } = buildMaster();
        return { ...next, nodes, pipes, revision: (p.revision ?? 0) + 1 };
      }
      return next;
    });
  }, []);

  const saveCloud = useCallback(async () => {
    const id = await saveProjectCloud(project, cloudId ?? undefined);
    if (id) setCloudId(id);
    return id;
  }, [project, cloudId]);
  const listCloud = useCallback(() => listProjectsCloud(), []);
  const loadCloud = useCallback(async (id: string) => {
    const loaded = await loadProjectCloud(id);
    if (loaded) { setSelectedId(null); setCloudId(id); setProject(loaded); }
  }, []);

  const value: ProjectCtx = {
    project, refDate, mode, setMode, selectedId, setSelectedId, selected,
    loadMaster, importAEMP, buildBop, setProject,
    saveProject, openProject, updateMeta,
    showOnboard, setShowOnboard, completeOnboarding,
    cloudEnabled: isSupabaseConfigured, cloudId, saveCloud, listCloud, loadCloud,
    addNode, updateNode, moveNode, deleteNode, duplicateNode,
    rotateNode, flipNode, scaleNode, toggleRemoved, addEdge, addComponents,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProject must be used within <ProjectProvider>');
  return ctx;
}
