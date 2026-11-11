// ============================================================================
//  Annual Maintenance — Gantt (the workbook's "Gantt Chart" sheet). One row
//  per dated line, a day grid from the first start to the last end (offline
//  jobs often run weeks before the AM window), the AM window shaded, today
//  marked. Bars are coloured by status.
// ============================================================================
import { addDays, daysBetween, pct, itemProgress, type AmItem } from '../lib/am';

const MAX_DAYS = 120;
const TONE: Record<string, string> = {
  Completed: 'var(--i-success)', 'In Progress': 'var(--i-warning)', 'Not Started': 'var(--i-muted)',
};

export default function AmGantt({ items, windowStart, windowEnd, today }: {
  items: AmItem[]; windowStart: string | null; windowEnd: string | null; today: string;
}) {
  const dated = items.filter((i) => i.startDate && i.endDate && i.status !== 'Not applicable')
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : a.startDate! > b.startDate! ? 1 : (a.ganttSeq ?? 0) - (b.ganttSeq ?? 0)));
  if (!dated.length) return <p style={{ color: 'var(--i-muted)' }}>No lines have start and end dates yet.</p>;

  const starts = [...dated.map((i) => i.startDate!), ...(windowStart ? [windowStart] : [])].sort();
  const ends = [...dated.map((i) => i.endDate!), ...(windowEnd ? [windowEnd] : [])].sort();
  const first = starts[0];
  const span = Math.min(MAX_DAYS, daysBetween(first, ends[ends.length - 1]) ?? 1);
  const days = Array.from({ length: span }, (_, k) => addDays(first, k));
  const col = (iso: string) => (daysBetween(first, iso) ?? 1) - 1;
  const inWindow = (iso: string) => !!windowStart && !!windowEnd && iso >= windowStart && iso <= windowEnd;
  const cls = (base: string, d: string) => `${base}${inWindow(d) ? ' win' : ''}${d === today ? ' today' : ''}`;

  return (
    <div className="am-gantt" style={{ ['--am-days' as string]: span }}>
      <div className="am-gantt-row am-gantt-head">
        <div className="am-gantt-label">Equipment</div>
        <div className="am-gantt-grid">
          {days.map((d) => <div key={d} className={cls('am-gantt-day', d)} title={d}>{Number(d.slice(8))}</div>)}
        </div>
      </div>
      {dated.map((i, n) => {
        const s = Math.max(0, col(i.startDate!)), e = Math.min(span - 1, col(i.endDate!));
        if (s > span - 1) return null;
        return (
          <div key={i.id ?? n} className="am-gantt-row">
            <div className="am-gantt-label" title={i.description}>{i.description}</div>
            <div className="am-gantt-grid">
              {days.map((d) => <div key={d} className={cls('am-gantt-cell', d)} />)}
              <div className="am-gantt-bar" title={`${i.startDate} → ${i.endDate} · ${i.status} · ${pct(itemProgress(i))}`}
                style={{ gridColumn: `${s + 1} / ${e + 2}`, background: TONE[i.status] ?? 'var(--i-info)' }}>
                {pct(itemProgress(i))}
              </div>
            </div>
          </div>
        );
      })}
      {span === MAX_DAYS && <p style={{ color: 'var(--i-muted)', fontSize: 12 }}>Showing the first {MAX_DAYS} days.</p>}
    </div>
  );
}
