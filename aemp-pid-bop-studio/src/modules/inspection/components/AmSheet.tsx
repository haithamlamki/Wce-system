// ============================================================================
//  Annual Maintenance — the "Maintenance Plan" sheet, drawn as the office
//  workbook: title block (rows 1–6), the teal header (row 7, frozen), the
//  coloured section bands, and each equipment line merged down its checklist
//  rows with the task text and a Done tick per row. Every cell is typed into
//  in place; the computed columns (tasks done, Progress, Status, Duration and
//  the header totals) follow the sheet's own formulas (lib/amSheet).
// ============================================================================
import { Fragment, useEffect, useState, type KeyboardEvent } from 'react';
import { todayISO } from './AmShared';
import { parseDate } from '../lib/amImport';
import type { AmItem } from '../lib/am';
import {
  APPLICABILITY_OPTIONS, addItem, addTask, moveItem, patchItem, patchTask, removeItem, removeTask, sheetDate, sheetDuration,
  sheetProgress, sheetSections, sheetStatus, sheetTotals, tasksDoneText, type SheetDraft,
} from '../lib/amSheet';

/** Excel column widths (characters → px) of B..O, plus the spacer column A. */
const COLS = [12, 37, 244, 87, 69, 120, 419, 57, 106, 113, 112, 115, 110, 66, 268];
const HEAD = ['SN', 'Equipment Description', 'Inspection Category', 'Interval', 'Inspection Status', 'Scope of Work',
  'Done', 'Responsible', 'Start Date', 'End Date', 'Progress', 'Status', 'Duration', 'Comments'];
const KNOWN = new Set(['DRILLING', 'MECHANICAL', 'ELECTRICAL']);

type Edit = (fn: (items: AmItem[]) => AmItem[]) => void;

export default function AmSheet({ draft, editable, onDraft }: {
  draft: SheetDraft; editable: boolean; onDraft: (d: SheetDraft) => void;
}) {
  const t = sheetTotals(draft);
  const edit: Edit = (fn) => onDraft({ ...draft, items: fn(draft.items) });
  const [newSection, setNewSection] = useState('');
  const sections = sheetSections(draft.items).filter((s) => editable || draft.items.some((i) => i.section === s));
  const width = COLS.reduce((a, b) => a + b, 0) + (editable ? 64 : 0);
  const tools = editable ? <td className="tools" /> : null;

  const addSection = () => {
    const name = newSection.trim().toUpperCase().slice(0, 60);
    if (!name) return;
    edit((items) => addItem(items, name));
    setNewSection('');
  };

  return (
    <div className="ams-wrap">
      <table className="ams" style={{ width }}>
        <colgroup>{COLS.map((w, n) => <col key={n} style={{ width: w }} />)}{editable && <col style={{ width: 64 }} />}</colgroup>
        <thead>
          <tr className="r1">
            <td /><td /><td className="t-name">Project Name</td>
            <td className="t-title" colSpan={3}>
              <input aria-label="Project name" value={draft.title} maxLength={120} disabled={!editable}
                onChange={(e) => onDraft({ ...draft, title: e.target.value })} placeholder="e.g. Rig305 AM-2026" />
            </td>
            <td className="t-logo"><img src="/brand/abraj-logo.png" alt="ABRAJ" /></td>
            <td colSpan={8} />{tools}
          </tr>
          <tr className="r2">
            <td /><td /><td className="t-k">TOTAL TASKS</td><td className="t-v">{t.totalTasks}</td><td colSpan={5} />
            <td className="t-dk">Duration</td><td className="t-v">{t.duration ?? ''}</td><td />
            <td className="t-op">Overall Progress</td><td colSpan={2} />{tools}
          </tr>
          <tr className="r3">
            <td /><td /><td className="t-k2">Completed</td><td className="t-v2">{t.completed}</td><td colSpan={5} />
            <td className="t-dk2">Project Start</td>
            <td className="t-date"><DateCell value={draft.plannedStart} sep="/" disabled={!editable} label="Project Start"
              onChange={(v) => onDraft({ ...draft, plannedStart: v })} /></td>
            <td colSpan={4} />{tools}
          </tr>
          <tr className="r4">
            <td /><td /><td className="t-k2">In progress</td><td className="t-v2">{t.inProgress}</td><td colSpan={5} />
            <td className="t-dk2">Project End</td>
            <td className={`t-date${draft.plannedStart && draft.plannedEnd && draft.plannedEnd < draft.plannedStart ? ' bad' : ''}`}>
              <DateCell value={draft.plannedEnd} sep="/" disabled={!editable} label="Project End"
                onChange={(v) => onDraft({ ...draft, plannedEnd: v })} /></td>
            <td /><td className="t-opv">{Math.round(t.progress * 100)}%</td><td colSpan={2} />{tools}
          </tr>
          <tr className="r5"><td /><td /><td className="t-k2">Not Started</td><td className="t-v2">{t.notStarted}</td><td colSpan={11} />{tools}</tr>
          <tr className="r6"><td colSpan={15} />{tools}</tr>
          <tr className="hdr"><td />{HEAD.map((h) => <th key={h} scope="col">{h}</th>)}{editable && <th scope="col" aria-label="Row tools" />}</tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <Fragment key={s}>
              <tr className={`sec sec-${KNOWN.has(s) ? s : 'other'}`}>
                <td style={{ background: '#fff' }} /><td colSpan={14}>{s === 'ELECTRICAL' ? `  ${s}` : s === 'MECHANICAL' ? ` ${s}` : s}</td>
                {editable && <td className="tools"><button type="button" title={`Add a line to ${s}`} onClick={() => edit((items) => addItem(items, s))}>+ line</button></td>}
              </tr>
              {draft.items.map((i, n) => (i.section === s
                ? <ItemRows key={i.id ?? `new-${n}`} item={i} index={n} items={draft.items} editable={editable} edit={edit} /> : null))}
            </Fragment>
          ))}
          {editable && (
            <tr className="addline">
              <td /><td colSpan={14}>
                <input aria-label="New section name" style={{ width: 200, borderBottom: '1px solid #9bc2e6' }} value={newSection}
                  placeholder="New section (e.g. SAFETY)" onChange={(e) => setNewSection(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addSection(); }} />
                <button type="button" onClick={addSection} disabled={!newSection.trim()}>+ Add section</button>
              </td><td />
            </tr>
          )}
        </tbody>
      </table>
      <datalist id="ams-cat"><option value="CAT I" /><option value="CAT II" /><option value="CAT III" /><option value="CAT IV" /></datalist>
    </div>
  );
}

function ItemRows({ item: i, index, items, editable, edit }: {
  item: AmItem; index: number; items: AmItem[]; editable: boolean; edit: Edit;
}) {
  const na = i.applicability === 'Not applicable';
  const span = 1 + i.tasks.length;
  const prog = sheetProgress(i);
  const dur = sheetDuration(i);
  const set = (patch: Partial<AmItem>) => edit((it) => patchItem(it, index, patch));
  const badDates = !!i.startDate && !!i.endDate && i.endDate < i.startDate;
  const noStart = !na && (prog ?? 0) > 0 && !i.startDate;
  const ro = !editable;
  const sameAbove = items[index - 1]?.section === i.section, sameBelow = items[index + 1]?.section === i.section;

  return (
    <>
      <tr className={`it${na ? ' na' : ''}`}>
        <td style={{ border: 0 }} rowSpan={span} />
        <td className="c" rowSpan={span}>
          <input aria-label="SN" inputMode="numeric" disabled={ro} value={i.sn ?? ''} style={{ textAlign: 'center' }}
            onChange={(e) => set({ sn: /^\d{1,5}$/.test(e.target.value) ? Number(e.target.value) : null })} />
        </td>
        <td className="desc" rowSpan={span}>
          <textarea aria-label="Equipment description" rows={1} disabled={ro} value={i.description} maxLength={500}
            placeholder={editable ? 'Equipment description' : undefined} onChange={(e) => set({ description: e.target.value })} />
        </td>
        <td className="c" rowSpan={span}>
          <input aria-label="Inspection category" list="ams-cat" disabled={ro} value={i.category} maxLength={40}
            style={{ textAlign: 'center' }} onChange={(e) => set({ category: e.target.value })} />
        </td>
        <td className="c" rowSpan={span}>
          <input aria-label="Interval" disabled={ro} value={i.intervalText} maxLength={60} style={{ textAlign: 'center' }}
            onChange={(e) => set({ intervalText: e.target.value })} />
        </td>
        <td className="c" rowSpan={span}>
          <select aria-label="Inspection status" disabled={ro} value={i.applicability}
            onChange={(e) => set({ applicability: e.target.value as AmItem['applicability'] })}>
            {APPLICABILITY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </td>
        <td className="master">{tasksDoneText(i)}</td>
        <td className="mdone" />
        <td className="c" rowSpan={span}>
          <input aria-label="Responsible" disabled={ro} value={i.responsible} maxLength={120} style={{ textAlign: 'center' }}
            onChange={(e) => set({ responsible: e.target.value })} />
        </td>
        <td className={`c dim${badDates ? ' bad' : noStart ? ' warn' : ''}`} rowSpan={span}>
          <DateCell value={i.startDate} sep="-" disabled={ro || na} label="Start Date" onChange={(v) => set({ startDate: v })} />
        </td>
        <td className={`c dim${badDates ? ' bad' : ''}`} rowSpan={span}>
          <DateCell value={i.endDate} sep="-" disabled={ro || na} label="End Date" onChange={(v) => set({ endDate: v })} />
        </td>
        <td className="c prog" rowSpan={span}>
          {prog !== null && !na && <div className="bar" style={{ width: `calc(${prog * 100}% - 4px)` }} />}
          <span>{prog === null ? '' : `${Math.round(prog * 100)}%`}</span>
        </td>
        <td className="c st" rowSpan={span}>{sheetStatus(i)}</td>
        <td className="c" rowSpan={span}>{dur ?? ''}</td>
        <td className="comments c" rowSpan={span}>
          <textarea aria-label="Comments" rows={1} disabled={ro} value={i.comments} maxLength={2000}
            style={{ textAlign: 'center' }} onChange={(e) => set({ comments: e.target.value })} />
        </td>
        {editable && (
          <td className="tools" rowSpan={span}>
            <button type="button" title="Move line up" disabled={!sameAbove} onClick={() => edit((it) => moveItem(it, index, -1))}>↑</button>
            <button type="button" title="Move line down" disabled={!sameBelow} onClick={() => edit((it) => moveItem(it, index, 1))}>↓</button>
            <button type="button" title="Delete line" onClick={() => edit((it) => removeItem(it, index))}>✕</button>
            <br />
            <button type="button" title="Add a task" onClick={() => edit((it) => addTask(it, index, i.tasks.length - 1))}>+ task</button>
          </td>
        )}
      </tr>
      {i.tasks.map((tk, k) => (
        <tr key={tk.id ?? `t${k}`} className={`tk${k === 0 ? ' first' : ''}`}>
          <td className="task">
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
              <span style={{ whiteSpace: 'nowrap' }}>{tk.seq}.</span>
              <textarea aria-label={`Task ${tk.seq}`} rows={1} disabled={ro} value={tk.description} maxLength={1000}
                onChange={(e) => edit((it) => patchTask(it, index, k, { description: e.target.value }))}
                onKeyDown={(e) => taskKeys(e, () => edit((it) => addTask(it, index, k)))} />
              {editable && (
                <span className="tools" style={{ display: 'inline' }}>
                  <button type="button" title="Insert a task below" onClick={() => edit((it) => addTask(it, index, k))}>+</button>
                  <button type="button" title="Delete task" onClick={() => edit((it) => removeTask(it, index, k))}>✕</button>
                </span>
              )}
            </div>
          </td>
          <td className="c">
            {/* Read-only keeps the teal tick (a disabled box greys it out); only N/A lines disable it, as the sheet blocks them. */}
            <input type="checkbox" aria-label={`Task ${tk.seq} done`} checked={tk.done} disabled={na} aria-readonly={ro || undefined}
              style={ro ? { cursor: 'default' } : undefined}
              title={na ? 'This equipment is marked Not applicable — tasks cannot be ticked.' : undefined}
              onChange={(e) => { if (!ro) edit((it) => patchTask(it, index, k, { done: e.target.checked })); }} />
          </td>
        </tr>
      ))}
    </>
  );
}

/** Alt+Enter in a task inserts the next task, as adding a row in the workbook. */
function taskKeys(e: KeyboardEvent<HTMLTextAreaElement>, add: () => void) {
  if (e.key !== 'Enter' || !e.altKey) return;
  e.preventDefault();
  const row = e.currentTarget.closest('tr');
  add();
  // Move the cursor into the new task, as Excel moves to the inserted row.
  requestAnimationFrame(() => row?.nextElementSibling?.querySelector<HTMLTextAreaElement>('td.task textarea')?.focus());
}

/** A date typed as in Excel ("15-Nov-26", "15/11/2026"; Ctrl+; = today), shown in the sheet's format. */
function DateCell({ value, sep, disabled, label, onChange }: {
  value: string | null; sep: '-' | '/'; disabled: boolean; label: string; onChange: (v: string | null) => void;
}) {
  const [text, setText] = useState(sheetDate(value, sep));
  useEffect(() => { setText(sheetDate(value, sep)); }, [value, sep]);
  const commit = () => {
    const s = text.trim();
    if (!s) { if (value !== null) onChange(null); return; }
    const iso = parseDate(s);
    if (iso) { setText(sheetDate(iso, sep)); if (iso !== value) onChange(iso); } else setText(sheetDate(value, sep));
  };
  return (
    <input aria-label={label} disabled={disabled} value={text} placeholder={disabled ? '' : sep === '/' ? 'd/mmm/yy' : 'd-mmm-yy'}
      title="Type a date, e.g. 15-Nov-26 or 15/11/2026. Ctrl+; = today."
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === ';' && e.ctrlKey) { e.preventDefault(); const d = todayISO(); setText(sheetDate(d, sep)); onChange(d); }
      }} />
  );
}
