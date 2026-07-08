import { describe, expect, it } from 'vitest';
import { canEditForRole } from './roles';

describe('canEditForRole', () => {
  it('allows admin and manager', () => {
    expect(canEditForRole('admin')).toBe(true);
    expect(canEditForRole('manager')).toBe(true);
  });
  it('denies field', () => {
    expect(canEditForRole('field')).toBe(false);
  });
  it('denies null (role still loading, or profile fetch failed)', () => {
    expect(canEditForRole(null)).toBe(false);
  });
});
