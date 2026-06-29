import { describe, expect, it } from 'vitest';
import { ports, routeEdge } from './geometry';
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
