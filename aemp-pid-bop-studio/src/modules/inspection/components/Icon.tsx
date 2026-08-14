// ============================================================================
//  Lucide icon wrapper. The names below were read off the reference system's
//  own DOM (its <svg class="lucide lucide-…">), so the module uses the exact
//  same glyph for each affordance.
// ============================================================================
import {
  BadgeCheck, Bell, Boxes, Building2, ClipboardCheck, Download, Factory,
  FileDown, FileStack, FileText, FolderOpen, Funnel, Gauge, LayoutDashboard, Moon,
  PanelLeft, Pencil, Plus, ScrollText, Settings2, Share2, Sun, Tags, Target, Timer,
  Trash2, TriangleAlert, Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS = {
  // sidebar
  dashboard: LayoutDashboard,
  equipment: Boxes,
  inspections: ClipboardCheck,
  approvals: BadgeCheck,
  'shared-documents': FileStack,
  categories: Tags,
  pid: Share2,
  library: FolderOpen,
  frequencies: Timer,
  companies: Building2,
  units: Factory,
  // topbar
  'panel-left': PanelLeft,
  bell: Bell,
  moon: Moon,
  sun: Sun,
  // toolbar / row actions
  filter: Funnel,
  columns: Settings2,
  export: FileDown,
  upload: Upload,
  plus: Plus,
  documents: FileText,
  history: ScrollText,
  edit: Pencil,
  delete: Trash2,
  download: Download,
  // Dashboard KPI glyphs. The reference shows an icon on each KPI card but the
  // session expired before its exact choices could be read, so these are
  // semantic stand-ins — see docs/inspection-reference-parity.md §9.
  gauge: Gauge,
  alert: TriangleAlert,
  timer: Timer,
  target: Target,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Reference icons render at 16px with Lucide's default 2px stroke. */
export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} aria-hidden="true" />;
}
