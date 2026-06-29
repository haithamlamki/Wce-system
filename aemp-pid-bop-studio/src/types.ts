// ============================================================================
//  Core data model  —  AEMP P&ID & BOP Studio  (PRD §8)
//  Ported from the Phase-0 prototype `state` object and AEMP read model.
// ============================================================================
import type { SymbolDef, SymbolKey } from './lib/symbols';

export type InspectionStatus = 'ok' | 'due' | 'over' | 'untag';

/** A placed equipment item on the P&ID canvas. */
export interface Component {
  id: string;
  type: SymbolKey;
  x: number;
  y: number;
  // admin transforms
  rot: number;
  scale: number;
  flip: boolean;
  // identity / classification
  tag: string;
  description: string;
  section: string;
  // ratings
  rwp: string;
  size: string;
  manufacturer: string;
  serial: string;
  // inspection dates (ISO yyyy-mm-dd)
  int_last: string;
  int_due: string;
  maj_last: string;
  maj_due: string;
  // as-built overlay (field mode)
  removed: boolean;
  installed?: boolean;
  // editor grouping / locking (report §3 grouping/locking)
  groupId?: string;
  locked?: boolean;
  // link to the AEMP system-of-record asset
  aempAssetId?: string;
}

/** A piping polyline. Tuple form matches the prototype: [x1,y1,x2,y2,color]. */
export type PipeSeg = [number, number, number, number, string];

/** Cardinal connection-port name. */
export type PortName = 'N' | 'E' | 'S' | 'W';

/** Logical connection between two components (optional / derived). */
export interface Edge {
  id: string;
  from: string;
  to: string;
  color?: string;
  // explicit attach ports + intermediate route bends (report §2.2)
  fromPort?: PortName;
  toPort?: PortName;
  waypoints?: Array<{ x: number; y: number }>;
  curved?: boolean;
}

/** Free annotation on the canvas — text note or boxed region (report §6). */
export interface Annotation {
  id: string;
  kind: 'text' | 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  color?: string;
}

/** One placement row in a rig's master layout template (PRD FR-40/41/42). */
export interface TemplateItem {
  type: string;
  tag: string;
  name: string;
  x: number;
  y: number;
  rot: number;
}

/** AEMP equipment read-model record (and the embedded offline cache shape). */
export interface AempAsset {
  type: string;
  section: string;
  description: string;
  tag: string;
  rwp: string;
  size: string;
  manufacturer: string;
  serial: string;
  int_last: string;
  int_due: string;
  maj_last: string;
  maj_due: string;
  assetId?: string;
}

/** BOP elevation stack-up (PRD §7.8). */
export interface BopItem {
  id: string;
  type: SymbolKey;
  tag: string;
  description: string;
  height: number;
  serial?: string;
  int_due?: string;
  maj_due?: string;
}
export interface BopScheme {
  datum: number;
  rt: number; // rotary table (RKB) elevation
  unit: 'm' | 'ft';
  items: BopItem[];
}

export interface ProjectMeta {
  rig: string;
  date: string; // reference / inspection date (ISO)
  who: string; // inspector
  drawingNo?: string;
  title?: string;
}

export interface RewardsState {
  spent: number;
  redeemed: string[];
}

/** The full project document — the unit of save/load and server persistence. */
export interface Project {
  meta: ProjectMeta;
  nodes: Component[];
  edges: Edge[];
  pipes: PipeSeg[];
  bop: BopScheme;
  rewards: RewardsState;
  annotations?: Annotation[];
  /** User-drawn symbols added via the Symbol Drawer (keyed by symbol key). */
  customSymbols?: Record<string, SymbolDef>;
  revision?: number;
}
