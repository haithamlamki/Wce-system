// Annual Maintenance — Gantt layout helpers (pure): row order, visible day range, bar cells.
import { addDays, daysBetween, isActive, itemProgress, type AmItem } from './am';

/** 18 weeks; longer plans keep the AM window (and the weeks before it) in view. */
export const MAX_DAYS = 126;
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const sunday = (iso: string) => addDays(iso, -dow(iso));
const saturday = (iso: string) => addDays(iso, 6 - dow(iso));
export const fmt = (iso: string | null) => (iso ? `${Number(iso.slice(8))}-${MON[Number(iso.slice(5, 7)) - 1]}-${iso.slice(2, 4)}` : '');

/** Sheet's Gantt order: lines with a Gantt Seq by it, then the rest in plan order. */
export function ganttOrder(items: AmItem[]): AmItem[] {
  const active = items.filter(isActive);
  const seq = active.filter((i) => i.ganttSeq !== null).sort((a, b) => a.ganttSeq! - b.ganttSeq!);
  return [...seq, ...active.filter((i) => i.ganttSeq === null)];
}

export interface GanttRange { days: string[]; clipped: boolean }

/** Whole weeks (Sun–Sat) from the first date to the last; when longer than MAX_DAYS, the weeks ending with the AM window. */
export function ganttRange(items: AmItem[], windowStart: string | null, windowEnd: string | null, today: string): GanttRange {
  const dates = [...items.flatMap((i) => [i.startDate, i.endDate]), windowStart, windowEnd]
    .filter((d): d is string => !!d).sort();
  const lo = sunday(dates[0] ?? today);
  const last = saturday(dates[dates.length - 1] ?? today);
  let first = lo, hi = last;
  if ((daysBetween(lo, hi) ?? 0) > MAX_DAYS) {
    hi = saturday(windowEnd ?? last);
    first = addDays(hi, -(MAX_DAYS - 1));
    if (first < lo) { first = lo; hi = addDays(lo, MAX_DAYS - 1); }
  }
  const n = daysBetween(first, hi) ?? 7;
  return { days: Array.from({ length: n }, (_, k) => addDays(first, k)), clipped: first > lo || hi < last };
}

export type Fill = 'done' | 'late' | 'prog';
export interface BarCell { fill: Fill | null; start: boolean; end: boolean }

/** Per-day state of a line's bar: null outside it; the first round(duration × progress) days are filled. */
export function barCells(i: AmItem, days: string[], today: string): (BarCell | null)[] {
  const s = i.startDate, e = i.endDate;
  if (!s || !e || e < s) return days.map(() => null);
  const filled = Math.round((daysBetween(s, e) ?? 1) * itemProgress(i));
  const tone: Fill = i.status === 'Completed' ? 'done' : e < today ? 'late' : 'prog';
  return days.map((d) => {
    if (d < s || d > e) return null;
    return { fill: (daysBetween(s, d) ?? 1) - 1 < filled ? tone : null, start: d === s, end: d === e };
  });
}
