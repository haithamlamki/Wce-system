import { describe, expect, it } from 'vitest';
import { choosePlanSheet, cleanResponsible, diffPlans, guessRig, parseDate, parsePlanSheet, type Cell } from './amImport';
import { breakdown, type AmItem } from './am';
import { planSheetAoa } from './amExport';

// Synthetic sheet in the workbook's layout (columns B..R as in the office file).
const H = ['', 'SN', 'Equipment Description', 'Inspection Category', 'Interval', 'Inspection Status', 'Scope of Work ',
  'Done', 'Responsible', 'Start Date', 'End Date', 'Progress', 'Status', 'Duration', 'Comments',
  'SOW Master (Helper)', 'Gantt Seq (Helper)', 'Section (Helper)'];
const item = (sn: number, d: string, app: string, status: string, start: Cell, end: Cell, sec: string, resp = 'RM/3rd Party'): Cell[] =>
  ['', sn, d, 'CAT III', '1 Year', app, 'x of y tasks done', '', resp, start, end, 0, status, '', 'note', '1. a', 1, sec];
const task = (t: string, done: boolean): Cell[] => ['', '', '', '', '', '', t, done];

const SHEET: Cell[][] = [
  ['', '', 'Project Name', 'Rig999 AM-2027'],
  ['', '', 'TOTAL TASKS', 3, '', '', '', '', '', 'Duration', 7],
  ['', '', 'Completed', 1, '', '', '', '', '', 'Project Start', 46332],
  ['', '', 'In progress', 1, '', '', '', '', '', 'Project End', '12-Nov-26'],
  [], [],
  H,
  ['', 'DRILLING'],
  item(1, 'MAST CAT III', 'Applicable', 'Completed', 46323, 46325, 'DRILLING'),
  task('1. Perform MPI.', true), task('2. Check bolts.', true),
  item(2, 'STABBING BOARD', 'Not applicable', 'Not applicable', '', '', 'DRILLING'),
  task('1. Visual check.', false),
  ['', 'MECHANICAL'],
  item(3, 'MUD PUMP', 'Applicable', 'In Progress', '7-Nov-26', '9-Nov-26', 'MECHANICAL', 'TDS Eng / RM/ Driller'),
  task('1. Open fluid end.', true), task('2. Replace liners.', false),
  ['', '  ELECTRICAL'],
  item(4, 'VFD HOUSE', 'Completed Offline', '', 'soon', '', ''),
  task('1. Clean.', false),
];

describe('parsePlanSheet', () => {
  const p = parsePlanSheet(SHEET);

  it('reads the header block', () => {
    expect(p.title).toBe('Rig999 AM-2027');
    expect(p.year).toBe(2027);
    expect(p.plannedStart).toBe('2026-11-06');
    expect(p.plannedEnd).toBe('2026-11-12');
    expect(p.reported).toEqual({ totalTasks: 3, completed: 1 });
  });

  it('reads items, sections and checklists', () => {
    expect(p.items.map((i) => i.description)).toEqual(['MAST CAT III', 'STABBING BOARD', 'MUD PUMP', 'VFD HOUSE']);
    expect(p.items.map((i) => i.section)).toEqual(['DRILLING', 'DRILLING', 'MECHANICAL', 'ELECTRICAL']);
    expect(p.items[0]).toMatchObject({ startDate: '2026-10-28', endDate: '2026-10-30', status: 'Completed' });
    expect(p.items[0].tasks).toEqual([
      { seq: 1, description: 'Perform MPI.', done: true }, { seq: 2, description: 'Check bolts.', done: true }]);
    expect(p.items[2]).toMatchObject({ startDate: '2026-11-07', endDate: '2026-11-09', responsible: 'TDS Eng/RM/Driller' });
  });

  it('marks not-applicable lines and derives a missing status', () => {
    expect(p.items[1].status).toBe('Not applicable');
    expect(p.items[3].status).toBe('Not Started');
    expect(p.items[3].applicability).toBe('Completed Offline');
  });

  it('warns about unreadable dates instead of failing', () => {
    expect(p.warnings.some((w) => w.message.includes('"soon"'))).toBe(true);
  });

  it('progress matches the workbook rule (average over applicable lines)', () => {
    const b = breakdown(p.items);
    expect(b.total).toBe(3);
    expect(b.notApplicable).toBe(1);
    expect(b.completed).toBe(1);
    expect(b.inProgress).toBe(1);
    // "Completed Offline" counts as done, as in the sheet's Overall Progress formula
    expect(b.progress).toBeCloseTo((1 + 0.5 + 1) / 3);
  });

  it('rejects a sheet without a plan header', () => {
    expect(() => parsePlanSheet([['a', 'b'], ['c']])).toThrow(/header row/);
  });
});

describe('helpers', () => {
  it('parses two-digit-year dates', () => {
    expect(parseDate('6/Nov/26')).toBe('2026-11-06');
    expect(parseDate('28-Oct-26')).toBe('2026-10-28');
    expect(parseDate('nope')).toBeNull();
  });

  it('cleans responsible names', () => {
    expect(cleanResponsible(' CE /  VFD Eng. ')).toBe('CE/VFD Eng.');
  });

  it('picks the Maintenance Plan sheet', () => {
    expect(choosePlanSheet([{ name: 'Summary', aoa: [['x']] }, { name: 'Maintenance Plan', aoa: SHEET }])).toBe(SHEET);
    expect(() => choosePlanSheet([{ name: 'Lists', aoa: [['x']] }])).toThrow();
  });

  it('guesses the rig from the project name', () => {
    const rigs = [{ id: 'a', name: 'Rig 99' }, { id: 'b', name: 'Rig 999' }, { id: 'c', name: 'Hoist 12' }];
    expect(guessRig('Rig999 AM-2027', rigs)?.id).toBe('b');
    expect(guessRig('Rig 99 AM-2027', rigs)?.id).toBe('a');
    expect(guessRig('Unknown AM-2027', rigs)).toBeUndefined();
  });

  it('round-trips through the export layout', () => {
    const p = parsePlanSheet(SHEET);
    const plan = { id: 'x', rigId: 'r', title: p.title, year: 2027, status: 'Planning' as const,
      plannedStart: p.plannedStart, plannedEnd: p.plannedEnd, actualStart: null, actualEnd: null,
      allowedDays: 7, rateBasis: 'full' as const, ratePercent: 100, overrunRatePercent: 0, dailyRate: null,
      currency: 'OMR' as const, includesCatIv: false, notes: '', revision: 1, sourceFile: '', lastImportedAt: null, finalizedAt: null };
    const back = parsePlanSheet(planSheetAoa(plan, p.items));
    expect(back.title).toBe(p.title);
    expect(back.plannedStart).toBe(p.plannedStart);
    const strip = (i: AmItem) => ({ ...i, ganttSeq: null, comments: '' });
    expect(back.items.map(strip))
      .toEqual(p.items.map(strip));
  });

  it('diffs a new revision against the stored plan', () => {
    const before = parsePlanSheet(SHEET).items;
    const after = parsePlanSheet(SHEET).items;
    after[2].tasks[1].done = true; after[2].status = 'Completed';
    after.splice(3, 1);
    after.push({ ...after[0], description: 'NEW LINE', tasks: [] });
    const d = diffPlans(before, after);
    expect(d.added).toEqual(['NEW LINE']);
    expect(d.removed).toEqual(['VFD HOUSE']);
    expect(d.changed).toEqual(['MUD PUMP']);
    expect(d.tasksDone).toBe(1);
  });
});
