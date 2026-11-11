import { describe, expect, it } from 'vitest';
import type { AmItem } from './am';
import {
  addItem, addTask, blankItem, finalizeItems, moveItem, patchItem, removeTask, sheetDate, sheetDuration, sheetProgress,
  sheetStatus, sheetTotals, sheetYear, tasksDoneText, validateSheet, type SheetDraft,
} from './amSheet';

// Synthetic lines only.
const line = (o: Partial<AmItem> & { done?: boolean[] }): AmItem => ({
  ...blankItem(o.section ?? 'DRILLING', o.sn ?? 1), description: 'X', ...o,
  tasks: (o.done ?? []).map((d, n) => ({ seq: n + 1, description: `t${n + 1}`, done: d })),
});

describe('sheet formulas', () => {
  it('status follows column M', () => {
    expect(sheetStatus(line({ applicability: 'Not applicable', done: [true] }))).toBe('Not applicable');
    expect(sheetStatus(line({ applicability: 'Completed Offline', done: [false] }))).toBe('Completed');
    expect(sheetStatus(line({ done: [true, true] }))).toBe('Completed');
    expect(sheetStatus(line({ done: [true, false] }))).toBe('In Progress');
    expect(sheetStatus(line({ done: [false] }))).toBe('Not Started');
    expect(sheetStatus(line({ done: [] }))).toBe('Not Started');
  });

  it('progress, tasks done and duration', () => {
    const i = line({ done: [true, false, false, true], startDate: '2026-11-06', endDate: '2026-11-08' });
    expect(sheetProgress(i)).toBe(0.5);
    expect(sheetProgress(line({ done: [] }))).toBeNull();
    expect(tasksDoneText(i)).toBe('2 of 4 tasks done');
    expect(sheetDuration(i)).toBe(3);
    expect(sheetDuration({ ...i, applicability: 'Not applicable' })).toBeNull();
  });

  it('header totals match the Overall Progress rule', () => {
    const d: SheetDraft = { rigId: 'r', title: 'Rig999 AM-2027', plannedStart: '2026-11-06', plannedEnd: '2026-11-12', items: [
      line({ done: [true, true] }), line({ done: [true, false] }), line({ applicability: 'Completed Offline', done: [false] }),
      line({ applicability: 'Not applicable', done: [false] }), line({ done: [false] }),
    ] };
    const t = sheetTotals(d);
    expect(t).toMatchObject({ totalTasks: 4, completed: 2, inProgress: 1, notStarted: 1, duration: 7 });
    expect(t.progress).toBeCloseTo((1 + 0.5 + 1 + 0) / 4);
  });

  it('takes the year from the project name, then the start date', () => {
    const d: SheetDraft = { rigId: '', title: 'Rig305 AM-2026', plannedStart: '2025-12-30', plannedEnd: null, items: [] };
    expect(sheetYear(d, '2024-01-01')).toBe(2026);
    expect(sheetYear({ ...d, title: 'Rig 305 AM' }, '2024-01-01')).toBe(2025);
    expect(sheetYear({ ...d, title: 'Rig 305', plannedStart: null }, '2024-01-01')).toBe(2024);
  });

  it('formats dates as the workbook', () => {
    expect(sheetDate('2026-11-06', '/')).toBe('6/Nov/26');
    expect(sheetDate('2026-10-28', '-')).toBe('28-Oct-26');
    expect(sheetDate(null, '-')).toBe('');
  });
});

describe('sheet edits', () => {
  const items = [line({ sn: 1, section: 'DRILLING' }), line({ sn: 2, section: 'DRILLING' }), line({ sn: 3, section: 'ELECTRICAL' })];

  it('adds a line at the end of its section with the next SN', () => {
    const out = addItem(items, 'DRILLING');
    expect(out.map((i) => i.section)).toEqual(['DRILLING', 'DRILLING', 'DRILLING', 'ELECTRICAL']);
    expect(out[2].sn).toBe(4);
    expect(addItem(items, 'MECHANICAL').map((i) => i.section)).toEqual(['DRILLING', 'DRILLING', 'MECHANICAL', 'ELECTRICAL']);
    expect(addItem(items, 'SAFETY').slice(-1)[0].section).toBe('SAFETY');
  });

  it('moves only within a section', () => {
    expect(moveItem(items, 1, -1).map((i) => i.sn)).toEqual([2, 1, 3]);
    expect(moveItem(items, 1, 1)).toBe(items);
  });

  it('clears dates and ticks when a line becomes not applicable', () => {
    const one = [line({ done: [true], startDate: '2026-11-06', endDate: '2026-11-07' })];
    const out = patchItem(one, 0, { applicability: 'Not applicable' })[0];
    expect(out).toMatchObject({ startDate: null, endDate: null });
    expect(out.tasks[0].done).toBe(false);
  });

  it('inserts and removes tasks, renumbering them', () => {
    const one = [line({ done: [false, false] })];
    expect(addTask(one, 0, 0)[0].tasks.map((t) => [t.seq, t.description])).toEqual([[1, 't1'], [2, ''], [3, 't2']]);
    expect(removeTask(one, 0, 0)[0].tasks.map((t) => [t.seq, t.description])).toEqual([[1, 't2']]);
  });

  it('finalizes: computed status, trimmed text, empty tasks dropped', () => {
    const i = { ...line({ done: [true] }), description: '  MUD PUMP ' };
    i.tasks.push({ seq: 2, description: '   ', done: false });
    const [out] = finalizeItems([i]);
    expect(out).toMatchObject({ description: 'MUD PUMP', status: 'Completed' });
    expect(out.tasks).toHaveLength(1);
  });
});

describe('validateSheet', () => {
  const ok: SheetDraft = { rigId: 'r', title: 'Rig999 AM-2027', plannedStart: '2026-11-06', plannedEnd: '2026-11-12', items: [line({})] };

  it('passes a complete sheet', () => { expect(validateSheet(ok)).toEqual([]); });

  it('applies the workbook data validation', () => {
    const msgs = validateSheet({ ...ok, rigId: '', title: ' ', plannedEnd: '2026-11-01', items: [
      line({ description: '', startDate: '2019-12-31', endDate: '2019-12-01' }),
    ] }).map((x) => x.message);
    expect(msgs).toEqual(expect.arrayContaining([
      'Choose the rig.', 'Enter the project name.', 'Project End is before Project Start.',
      'Equipment description is empty.', 'Start Date must be on or after 1 Jan 2020.', 'End Date is before Start Date.',
    ]));
    expect(validateSheet({ ...ok, items: [] }).map((x) => x.message)).toContain('Add at least one equipment line.');
  });
});
