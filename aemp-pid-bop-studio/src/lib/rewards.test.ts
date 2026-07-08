import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, rewardStats, tierOf } from './rewards';
import type { Component, Project } from '../types';
import type { SymbolKey } from './symbols';

const ref = new Date('2026-01-01T00:00');
const mk = (over: Partial<Component>): Component => ({
  id: 'n', type: 'gate' as SymbolKey, x: 0, y: 0, rot: 0, scale: 1, flip: false,
  tag: '', description: '', section: '', rwp: '', size: '', manufacturer: '', serial: '',
  int_last: '', int_due: '', maj_last: '', maj_due: '', removed: false, ...over,
});
const proj = (over: Partial<Project>): Project => ({
  meta: { rig: 'R', date: '2026-01-01', who: '' }, nodes: [], edges: [], pipes: [],
  bop: { datum: 0, rt: 8.5, unit: 'm', items: [] }, rewards: { spent: 0, redeemed: [] }, ...over,
});

describe('rewardStats', () => {
  it('scores points from tags, dates, in-date items, BOP and master piping', () => {
    const s = rewardStats(proj({
      nodes: [mk({ tag: 'A', int_due: '2027-01-01' })],
      pipes: [[0, 0, 1, 1, '#000']],
      bop: { datum: 0, rt: 8.5, unit: 'm', items: [{ id: 'b', type: 'annular' as SymbolKey, tag: 'B1', description: '', height: 1.5 }] },
    }), ref);
    // 10 (tag) + 5 (dates) + 8 (in-date) + 30 (bop) + 50 (master) = 103
    expect(s.pts).toBe(103);
    expect(s.tagged).toBe(1);
    expect(s.comp).toBe(1);
  });
  it('is zero for an empty project', () => {
    expect(rewardStats(proj({}), ref).pts).toBe(0);
  });
});

describe('tierOf', () => {
  it('maps points to tiers', () => {
    expect(tierOf(0).n).toBe('Bronze');
    expect(tierOf(300).n).toBe('Silver');
    expect(tierOf(3500).n).toBe('Diamond');
  });
});

describe('achievements', () => {
  it('unlocks First Tag at one tagged item', () => {
    const first = ACHIEVEMENTS.find((a) => a.id === 'first')!;
    const s = rewardStats(proj({ nodes: [mk({ tag: 'A' })] }), ref);
    expect(first.on(s)).toBe(true);
  });

  it('does not award All Clear while an invalid-dated item is outstanding (F10)', () => {
    const clear = ACHIEVEMENTS.find((a) => a.id === 'clear')!;
    const s = rewardStats(proj({ nodes: [mk({ tag: 'A', int_due: '31/12/2025' })] }), ref);
    expect(s.invalid).toBe(1);
    expect(s.over).toBe(0);
    expect(clear.on(s)).toBe(false);
  });

  it('awards All Clear once there are no overdue or invalid items', () => {
    const clear = ACHIEVEMENTS.find((a) => a.id === 'clear')!;
    const s = rewardStats(proj({ nodes: [mk({ tag: 'A', int_due: '2027-01-01' })] }), ref);
    expect(clear.on(s)).toBe(true);
  });
});
