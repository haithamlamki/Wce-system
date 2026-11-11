// ============================================================================
//  Annual Maintenance — small pieces shared by the dashboard and plan page.
// ============================================================================
import { useMemo } from 'react';
import { Badge, type BadgeTone } from './ui';
import { useInspection } from '../state/InspectionContext';
import type { ItemStatus, PlanStatus } from '../lib/am';

/** Rigs in the caller's scope, as the MOH pages list them. */
export function useAmRigs() {
  const { units, scopedUnitIds } = useInspection();
  return useMemo(() => units
    .filter((u) => u.unitType !== 'other' && scopedUnitIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [units, scopedUnitIds]);
}

export function todayISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

export function ProgressBar({ value }: { value: number }) {
  const p = Math.max(0, Math.min(1, value));
  return (
    <div className="am-progress">
      <div className="am-bar" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${p * 100}%` }} />
      </div>
      <b>{Math.round(p * 100)}%</b>
    </div>
  );
}

const PLAN_TONE: Record<PlanStatus, BadgeTone> = {
  Planning: 'info', 'In Progress': 'warning', Completed: 'success', Cancelled: 'neutral',
};
const ITEM_TONE: Record<ItemStatus, BadgeTone> = {
  'Not Started': 'neutral', 'In Progress': 'warning', Completed: 'success', 'Not applicable': 'neutral',
};

export function PlanStatusBadge({ status, finalized }: { status: PlanStatus; finalized: boolean }) {
  return <Badge tone={PLAN_TONE[status]}>{finalized ? `${status} · finalized` : status}</Badge>;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  return <Badge tone={ITEM_TONE[status]}>{status}</Badge>;
}
