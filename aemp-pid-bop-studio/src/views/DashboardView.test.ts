import { describe, expect, it } from 'vitest';
import { dueStatus } from './DashboardView';

const ref = new Date('2026-01-01T00:00');

describe('dueStatus (F10)', () => {
  it('is "ok" for a date well beyond the window', () => {
    expect(dueStatus('2026-06-01', '', ref).status).toBe('ok');
  });
  it('is "due" within the 60-day window', () => {
    expect(dueStatus('2026-02-15', '', ref).status).toBe('due');
  });
  it('is "over" for a past date', () => {
    expect(dueStatus('2025-06-01', '', ref).status).toBe('over');
  });
  it('is "none" when neither date is present', () => {
    expect(dueStatus('', '', ref).status).toBe('none');
  });

  it('an unparseable due date is never "ok" — it counts as "over" (non-compliant)', () => {
    expect(dueStatus('31/12/2025', '', ref).status).toBe('over');
  });
  it('an unparseable date dominates even when the other date is far in the future', () => {
    expect(dueStatus('not-a-date', '2030-01-01', ref).status).toBe('over');
  });
});
