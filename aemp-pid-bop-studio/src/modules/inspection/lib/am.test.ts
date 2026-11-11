import { describe, expect, it } from 'vitest';
import { blankContract, catIvState, daysBetween, derivedStatus, nextCatIvYear, payment, type AmItem, type AmPlan } from './am';

const plan = (o: Partial<AmPlan> = {}): AmPlan => ({
  id: 'p', rigId: 'r', title: 'Rig1 AM-2026', year: 2026, status: 'Planning',
  plannedStart: '2026-11-06', plannedEnd: '2026-11-12', actualStart: null, actualEnd: null,
  includesCatIv: false, notes: '', revision: 1, sourceFile: '', lastImportedAt: null, finalizedAt: null,
  allowedDays: 5, rateBasis: 'reduced', ratePercent: 80, overrunRatePercent: 0, dailyRate: 1000, currency: 'OMR', ...o,
});

describe('payment', () => {
  it('pays allowed days at the contract rate and over-run days at the over-run rate', () => {
    const p = payment(plan(), '2026-01-01');
    expect(p).toMatchObject({ days: 7, source: 'planned', withinDays: 5, overrunDays: 2 });
    expect(p.earned).toBe(4000);
    expect(p.fullRate).toBe(7000);
    expect(p.loss).toBe(3000);
  });

  it('uses actual dates and counts a running AM up to today', () => {
    const p = payment(plan({ actualStart: '2026-11-06', rateBasis: 'full', ratePercent: 100 }), '2026-11-08');
    expect(p).toMatchObject({ days: 3, source: 'actual', earned: 3000, loss: 0 });
  });

  it('has no money figures without a daily rate', () => {
    expect(payment(plan({ dailyRate: null }), '2026-01-01')).toMatchObject({ days: 7, earned: null, loss: null });
  });
});

describe('dates, status, CAT IV', () => {
  it('counts days inclusively', () => {
    expect(daysBetween('2026-11-06', '2026-11-12')).toBe(7);
    expect(daysBetween('2026-11-12', '2026-11-06')).toBeNull();
    expect(daysBetween(null, '2026-11-06')).toBeNull();
  });

  it('derives status from the checklist', () => {
    const i: AmItem = { sn: 1, section: 'DRILLING', description: 'x', category: '', intervalText: '',
      applicability: 'Applicable', responsible: '', startDate: null, endDate: null, status: 'Not Started',
      comments: '', ganttSeq: null, tasks: [{ seq: 1, description: 'a', done: true }, { seq: 2, description: 'b', done: false }] };
    expect(derivedStatus(i)).toBe('In Progress');
    expect(derivedStatus({ ...i, tasks: i.tasks.map((t) => ({ ...t, done: true })) })).toBe('Completed');
    expect(derivedStatus({ ...i, applicability: 'Not applicable' })).toBe('Not applicable');
  });

  it('works out when CAT IV is due', () => {
    const c = { ...blankContract('r'), lastCatIvDate: '2016-03-01', catIvCycleYears: 10 };
    expect(nextCatIvYear(c)).toBe(2026);
    expect(catIvState(c, 2026)).toBe('due');
    expect(catIvState(c, 2025)).toBe('ok');
    expect(catIvState(blankContract('r'), 2026)).toBe('unknown');
  });
});
