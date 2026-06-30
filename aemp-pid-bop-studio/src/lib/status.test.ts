import { describe, expect, it } from 'vitest';
import { statusOf, summarize } from './status';
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
});

describe('summarize', () => {
  it('rolls up counts by status', () => {
    const counts = summarize([
      mk({ tag: '' }),
      mk({ tag: 'A' }),
      mk({ tag: 'B', int_due: '2025-01-01' }),
      mk({ tag: 'C', int_due: '2026-02-01' }),
    ], ref);
    expect(counts).toEqual({ total: 4, ok: 1, due: 1, over: 1, untag: 1 });
  });
});
