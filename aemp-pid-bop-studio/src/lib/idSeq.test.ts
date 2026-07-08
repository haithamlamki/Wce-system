import { describe, expect, it } from 'vitest';
import { idTail, nextBopSeqSeed, nextSeqSeed } from './idSeq';
import type { Project } from '../types';

const emptyProject = (): Project => ({
  meta: { rig: 'Rig 305', date: '2026-01-01', who: '' },
  nodes: [],
  edges: [],
  pipes: [],
  bop: { datum: 0, rt: 8.5, unit: 'm', items: [] },
  rewards: { spent: 0, redeemed: [] },
});

describe('idTail', () => {
  it('parses the trailing integer of an id', () => {
    expect(idTail('n1042')).toBe(1042);
    expect(idTail('e17')).toBe(17);
    expect(idTail('g3')).toBe(3);
  });
  it('returns null for ids without a numeric tail', () => {
    expect(idTail('custom_symbol')).toBe(null);
    expect(idTail('')).toBe(null);
  });
});

describe('nextSeqSeed', () => {
  it('seeds past the highest numeric suffix across nodes/edges', () => {
    const p = emptyProject();
    p.nodes = [{ id: 'n1000' } as Project['nodes'][number]];
    p.edges = [{ id: 'e1005' } as Project['edges'][number]];
    expect(nextSeqSeed(p, 1000)).toBeGreaterThan(1005);
  });
  it('also scans annotations', () => {
    const p = emptyProject();
    p.annotations = [{ id: 'g2000' } as NonNullable<Project['annotations']>[number]];
    expect(nextSeqSeed(p, 1000)).toBeGreaterThan(2000);
  });
  it('also scans node groupIds — a group id shares the same seq counter (F-idSeq)', () => {
    const p = emptyProject();
    p.nodes = [{ id: 'n1', groupId: 'g3000' } as Project['nodes'][number]];
    expect(nextSeqSeed(p, 1000)).toBeGreaterThan(3000);
  });
  it('ignores nodes with no groupId', () => {
    const p = emptyProject();
    p.nodes = [{ id: 'n1' } as Project['nodes'][number]];
    expect(nextSeqSeed(p, 1000)).toBe(1000);
  });
  it('leaves the counter as-is for an empty project', () => {
    expect(nextSeqSeed(emptyProject(), 1000)).toBe(1000);
  });
  it('never lowers the counter, even if loaded ids are smaller', () => {
    const p = emptyProject();
    p.nodes = [{ id: 'n5' } as Project['nodes'][number]];
    expect(nextSeqSeed(p, 1000)).toBe(1000);
  });
  it('ignores ids without a numeric tail', () => {
    const p = emptyProject();
    p.nodes = [{ id: 'custom_abc' } as Project['nodes'][number]];
    expect(nextSeqSeed(p, 1000)).toBe(1000);
  });
  it('returns current for a null/undefined project', () => {
    expect(nextSeqSeed(null, 1000)).toBe(1000);
    expect(nextSeqSeed(undefined, 1000)).toBe(1000);
  });
});

describe('nextBopSeqSeed', () => {
  it('seeds past the highest b-id', () => {
    expect(nextBopSeqSeed([{ id: 'b1' }, { id: 'b12' }], 1)).toBe(13);
  });
  it('leaves the counter as-is for no items', () => {
    expect(nextBopSeqSeed([], 1)).toBe(1);
    expect(nextBopSeqSeed(undefined, 1)).toBe(1);
  });
  it('never lowers the counter', () => {
    expect(nextBopSeqSeed([{ id: 'b2' }], 50)).toBe(50);
  });
});
