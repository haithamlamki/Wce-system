import { describe, expect, it } from 'vitest';
import { buildMaster } from './aemp';
import { validate } from './validation';
import { box } from './geometry';
import type { Project } from '../types';

function projOf(nodes: Project['nodes'], pipes: Project['pipes']): Project {
  return { meta: { rig: 'Rig 305', date: '2026-01-01', who: '' }, nodes, edges: [], pipes, bop: { datum: 0, rt: 8.5, unit: 'm', items: [] }, rewards: { spent: 0, redeemed: [] } };
}

describe('relaxOverlaps via buildMaster', () => {
  it('clears overlaps from the Rig 305 master', () => {
    const { nodes, pipes } = buildMaster();
    const overlaps = validate(projOf(nodes, pipes)).filter((i) => i.kind === 'overlap');
    expect(overlaps.length).toBe(0);
  });

  it('has no validation issues at all (overlaps cleared, BOP stack tagged)', () => {
    const { nodes, pipes } = buildMaster();
    expect(validate(projOf(nodes, pipes))).toHaveLength(0);
  });

  it('keeps every component visible (scale not collapsed)', () => {
    const { nodes } = buildMaster();
    expect(nodes.every((n) => (n.scale ?? 1) >= 0.4)).toBe(true);
  });

  it('preserves component centres within a small tolerance of the source', () => {
    // centre = top-left + box/2; relax shrinks about-centre, so the centre of an
    // un-nudged item should barely move. Check the BOP annular (isolated, tag-less).
    const { nodes } = buildMaster();
    const annular = nodes.find((n) => n.type === 'annular');
    expect(annular).toBeTruthy();
    const cx = annular!.x + box(annular!).w / 2;
    // source centre for the annular is x:1684 (from the template)
    expect(Math.abs(cx - 1684)).toBeLessThan(20);
  });
});
