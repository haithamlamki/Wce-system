// ============================================================================
//  Annual Maintenance — Gantt, drawn as the workbook's "Gantt Chart" sheet:
//  Equipment | Start | End | Progress | Status | Duration, then one column per
//  day under a week / date / weekday header (weekends shaded, today red). A
//  line's bar is grey from start to end and fills from the left by its
//  progress — green when completed, red when overdue, amber otherwise — as the
//  sheet's conditional formats. Every active line is listed in Gantt order;
//  undated lines keep their row. Table layout: each day is a fixed column.
// ============================================================================
import { daysBetween, itemProgress, pct, type AmItem } from '../lib/am';
import { barCells, dow, fmt, ganttOrder, ganttRange } from '../lib/amGantt';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AmGantt({ items, windowStart, windowEnd, today }: {
  items: AmItem[]; windowStart: string | null; windowEnd: string | null; today: string;
}) {
  const rows = ganttOrder(items);
  if (!rows.length) return <p style={{ color: 'var(--i-muted)' }}>No applicable lines in this plan.</p>;
  const { days, clipped } = ganttRange(rows, windowStart, windowEnd, today);
  const weeks = days.filter((_, k) => k % 7 === 0);
  const inWin = (d: string) => !!windowStart && !!windowEnd && d >= windowStart && d <= windowEnd;
  const dayCls = (d: string) => `${dow(d) === 5 || dow(d) === 6 ? ' we' : ''}${d === today ? ' today' : ''}${inWin(d) ? ' win' : ''}`;
  const undated = rows.filter((i) => !i.startDate || !i.endDate).length;

  return (
    <div className="amg-wrap">
      <table className="amg">
        <colgroup>
          <col style={{ width: 300 }} /><col style={{ width: 78 }} /><col style={{ width: 78 }} />
          <col style={{ width: 76 }} /><col style={{ width: 92 }} /><col style={{ width: 64 }} />
          {days.map((d) => <col key={d} style={{ width: 26 }} />)}
        </colgroup>
        <thead>
          <tr className="wk">
            <th className="fix" colSpan={6} />
            {weeks.map((w) => <th key={w} colSpan={7}>{fmt(w)}</th>)}
          </tr>
          <tr className="dt">
            <th className="fix" colSpan={6} />
            {days.map((d) => <th key={d} className={dayCls(d)} title={fmt(d)}>{Number(d.slice(8))}</th>)}
          </tr>
          <tr className="hd">
            <th className="fix">Equipment Description</th><th>Start Date</th><th>End Date</th><th>Progress</th>
            <th>Status</th><th>Duration (Days)</th>
            {days.map((d) => <th key={d} className={dayCls(d)}>{DOW[dow(d)]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((i, n) => {
            const p = itemProgress(i);
            const cells = barCells(i, days, today);
            const tip = `${i.description}\n${fmt(i.startDate)} → ${fmt(i.endDate)} · ${i.status} · ${pct(p)}`;
            return (
              <tr key={i.id ?? n}>
                <td className="fix lbl" title={i.description}>{i.description}</td>
                <td className="c">{fmt(i.startDate)}</td><td className="c">{fmt(i.endDate)}</td>
                <td className="c">{pct(p)}</td>
                <td className={`c st st-${i.status.replace(/\s/g, '')}`}>{i.status}</td>
                <td className="c">{daysBetween(i.startDate, i.endDate) ?? ''}</td>
                {cells.map((c, k) => (
                  <td key={days[k]} title={c ? tip : undefined}
                    className={`d${dayCls(days[k])}${c ? ` bar${c.fill ? ` f-${c.fill}` : ''}${c.start ? ' bs' : ''}${c.end ? ' be' : ''}` : ''}`} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="amg-note">
        <span className="k f-done" />Completed<span className="k f-prog" />In progress<span className="k f-late" />Overdue
        <span className="k" />Remaining<span className="k k-today" />Today<span className="k k-win" />AM window
        {windowStart && windowEnd && <> {fmt(windowStart)} → {fmt(windowEnd)}</>}
        {undated > 0 && <> · {undated} line{undated === 1 ? '' : 's'} without dates yet</>}
        {clipped && <> · showing {days.length / 7} weeks around the AM window</>}
      </p>
    </div>
  );
}
