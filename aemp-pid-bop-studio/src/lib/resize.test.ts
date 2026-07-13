import { describe, expect, it } from 'vitest';
import { resizeAnchor, resizePatch, type ResizeStart } from './resize';

// a 100×50 displayed box at (10, 20), unrotated, no prior transforms
const start: ResizeStart = { x: 10, y: 20, scale: 1, sx: 1, sy: 1, rot: 0 };
const box0 = { w: 100, h: 50 };

describe('resizeAnchor', () => {
  it('anchors the opposite corner/edge', () => {
    expect(resizeAnchor('se', 10, 20, box0)).toEqual({ x: 10, y: 20 });
    expect(resizeAnchor('nw', 10, 20, box0)).toEqual({ x: 110, y: 70 });
    expect(resizeAnchor('e', 10, 20, box0)).toEqual({ x: 10, y: 20 });
    expect(resizeAnchor('w', 10, 20, box0)).toEqual({ x: 110, y: 20 });
  });
});

describe('resizePatch — side handles (single-dimension stretch)', () => {
  it('E handle doubles the width via sx, height untouched', () => {
    const anchor = resizeAnchor('e', start.x, start.y, box0);
    const patch = resizePatch('e', start, box0, anchor, 1, { x: 210, y: 45 }, false);
    expect(patch.sx).toBeCloseTo(2);
    expect(patch.sy).toBeCloseTo(1);
    expect(patch.x).toBe(10); // left edge fixed
  });

  it('W handle stretches left and moves x so the right edge stays fixed', () => {
    const anchor = resizeAnchor('w', start.x, start.y, box0); // right edge x=110
    const patch = resizePatch('w', start, box0, anchor, 1, { x: -40, y: 45 }, false);
    expect(patch.sx).toBeCloseTo(1.5); // new width 150
    expect(patch.x).toBeCloseTo(110 - 150);
    expect(patch.y).toBe(20);
  });

  it('N handle stretches height up, bottom edge fixed', () => {
    const anchor = resizeAnchor('n', start.x, start.y, box0); // bottom y=70
    const patch = resizePatch('n', start, box0, anchor, 1, { x: 60, y: -30 }, false);
    expect(patch.sy).toBeCloseTo(2); // new height 100
    expect(patch.y).toBeCloseTo(70 - 100);
    expect(patch.sx).toBeCloseTo(1);
  });

  it('maps a screen-width stretch onto sy when the node is rotated 90°', () => {
    const rotated: ResizeStart = { ...start, rot: 90 };
    const anchor = resizeAnchor('e', start.x, start.y, box0);
    const patch = resizePatch('e', rotated, box0, anchor, 1, { x: 210, y: 45 }, false);
    expect(patch.sy).toBeCloseTo(2); // local height axis shows as screen width
    expect(patch.sx).toBeCloseTo(1);
  });

  it('clamps instead of inverting when the pointer crosses the anchor', () => {
    const anchor = resizeAnchor('e', start.x, start.y, box0);
    const patch = resizePatch('e', start, box0, anchor, 1, { x: -500, y: 45 }, false);
    expect(patch.sx).toBeCloseTo(0.2); // clamp floor, never negative
  });
});

describe('resizePatch — corner handles', () => {
  it('proportional corner drag changes scale only, aspect preserved', () => {
    const anchor = resizeAnchor('se', start.x, start.y, box0); // top-left (10,20)
    const d0 = Math.hypot(100, 50); // pointer starts at the SE corner
    const patch = resizePatch('se', start, box0, anchor, d0, { x: 210, y: 120 }, true);
    expect(patch.scale).toBeCloseTo(2);
    expect(patch.sx).toBeUndefined();
    expect(patch.x).toBe(10);
    expect(patch.y).toBe(20);
  });

  it('NW proportional drag keeps the SE corner fixed', () => {
    const anchor = resizeAnchor('nw', start.x, start.y, box0); // (110, 70)
    const d0 = Math.hypot(100, 50);
    const patch = resizePatch('nw', start, box0, anchor, d0, { x: -90, y: -30 }, true);
    expect(patch.scale).toBeCloseTo(2);
    expect(patch.x).toBeCloseTo(110 - 200);
    expect(patch.y).toBeCloseTo(70 - 100);
  });

  it('free (Shift) corner drag stretches both axes independently', () => {
    const anchor = resizeAnchor('se', start.x, start.y, box0);
    const patch = resizePatch('se', start, box0, anchor, 1, { x: 210, y: 45 }, false);
    expect(patch.sx).toBeCloseTo(2);   // width doubled
    expect(patch.sy).toBeCloseTo(0.5); // height halved
  });
});
