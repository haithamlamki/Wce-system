import { describe, expect, it } from 'vitest';
import { certState, groupByCompany, placeLine, statusTone, unavailableMessage, type CertItem } from './vendors';

const item = (companyId: number, status: string): CertItem => ({
  companyId, companyName: `C${companyId}`, city: 'Houston', stateProvince: null, country: 'United States',
  program: 'Monogram', certificationNumber: `N-${companyId}-${status}`, status, statusChangedOn: null,
});

describe('certState', () => {
  it('is none for no listings', () => expect(certState([])).toEqual({ state: 'none' }));
  it('counts active listings case-insensitively', () =>
    expect(certState([item(1, 'Active'), item(1, 'ACTIVE'), item(2, 'Withdrawn')])).toEqual({ state: 'valid', activeCount: 2 }));
  it('is lapsed when nothing is active', () =>
    expect(certState([item(1, 'Expired'), item(2, 'Withdrawn')])).toEqual({ state: 'lapsed', total: 2 }));
});

describe('statusTone', () => {
  it('maps MyCerts statuses to badge tones', () => {
    expect(statusTone('Active')).toBe('success');
    expect(statusTone('Transitioned')).toBe('info');
    expect(statusTone('Suspended')).toBe('warning');
    expect(statusTone('Withdrawn')).toBe('danger');
    expect(statusTone('Something')).toBe('neutral');
  });
});

describe('helpers', () => {
  it('groups listings by company in first-seen order', () => {
    const g = groupByCompany([item(2, 'Active'), item(1, 'Active'), item(2, 'Expired')]);
    expect(g.map((x) => x[0].companyId)).toEqual([2, 1]);
    expect(g[0]).toHaveLength(2);
  });
  it('skips empty place parts', () => expect(placeLine(item(1, 'Active'))).toBe('Houston, United States'));
  it('explains rate limiting separately', () => {
    expect(unavailableMessage('rate-limited').title).toMatch(/limiting/);
    expect(unavailableMessage('unreachable').title).toMatch(/Unable/);
  });
});
