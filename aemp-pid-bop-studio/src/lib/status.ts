// ============================================================================
//  Inspection status engine  (PRD §7.7, FR-29/30)
//  Ported verbatim from the prototype's statusOf().
//  status = f(int_due, maj_due, referenceDate)
//    over  : any due date is in the past
//    due   : any due date within the warning window (default 60 days)
//    ok    : tagged & all dates beyond the window
//    untag : no tag
// ============================================================================
import type { Component, InspectionStatus } from '../types';

export const DUE_SOON_DAYS = 60; // FR-29: window is configurable

const MS_PER_DAY = 864e5;

/** Item-like shape: anything carrying a tag + the two due dates. */
export interface Datable {
  tag?: string;
  int_due?: string;
  maj_due?: string;
}

/**
 * Compute the inspection status of an item against a reference date.
 * @param refDate reference / inspection date (defaults to today, midnight)
 * @param dueSoonDays warning window in days (default 60)
 */
export function statusOf(
  n: Datable,
  refDate: Date = startOfToday(),
  dueSoonDays: number = DUE_SOON_DAYS,
): InspectionStatus {
  if (!n.tag) return 'untag';
  const dates = [n.int_due, n.maj_due]
    .filter(Boolean)
    .map((x) => new Date(x + 'T00:00'));
  if (!dates.length) return 'ok';
  let worst: InspectionStatus = 'ok';
  for (const d of dates) {
    const days = (d.getTime() - refDate.getTime()) / MS_PER_DAY;
    if (days < 0) {
      // Overdue dominates everything else — short-circuit.
      return 'over';
    }
    if (days <= dueSoonDays) worst = 'due';
  }
  return worst;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Status → CSS custom-property colour (theme tokens). */
export const STATUS_COLOR: Record<InspectionStatus, string> = {
  ok: 'var(--green)',
  due: 'var(--amber)',
  over: 'var(--red)',
  untag: 'var(--faint)',
};

/** Status → human label. */
export const STATUS_LABEL: Record<InspectionStatus, string> = {
  ok: 'In Date',
  due: 'Due Soon',
  over: 'Overdue',
  untag: 'Untagged',
};

/** Roll up a component list into register summary counters (PRD FR-25). */
export function summarize(nodes: Component[], refDate?: Date) {
  const counts = { total: nodes.length, ok: 0, due: 0, over: 0, untag: 0 };
  for (const n of nodes) counts[statusOf(n, refDate)]++;
  return counts;
}
