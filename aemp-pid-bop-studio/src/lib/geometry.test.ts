import { describe, expect, it } from 'vitest';
import { pipeParts, ports, routeEdge, routeEdgePoints } from './geometry';
import type { Component, Edge } from '../types';
import type { SymbolKey } from './symbols';

const mk = (id: string, type: SymbolKey, x: number, y: number): Component => ({
  id, type, x, y, rot: 0, scale: 1, flip: false,
  tag: '', description: '', section: '', rwp: '', size: '', manufacturer: '', serial: '',
  int_last: '', int_due: '', maj_last: '', maj_due: '', removed: false,
});

const a = mk('a', 'gate', 0, 0);
const b = mk('b', 'gate', 200, 0);

describe('routeEdge', () => {
  it('starts at the explicit source port', () => {
    const e: Edge = { id: 'e', from: 'a', to: 'b', fromPort: 'E', toPort: 'W' };
    const pe = ports(a).E;
    expect(routeEdge(a, b, e).startsWith(`M ${pe.x} ${pe.y}`)).toBe(true);
  });

  it('emits a cubic curve when curved', () => {
    const e: Edge = { id: 'e', from: 'a', to: 'b', curved: true };
    expect(routeEdge(a, b, e)).toContain('C');
  });

  it('routes through stored waypoints', () => {
    const e: Edge = { id: 'e', from: 'a', to: 'b', waypoints: [{ x: 50, y: 60 }] };
    expect(routeEdge(a, b, e)).toContain('L 50 60');
  });

  it('produces an orthogonal path by default', () => {
    const path = routeEdge(a, b);
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain('L');
  });
});

describe('routeEdgePoints', () => {
  it('collapses an aligned run to a straight two-point line (no elbows)', () => {
    // a.E and b.W share the same y → straight pipe
    const e: Edge = { id: 'e', from: 'a', to: 'b', fromPort: 'E', toPort: 'W' };
    expect(routeEdgePoints(a, b, e)).toHaveLength(2);
  });

  it('adds interior bend points when endpoints are offset', () => {
    const c = mk('c', 'gate', 200, 160);
    const e: Edge = { id: 'e', from: 'a', to: 'c', fromPort: 'E', toPort: 'W' };
    expect(routeEdgePoints(a, c, e).length).toBeGreaterThan(2);
  });

  it('is deterministic — depends only on the endpoints, not call context', () => {
    const c = mk('c', 'gate', 160, 160);
    const e: Edge = { id: 'e', from: 'a', to: 'c' };
    expect(routeEdgePoints(a, c, e)).toEqual(routeEdgePoints(a, c, e));
  });
});

describe('pipeParts', () => {
  it('a straight run is one segment with no elbow fittings', () => {
    const parts = pipeParts([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(parts.segments).toHaveLength(1);
    expect(parts.elbows).toHaveLength(0);
  });

  it('an L-route yields separate segments split by an elbow fitting', () => {
    const parts = pipeParts([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    expect(parts.elbows).toHaveLength(1);      // one bend → one fitting
    expect(parts.segments).toHaveLength(2);    // segment → elbow → segment
    // the elbow is trimmed out of the straight run (segment stops before corner)
    expect(parts.segments[0][1]).not.toEqual({ x: 100, y: 0 });
  });
});
