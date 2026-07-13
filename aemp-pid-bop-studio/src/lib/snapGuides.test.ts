import { describe, expect, it } from 'vitest';
import { applySmartSnap, buildSnapSets } from './snapGuides';
import type { Component } from '../types';
import type { SymbolKey } from './symbols';

const mk = (id: string, type: SymbolKey, x: number, y: number): Component => ({
  id, type, x, y, rot: 0, scale: 1, flip: false,
  tag: '', description: '', section: '', rwp: '', size: '', manufacturer: '', serial: '',
  int_last: '', int_due: '', maj_last: '', maj_due: '', removed: false,
});

describe('buildSnapSets', () => {
  it('collects edges + centres of static nodes, skipping excluded/removed', () => {
    const nodes = [mk('a', 'gate', 0, 0), mk('b', 'gate', 100, 100), { ...mk('c', 'gate', 200, 200), removed: true }];
    const sets = buildSnapSets(nodes, new Set(['a']));
    // only node b contributes: 3 x-candidates and 3 y-candidates
    expect(sets.x).toHaveLength(3);
    expect(sets.y).toHaveLength(3);
    expect(sets.x[0].v).toBe(100); // b's left edge
  });
});

describe('applySmartSnap', () => {
  // one static candidate: a vertical line at x=100 spanning y 0..50
  const sets = { x: [{ v: 100, lo: 0, hi: 50 }], y: [{ v: 200, lo: 0, hi: 50 }] };

  it('snaps the nearest moving edge within tolerance and emits a guide', () => {
    const res = applySmartSnap({ minX: 96, minY: 500, maxX: 146, maxY: 540 }, sets, 8);
    expect(res.dx).toBeCloseTo(4); // left edge 96 → 100
    expect(res.dy).toBe(0);        // y candidate at 200 is far away
    expect(res.guides).toHaveLength(1);
    expect(res.guides[0]).toMatchObject({ axis: 'v', pos: 100 });
    // guide spans from the static node down to the moving box
    expect(res.guides[0].lo).toBe(0);
    expect(res.guides[0].hi).toBe(540);
  });

  it('does nothing outside tolerance', () => {
    const res = applySmartSnap({ minX: 60, minY: 500, maxX: 80, maxY: 540 }, sets, 8);
    expect(res.dx).toBe(0);
    expect(res.guides).toHaveLength(0);
  });

  it('snaps centres too, preferring the smallest correction', () => {
    // moving centre = 99 → dx 1 beats left-edge (74 → far)
    const res = applySmartSnap({ minX: 74, minY: 0, maxX: 124, maxY: 40 }, sets, 8);
    expect(res.dx).toBeCloseTo(1);
  });

  it('snaps both axes independently', () => {
    const res = applySmartSnap({ minX: 97, minY: 197, maxX: 147, maxY: 247 }, sets, 8);
    expect(res.dx).toBeCloseTo(3);
    expect(res.dy).toBeCloseTo(3);
    expect(res.guides).toHaveLength(2);
  });
});
