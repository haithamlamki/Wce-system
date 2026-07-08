import { describe, expect, it } from 'vitest';
import { AuthRaceGuard } from './authRace';

describe('AuthRaceGuard', () => {
  it('lets the latest start win when results resolve out of order', () => {
    const guard = new AuthRaceGuard();
    const tokenA = guard.start(); // sign-in A begins
    const tokenB = guard.start(); // sign-in B begins before A resolves
    // B resolves first — its result is current and should be applied.
    expect(guard.isCurrent(tokenB)).toBe(true);
    // A resolves after B — it is now stale and must be discarded.
    expect(guard.isCurrent(tokenA)).toBe(false);
  });

  it('applies a result when nothing superseded it', () => {
    const guard = new AuthRaceGuard();
    const token = guard.start();
    expect(guard.isCurrent(token)).toBe(true);
  });

  it('invalidate() (sign-out) discards any in-flight load', () => {
    const guard = new AuthRaceGuard();
    const token = guard.start(); // a profile load is kicked off
    guard.invalidate();          // sign-out fires before it resolves
    expect(guard.isCurrent(token)).toBe(false);
  });

  it('a fresh start after invalidate is current again', () => {
    const guard = new AuthRaceGuard();
    const stale = guard.start();
    guard.invalidate();
    const fresh = guard.start();
    expect(guard.isCurrent(stale)).toBe(false);
    expect(guard.isCurrent(fresh)).toBe(true);
  });
});
