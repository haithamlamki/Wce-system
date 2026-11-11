import { describe, expect, it } from 'vitest';
import type { AmItem } from './am';
import { barCells, fmt, ganttOrder, ganttRange, MAX_DAYS } from './amGantt';

const item = (p: Partial<AmItem>): AmItem => ({
  sn: 1, section: 'DRILLING', description: 'X', category: '', intervalText: '', applicability: 'Applicable',
  responsible: '', startDate: null, endDate: null, status: 'Not Started', comments: '', ganttSeq: null, tasks: [], ...p,
});
const tasks = (done: number, total: number): AmItem['tasks'] =>
  Array.from({ length: total }, (_, k) => ({ seq: k + 1, description: `t${k}`, done: k < done }));

describe('ganttOrder', () => {
  it('orders by Gantt Seq, keeps unsequenced lines after, drops N/A', () => {
    const rows = ganttOrder([
      item({ description: 'a' }), item({ description: 'b', ganttSeq: 2 }),
      item({ description: 'c', ganttSeq: 1 }), item({ description: 'na', applicability: 'Not applicable' }),
    ]);
    expect(rows.map((r) => r.description)).toEqual(['c', 'b', 'a']);
  });
});

describe('ganttRange', () => {
  it('spans whole Sun–Sat weeks from the first date to the last', () => {
    const { days, clipped } = ganttRange([item({ startDate: '2026-11-04', endDate: '2026-11-10' })], null, null, '2026-11-11');
    expect(days[0]).toBe('2026-11-01'); // Sunday
    expect(days[days.length - 1]).toBe('2026-11-14'); // Saturday
    expect(clipped).toBe(false);
  });
  it('keeps the AM window in view when the plan is longer than the cap', () => {
    const { days, clipped } = ganttRange(
      [item({ startDate: '2026-01-05', endDate: '2026-01-06' }), item({ startDate: '2026-11-06', endDate: '2026-11-12' })],
      '2026-11-06', '2026-11-12', '2026-11-11');
    expect(days).toHaveLength(MAX_DAYS);
    expect(days).toContain('2026-11-12');
    expect(clipped).toBe(true);
  });
});

describe('barCells', () => {
  const days = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'];
  it('fills round(duration × progress) days from the start', () => {
    const c = barCells(item({ startDate: '2026-11-06', endDate: '2026-11-09', status: 'In Progress', tasks: tasks(1, 2) }), days, '2026-11-01');
    expect(c[0]).toBeNull();
    expect(c.slice(1).map((x) => x?.fill)).toEqual(['prog', 'prog', null, null]);
    expect(c[1]?.start).toBe(true);
    expect(c[4]?.end).toBe(true);
  });
  it('is red when the end date passed unfinished, green when completed', () => {
    const late = barCells(item({ startDate: '2026-11-06', endDate: '2026-11-07', status: 'In Progress', tasks: tasks(1, 2) }), days, '2026-11-11');
    expect(late[1]?.fill).toBe('late');
    const done = barCells(item({ startDate: '2026-11-06', endDate: '2026-11-06', status: 'Completed', tasks: tasks(1, 1) }), days, '2026-11-11');
    expect(done[1]?.fill).toBe('done');
  });
  it('has no bar without dates', () => {
    expect(barCells(item({}), days, '2026-11-11').every((x) => x === null)).toBe(true);
  });
});

it('formats dates as the sheet (d-Mmm-yy)', () => expect(fmt('2026-10-04')).toBe('4-Oct-26'));
