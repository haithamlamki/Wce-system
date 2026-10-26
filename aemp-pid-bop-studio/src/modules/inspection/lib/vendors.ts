// ============================================================================
//  Vendor Companies + API MyCerts — pure helpers (no I/O). Mirrors the
//  reference's certification badge rules and status colouring.
// ============================================================================

export interface VendorCompany { id: string; name: string; source: 'Manual' | 'Imported'; isActive: boolean }

export interface CertItem {
  companyId: number; companyName: string; city: string | null; stateProvince: string | null;
  country: string | null; program: string | null; certificationNumber: string; status: string;
  statusChangedOn: string | null;
}

export interface CertResult {
  available: boolean; items: CertItem[]; totalCount: number;
  reason: 'rate-limited' | 'unreachable' | null; stale: boolean; asOf: string | null;
}

export type CertState =
  | { state: 'none' }
  | { state: 'valid'; activeCount: number }
  | { state: 'lapsed'; total: number };

/** Certified when at least one listing is Active; lapsed when all are something else. */
export function certState(items: Pick<CertItem, 'status'>[]): CertState {
  if (items.length === 0) return { state: 'none' };
  const activeCount = items.filter((i) => i.status.toLowerCase() === 'active').length;
  return activeCount > 0 ? { state: 'valid', activeCount } : { state: 'lapsed', total: items.length };
}

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export function statusTone(status: string): StatusTone {
  switch (status.toLowerCase()) {
    case 'active': return 'success';
    case 'applicant': case 'transitioned': return 'info';
    case 'suspended': case 'inactive': return 'warning';
    case 'expired': case 'cancelled': case 'canceled': case 'withdrawn': return 'danger';
    default: return 'neutral';
  }
}

export function unavailableMessage(reason: CertResult['reason']): { title: string; body: string } {
  return reason === 'rate-limited'
    ? { title: 'MyCerts is limiting requests right now.', body: 'Please wait a minute and try again. This does not affect saving.' }
    : { title: 'Unable to fetch the company certifications list.',
      body: 'The certification service (API MyCerts) could not be reached right now. This does not affect saving the company — try again later.' };
}

/** One group per MyCerts company, in first-seen order. */
export function groupByCompany(items: CertItem[]): CertItem[][] {
  const m = new Map<number, CertItem[]>();
  for (const i of items) m.set(i.companyId, [...(m.get(i.companyId) ?? []), i]);
  return [...m.values()];
}

export function placeLine(i: Pick<CertItem, 'city' | 'stateProvince' | 'country'>): string {
  return [i.city, i.stateProvince, i.country].filter(Boolean).join(', ');
}
