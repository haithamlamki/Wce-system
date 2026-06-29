import { describe, expect, it } from 'vitest';
import { validate } from './validation';
import type { Component, Edge, Project } from '../types';
import type { SymbolKey } from './symbols';

const mk = (id: string, type: SymbolKey, x: number, y: number, extra: Partial<Component> = {}): Component => ({
  id, type, x, y, rot: 0, scale: 1, flip: false,
  tag: '', description: '', section: '', rwp: '', size: '', manufacturer: '', serial: '',
  int_last: '', int_due: '', maj_last: '', maj_due: '', removed: false, ...extra,
});

const proj = (nodes: Component[], edges: Edge[] = []): Project => ({
  meta: { rig: 'R', date: '2026-01-01', who: '' },
  nodes, edges, pipes: [], bop: { datum: 0, rt: 8.5, unit: 'm', items: [] }, rewards: { spent: 0, redeemed: [] },
});

describe('validate', () => {
  it('flags overlapping components', () => {
    const issues = validate(proj([mk('a', 'gate', 0, 0, { tag: 'A' }), mk('b', 'gate', 10, 10, { tag: 'B' })]));
    expect(issues.some((i) => i.kind === 'overlap')).toBe(true);
  });

  it('is clean for well-separated components', () => {
    const issues = validate(proj([mk('a', 'gate', 0, 0, { tag: 'A' }), mk('b', 'gate', 500, 500, { tag: 'B' })]));
    expect(issues).toHaveLength(0);
  });

  it('flags a dangling edge', () => {
    const issues = validate(proj([mk('a', 'gate', 0, 0, { tag: 'A' })], [{ id: 'e', from: 'a', to: 'ghost' }]));
    expect(issues.some((i) => i.kind === 'dangling' && i.severity === 'error')).toBe(true);
  });

  it('flags duplicate links between the same pair', () => {
    const nodes = [mk('a', 'gate', 0, 0, { tag: 'A' }), mk('b', 'gate', 400, 0, { tag: 'B' })];
    const edges: Edge[] = [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'a' }];
    expect(validate(proj(nodes, edges)).some((i) => i.kind === 'duplicate')).toBe(true);
  });

  it('flags an untagged BOP-stack item', () => {
    const issues = validate(proj([mk('a', 'annular', 0, 0)]));
    expect(issues.some((i) => i.kind === 'untagged')).toBe(true);
  });

  it('ignores removed components for overlap', () => {
    const issues = validate(proj([mk('a', 'gate', 0, 0, { tag: 'A', removed: true }), mk('b', 'gate', 5, 5, { tag: 'B' })]));
    expect(issues.some((i) => i.kind === 'overlap')).toBe(false);
  });
});
