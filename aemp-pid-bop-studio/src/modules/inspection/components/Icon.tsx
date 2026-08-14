// ============================================================================
//  Lucide icon wrapper. The names below were read off the reference system's
//  own DOM (its <svg class="lucide lucide-…">), so the module uses the exact
//  same glyph for each affordance.
// ============================================================================
import {
  BadgeCheck, Bell, Boxes, Building2, CalendarClock, ChartPie, ChevronDown,
  ChevronRight, ClipboardCheck, Download, Factory, FileDown, FileStack, FileText,
  FolderOpen, Funnel, LayoutDashboard, Moon, PanelLeft, Pencil, Plus, ScrollText,
  Settings2, Share2, ShieldCheck, SlidersHorizontal, Stamp, Sun, Tags, Timer,
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
  // Column-band controls in the grouped header.
  'band-columns': SlidersHorizontal,
  'band-collapse': ChevronDown,
  'band-expand': ChevronRight,
  // Dashboard KPI glyphs, read from the reference's own cards.
  'kpi-compliance': ShieldCheck,
  'kpi-overdue': TriangleAlert,
  'kpi-due': CalendarClock,
  'kpi-coverage': ChartPie,
  'kpi-approval': Stamp,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Reference icons render at 16px with Lucide's default 2px stroke. */
export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} aria-hidden="true" />;
}
