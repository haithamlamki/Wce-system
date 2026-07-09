import { describe, expect, it } from 'vitest';
import { haversineKm } from './MapView';

describe('haversine distance (no external routing — approved decision)', () => {
  it('Muscat to Salalah is roughly 860 km straight-line', () => {
    const muscat: [number, number] = [23.588, 58.383];
    const salalah: [number, number] = [17.019, 54.089];
    const d = haversineKm(muscat, salalah);
    expect(d).toBeGreaterThan(800);
    expect(d).toBeLessThan(900);
  });

  it('zero distance for identical points', () => {
    expect(haversineKm([21, 57], [21, 57])).toBe(0);
  });
});
