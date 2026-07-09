import { describe, expect, it } from 'vitest';
import { STATUS_COLOR, STATUS_LABEL, statusOf, summarize } from './status';
import type { Component } from '../types';
import type { SymbolKey } from './symbols';

const ref = new Date('2026-01-01T00:00');
const mk = (over: Partial<Component>): Component => ({
  id: 'n', type: 'gate' as SymbolKey, x: 0, y: 0, rot: 0, scale: 1, flip: false,
  tag: '', description: '', section: '', rwp: '', size: '', manufacturer: '', serial: '',
  int_last: '', int_due: '', maj_last: '', maj_due: '', removed: false, ...over,
});

describe('statusOf', () => {
  it('untagged when no tag', () => expect(statusOf({ tag: '' }, ref)).toBe('untag'));
  it('in-date when tagged with no dates', () => expect(statusOf({ tag: 'A' }, ref)).toBe('ok'));
  it('overdue when a due date is in the past', () => expect(statusOf({ tag: 'A', int_due: '2025-06-01' }, ref)).toBe('over'));
  it('due-soon within the 60-day window', () => expect(statusOf({ tag: 'A', int_due: '2026-02-15' }, ref)).toBe('due'));
  it('in-date beyond the window', () => expect(statusOf({ tag: 'A', int_due: '2026-06-01' }, ref)).toBe('ok'));
  it('takes the worst of two dates (due wins over ok)', () =>
    expect(statusOf({ tag: 'A', int_due: '2026-06-01', maj_due: '2026-02-01' }, ref)).toBe('due'));
  it('overdue dominates a far-future date', () =>
    expect(statusOf({ tag: 'A', int_due: '2030-01-01', maj_due: '2024-01-01' }, ref)).toBe('over'));
  it('respects a custom window', () =>
    expect(statusOf({ tag: 'A', int_due: '2026-03-01' }, ref, 90)).toBe('due'));

  it('an unparseable due date is "invalid", not a silent "ok" (F10)', () =>
    expect(statusOf({ tag: 'A', int_due: '31/12/2025' }, ref)).toBe('invalid'));
  it('a valid past-due ISO date is still "over"', () =>
    expect(statusOf({ tag: 'A', int_due: '2020-01-01' }, ref)).toBe('over'));
  it('empty due dates are untouched by the NaN guard (ok/untag as before)', () => {
    expect(statusOf({ tag: 'A' }, ref)).toBe('ok');
    expect(statusOf({ tag: '' }, ref)).toBe('untag');
  });
  it('invalid dominates alongside a valid date (worst-of includes invalid)', () =>
    expect(statusOf({ tag: 'A', int_due: 'not-a-date', maj_due: '2026-06-01' }, ref)).toBe('invalid'));
});

describe('summarize', () => {
  it('rolls up counts by status', () => {
    const counts = summarize([
      mk({ tag: '' }),
      mk({ tag: 'A' }),
      mk({ tag: 'B', int_due: '2025-01-01' }),
      mk({ tag: 'C', int_due: '2026-02-01' }),
    ], ref);
    expect(counts).toEqual({ total: 4, ok: 1, due: 1, over: 1, untag: 1, invalid: 0 });
  });

  it('counts an invalid-date row', () => {
    const counts = summarize([
      mk({ tag: 'A', int_due: '31/12/2025' }),
      mk({ tag: 'B', int_due: '2026-06-01' }),
    ], ref);
    expect(counts).toEqual({ total: 2, ok: 1, due: 0, over: 0, untag: 0, invalid: 1 });
  });
});

describe('STATUS_LABEL / STATUS_COLOR', () => {
  it('define an entry for the invalid status', () => {
    expect(STATUS_LABEL.invalid).toBe('Invalid Date');
    expect(STATUS_COLOR.invalid).toBeTruthy();
  });
});
